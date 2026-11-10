import { escapeRegExp } from 'lodash';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Workflow, WorkflowVersion } from '../domain/workflow.entity';
import { WorkflowRepository, WorkflowVersionRepository } from '../domain/workflow.repository';
import { WorkflowDoc, WorkflowVersionDoc } from './workflow.schema';
import { toWorkflow, toWorkflowVersion } from './workflow.mapper';

@Injectable()
export class MongoWorkflowRepository extends WorkflowRepository {
  constructor(@InjectModel(WorkflowDoc.name) private readonly model: Model<WorkflowDoc>) {
    super();
  }

  async save(workflow: Workflow) {
    const { id, ...props } = workflow.toJSON();
    await this.model.replaceOne({ _id: id, tenantId: props.tenantId }, props, { upsert: true });
  }

  async findById(tenantId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean();
    return doc ? toWorkflow(doc) : null;
  }

  async list(tenantId: string) {
    const docs = await this.model.find({ tenantId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).lean();
    return docs.map(toWorkflow);
  }

  async findPublishedByTrigger(tenantId: string, event: string) {
    // Paused workflows are skipped: their events and record changes start nothing.
    const docs = await this.model.find({ tenantId, status: 'published', triggerEvent: event, paused: { $ne: true } }).lean();
    return docs.map(toWorkflow);
  }

  count(tenantId: string, filter: { status?: string } = {}) {
    return this.model.countDocuments({ tenantId, status: filter.status ?? { $ne: 'archived' } });
  }

  async tenantsWithTriggerPrefix(prefix: string) {
    return (await this.model.distinct('tenantId', { status: 'published', triggerEvent: { $regex: `^${escapeRegExp(prefix)}` } })).map(String);
  }
}

@Injectable()
export class MongoWorkflowVersionRepository extends WorkflowVersionRepository {
  constructor(@InjectModel(WorkflowVersionDoc.name) private readonly model: Model<WorkflowVersionDoc>) {
    super();
  }

  async save(version: WorkflowVersion) {
    const { id, ...props } = version.toJSON();
    await this.model.replaceOne({ _id: id, tenantId: props.tenantId }, props, { upsert: true });
  }

  async find(tenantId: string, workflowId: string, version: number) {
    const doc = await this.model.findOne({ tenantId, workflowId, version }).lean();
    return doc ? toWorkflowVersion(doc) : null;
  }

  async findDraft(tenantId: string, workflowId: string) {
    const doc = await this.model.findOne({ tenantId, workflowId, status: 'draft' }).lean();
    return doc ? toWorkflowVersion(doc) : null;
  }

  async listSummaries(tenantId: string, workflowId: string) {
    const docs = await this.model
      .find({ tenantId, workflowId }, { definition: 0 })
      .sort({ version: -1 })
      .lean();
    return docs.map((d) => toWorkflowVersion({ ...d, definition: { nodes: [], edges: [] } }));
  }
}
