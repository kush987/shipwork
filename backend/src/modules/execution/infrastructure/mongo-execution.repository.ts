import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExecutionDoc, NodeExecutionDoc } from './execution.schema';
import { ACTIVE_STATUSES, DAY_MS, SHORT_RETENTION_MODES } from '../domain/execution.constants';
import { expiryFor } from '../domain/execution-limits';
import { redactSecrets } from '../../../shared/security/redaction';
import { config, runsWorker } from '../../../config/configuration';

const DUPLICATE_KEY = 11000;
import { Execution, ExecutionFilter, NodeExecution } from '../domain/execution.types';
import { ExecutionRepository } from '../domain/execution.repository';
import type { WorkflowResponse } from '../../nodes/domain/workflow-node.types';
import { toExecution, toExecutionDoc, toNodeExecution, toExecutionQuery, nodeExecutionId, toNodeExecutionDoc } from './execution.mapper';

@Injectable()
export class MongoExecutionRepository extends ExecutionRepository implements OnModuleInit {
  private readonly logger = new Logger(MongoExecutionRepository.name);
  private readonly retention = config.retention;

  constructor(
    @InjectModel(ExecutionDoc.name) private readonly executions: Model<ExecutionDoc>,
    @InjectModel(NodeExecutionDoc.name) private readonly nodeExecutions: Model<NodeExecutionDoc>,
  ) {
    super();
  }

  async create(execution: Execution) {
    try {
      await this.executions.create(toExecutionDoc(execution));
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async findById(tenantId: string, id: string) {
    const doc = await this.executions.findOne({ _id: id, tenantId }).lean();
    return doc ? toExecution(doc) : null;
  }

  async list(tenantId: string, filter: ExecutionFilter, limit: number) {
    const docs = await this.executions.find(toExecutionQuery(tenantId, filter)).sort({ startedAt: -1 }).limit(limit).lean();
    return docs.map(toExecution);
  }

  count(tenantId: string, filter: ExecutionFilter) {
    return this.executions.countDocuments(toExecutionQuery(tenantId, filter));
  }

  async claimNode(id: string, nodeId: string) {
    const res = await this.executions.updateOne(
      { _id: id, status: { $in: ACTIVE_STATUSES }, scheduledNodes: { $ne: nodeId } },
      { $addToSet: { scheduledNodes: nodeId }, $inc: { pendingSteps: 1 } },
    );
    return res.modifiedCount === 1;
  }

  async completeStep(id: string) {
    const doc = await this.executions
      .findOneAndUpdate({ _id: id }, { $inc: { pendingSteps: -1 } }, { new: true, projection: { pendingSteps: 1 } })
      .lean();
    return doc?.pendingSteps ?? 0;
  }

  async attachShipment(id: string, shipmentId: string) {
    await this.executions.updateOne({ _id: id }, { $set: { shipmentId } });
  }

  async mergeContext(id: string, patch: Record<string, unknown>) {
    const entries = Object.entries(patch);
    if (!entries.length) return;
    await this.executions.updateOne(
      { _id: id },
      { $set: Object.fromEntries(entries.map(([key, value]) => [`context.${key}`, value])) },
    );
  }

  async setResponse(id: string, response: WorkflowResponse) {
    // `response: null` also matches runs stored before the field existed.
    const res = await this.executions.updateOne({ _id: id, response: null }, { $set: { response } });
    return res.modifiedCount === 1;
  }

  async setStatus(id: string, status: 'running' | 'waiting') {
    await this.executions.updateOne({ _id: id, status: { $in: ACTIVE_STATUSES } }, { status });
  }

  async finish(id: string, status: 'succeeded' | 'failed', error?: string) {
    const doc = await this.executions.findOne({ _id: id, status: { $in: ACTIVE_STATUSES } }, { startedAt: 1, mode: 1 }).lean();
    if (!doc) return;
    const completedAt = new Date();
    // Retention counts from the end of the run, so a long wait (delay step) never loses history.
    const expiresAt = expiryFor(doc.mode as Execution['mode'], completedAt, this.retention);
    const finished = await this.executions.updateOne(
      { _id: id, status: { $in: ACTIVE_STATUSES } },
      { status, error: error ?? null, completedAt, durationMs: completedAt.getTime() - new Date(doc.startedAt).getTime(), expiresAt },
    );
    if (finished.modifiedCount) {
      await this.nodeExecutions.updateMany({ executionId: id }, { $set: { expiresAt } });
      await this.redactHistory(id);
    }
  }

  /**
   * Once a run is over, its stored history keeps no secrets: passwords, tokens, keys in the
   * request, context and step inputs/outputs are masked (the run already used the real values).
   */
  private async redactHistory(id: string) {
    const run = await this.executions.findById(id, { trigger: 1, context: 1 }).lean();
    if (run) await this.executions.updateOne({ _id: id }, { $set: { trigger: redactSecrets(run.trigger), context: redactSecrets(run.context) } });
    const steps = await this.nodeExecutions.find({ executionId: id }, { input: 1, output: 1 }).lean();
    if (steps.length) {
      await this.nodeExecutions.bulkWrite(
        steps.map((step) => ({ updateOne: { filter: { _id: step._id }, update: { $set: { input: redactSecrets(step.input), output: redactSecrets(step.output) } } } })),
      );
    }
  }

  async saveNodeExecution(n: NodeExecution) {
    // Provisional expiry for steps of runs that are still going; `finish` aligns it with the run.
    // It also covers a step that completes after its run has already finished.
    const expiresAt = new Date(new Date(n.startedAt).getTime() + this.longestRetentionMs());
    await this.nodeExecutions.replaceOne({ _id: nodeExecutionId(n) }, { ...toNodeExecutionDoc(n), expiresAt }, { upsert: true });
  }

  /**
   * Runs saved before retention existed have no expiry; give them one (once — later boots find
   * nothing to do). Only queue-worker roles do it, so HTTP replicas start without the extra work.
   */
  async onModuleInit() {
    if (!runsWorker()) return;
    const ms = (days: number) => days * DAY_MS;
    const executions = await this.executions.collection.updateMany({ expiresAt: null, status: { $nin: ACTIVE_STATUSES } }, [
      {
        $set: {
          expiresAt: {
            $add: [
              { $ifNull: ['$completedAt', '$startedAt'] },
              { $cond: [{ $in: ['$mode', SHORT_RETENTION_MODES] }, ms(this.retention.apiDays), ms(this.retention.defaultDays)] },
            ],
          },
        },
      },
    ]);
    const steps = await this.nodeExecutions.collection.updateMany({ expiresAt: null }, [
      { $set: { expiresAt: { $add: ['$startedAt', this.longestRetentionMs()] } } },
    ]);
    if (executions.modifiedCount || steps.modifiedCount) {
      this.logger.log(`Retention: set an expiry on ${executions.modifiedCount} earlier runs and ${steps.modifiedCount} steps`);
    }
  }

  private longestRetentionMs() {
    return Math.max(this.retention.apiDays, this.retention.defaultDays) * DAY_MS;
  }

  async listNodeExecutions(executionIds: string[]) {
    if (!executionIds.length) return [];
    const docs = await this.nodeExecutions.find({ executionId: { $in: executionIds } }).sort({ startedAt: 1 }).lean();
    return docs.map(toNodeExecution);
  }
}
