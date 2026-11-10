import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/redis/redis.constants';
import { newId } from '../../../shared/domain/id';
import { runsWorker } from '../../../config/configuration';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { ExecutionEngine } from '../../execution/application/execution-engine';
import { NodeResolver } from '../../nodes/node-resolver';
import { RecordChangeEvent, RecordChangeFeed, RecordChangeSubscription } from '../../data/domain/record-change-feed.ports';
import { RECORD_TRIGGER_PREFIX } from '../../nodes/domain/triggers.constants';
import { WORKFLOW_EVENTS } from '../../workflow/domain/workflow-events.constants';
import type { DomainEvent } from '../../../shared/events/domain-events.types';
import type { WorkflowArchivedPayload, WorkflowPublishedPayload } from '../../workflow/domain/workflow-events.types';
import { triggeredExecutionId } from '../event-trigger.service';
import { triggerData, triggerWants } from './record-trigger.matching';
import { FEED_LEASE_MS, FEED_REOPEN_MS, FEED_RENEW_MS, FEED_SYNC_MS, MAX_RECORD_RUNS_PER_MINUTE, REDIS_KEYS } from './record-trigger.constants';

interface Feed {
  subscription: RecordChangeSubscription;
  lease: string;
  renew: NodeJS.Timeout;
}

/**
 * Starts “Record changed” workflows. Each workspace with one gets a change feed on its database;
 * exactly one worker process holds it at a time (a Redis lease it renews), and it resumes where it
 * stopped after a restart (the resume point is saved after every change). Each change starts each
 * matching published workflow once — a change delivered again gets the same execution id.
 */
@Injectable()
export class RecordTriggerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RecordTriggerService.name);
  private readonly feeds = new Map<string, Feed>();
  /** Workspaces whose feed failed to open recently, so the sync doesn't hammer them (and logs once). */
  private readonly backoff = new Map<string, number>();
  private sync?: NodeJS.Timeout;
  private stopping = false;

  constructor(
    private readonly workflows: WorkflowService,
    private readonly nodes: NodeResolver,
    private readonly engine: ExecutionEngine,
    private readonly changes: RecordChangeFeed,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap() {
    if (!runsWorker()) return;
    void this.syncAll();
    this.sync = setInterval(() => void this.syncAll(), FEED_SYNC_MS);
    this.sync.unref();
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.sync) clearInterval(this.sync);
    await Promise.all([...this.feeds.keys()].map((tenantId) => this.close(tenantId)));
  }

  @OnEvent(WORKFLOW_EVENTS.published, { async: true, promisify: true })
  async onPublished(event: DomainEvent<WorkflowPublishedPayload>) {
    if (runsWorker() && (event.payload.triggerEvent.startsWith(RECORD_TRIGGER_PREFIX) || this.feeds.has(event.tenantId))) await this.syncTenant(event.tenantId);
  }

  @OnEvent(WORKFLOW_EVENTS.archived, { async: true, promisify: true })
  async onArchived(event: DomainEvent<WorkflowArchivedPayload>) {
    if (runsWorker() && this.feeds.has(event.tenantId)) await this.syncTenant(event.tenantId);
  }

  /** Opens feeds for workspaces that need one (and nobody holds), closes those no longer needed. */
  async syncAll() {
    if (this.stopping) return;
    try {
      const wanted = new Set(await this.workflows.tenantsWithTriggerPrefix(RECORD_TRIGGER_PREFIX));
      for (const tenantId of this.feeds.keys()) if (!wanted.has(tenantId)) await this.close(tenantId);
      for (const tenantId of wanted) await this.open(tenantId);
    } catch (error) {
      this.logger.error({ msg: 'record_feed.sync_failed', error: (error as Error).message });
    }
  }

  private async syncTenant(tenantId: string) {
    const wanted = (await this.workflows.tenantsWithTriggerPrefix(RECORD_TRIGGER_PREFIX)).includes(tenantId);
    if (wanted) await this.open(tenantId);
    else await this.close(tenantId);
  }

  private async open(tenantId: string) {
    if (this.stopping || this.feeds.has(tenantId) || (this.backoff.get(tenantId) ?? 0) > Date.now()) return;
    const lease = newId('lease');
    if ((await this.redis.set(REDIS_KEYS.lease(tenantId), lease, 'PX', FEED_LEASE_MS, 'NX')) !== 'OK') return; // another process has it
    try {
      const resume = await this.redis.get(REDIS_KEYS.resume(tenantId));
      const subscription = await this.changes.open(
        tenantId,
        resume ? JSON.parse(resume) : null,
        (change) => this.handle(tenantId, change),
        (error, resumeLost) => void this.failed(tenantId, error, resumeLost),
      );
      const renew = setInterval(() => void this.renew(tenantId, lease), FEED_RENEW_MS);
      renew.unref();
      this.feeds.set(tenantId, { subscription, lease, renew });
      this.backoff.delete(tenantId);
      this.logger.log({ msg: 'record_feed.opened', tenantId, resumed: !!resume });
    } catch (error) {
      await this.release(tenantId, lease);
      this.backoff.set(tenantId, Date.now() + FEED_SYNC_MS);
      this.logger.warn({ msg: 'record_feed.open_failed', tenantId, error: (error as Error).message });
    }
  }

  /** Keeps the lease while it is still ours; if another process took it, this one lets go. */
  private async renew(tenantId: string, lease: string) {
    const key = REDIS_KEYS.lease(tenantId);
    if ((await this.redis.get(key)) === lease) await this.redis.pexpire(key, FEED_LEASE_MS);
    else await this.close(tenantId, false);
  }

  private async failed(tenantId: string, error: Error, resumeLost: boolean) {
    // Without a replica set there are no change streams: say so once a sync period, not every few seconds.
    const replicaSetMissing = /replica set|\$changeStream/i.test(error.message);
    this.logger[replicaSetMissing ? 'warn' : 'error']({ msg: 'record_feed.stopped', tenantId, error: error.message, resumeLost });
    await this.close(tenantId);
    if (resumeLost) await this.redis.del(REDIS_KEYS.resume(tenantId));
    this.backoff.set(tenantId, Date.now() + (replicaSetMissing ? FEED_SYNC_MS : FEED_REOPEN_MS));
  }

  private async close(tenantId: string, releaseLease = true) {
    const feed = this.feeds.get(tenantId);
    if (!feed) return;
    this.feeds.delete(tenantId);
    clearInterval(feed.renew);
    await feed.subscription.close();
    if (releaseLease) await this.release(tenantId, feed.lease);
  }

  private async release(tenantId: string, lease: string) {
    const key = REDIS_KEYS.lease(tenantId);
    if ((await this.redis.get(key)) === lease) await this.redis.del(key);
  }

  /** One change: start every matching workflow, then remember the change as handled. */
  async handle(tenantId: string, change: RecordChangeEvent) {
    const workflows = await this.workflows.findPublishedByTrigger(tenantId, `${RECORD_TRIGGER_PREFIX}${change.collection}`);
    for (const workflow of workflows) {
      const props = workflow.toJSON();
      try {
        const version = await this.workflows.getVersion(tenantId, workflow.id, props.publishedVersion!);
        const trigger = this.nodes.triggerOf(version.definition);
        if (!trigger || !triggerWants(trigger.node.config ?? {}, change)) continue;
        if (!(await this.withinRate(workflow.id))) {
          this.logger.warn({ msg: 'record_trigger.rate_limited', tenantId, workflowId: workflow.id, perMinute: MAX_RECORD_RUNS_PER_MINUTE });
          continue;
        }
        await this.engine.start({
          id: triggeredExecutionId(change.id, workflow.id),
          tenantId,
          workflowId: workflow.id,
          workflowName: props.name,
          workflowVersion: version.version,
          definition: version.definition,
          trigger: { event: `record.${change.operation}`, data: triggerData(change) },
          shipmentId: null,
          mode: 'trigger',
        });
      } catch (error) {
        // One workflow failing to start must not hold up the others or the feed.
        this.logger.error({ msg: 'record_trigger.start_failed', tenantId, workflowId: workflow.id, change: change.id, error: (error as Error).message });
      }
    }
    await this.redis.set(REDIS_KEYS.resume(tenantId), JSON.stringify(change.resumeToken));
  }

  private async withinRate(workflowId: string) {
    const key = REDIS_KEYS.runs(workflowId, Math.floor(Date.now() / 60_000));
    const runs = await this.redis.incr(key);
    if (runs === 1) await this.redis.expire(key, 120);
    return runs <= MAX_RECORD_RUNS_PER_MINUTE;
  }
}
