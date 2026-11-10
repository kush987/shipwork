import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { ExecutionEngine } from '../../execution/application/execution-engine';
import { toScheduleSpec } from '../../nodes/domain/schedule-spec';
import { SCHEDULE_TRIGGER_EVENT } from '../../nodes/domain/triggers.constants';
import { ScheduledRun } from './schedule-registry.types';
import { ScheduleRegistry } from './schedule-registry.ports';
import { WORKFLOW_EVENTS } from '../../workflow/domain/workflow-events.constants';
import { WorkflowArchivedPayload, WorkflowPublishedPayload } from '../../workflow/domain/workflow-events.types';
import { DomainEvent } from '../../../shared/events/domain-events.types';
import { WorkflowPausedError } from '../../workflow/domain/workflow.errors';

/**
 * Keeps schedules in step with publishing: publishing a scheduled workflow (re)registers its timer,
 * publishing it with another trigger or archiving it removes the timer. Each tick starts a run of
 * the version that is live at that moment.
 */
@Injectable()
export class ScheduleTriggerService {
  private readonly logger = new Logger(ScheduleTriggerService.name);

  constructor(
    private readonly registry: ScheduleRegistry,
    private readonly workflows: WorkflowService,
    private readonly engine: ExecutionEngine,
  ) {}

  @OnEvent(WORKFLOW_EVENTS.published, { async: true, promisify: true })
  async onPublished(event: DomainEvent<WorkflowPublishedPayload>) {
    const run = { tenantId: event.tenantId, workflowId: event.payload.workflowId };
    try {
      if (event.payload.triggerEvent === SCHEDULE_TRIGGER_EVENT) {
        const spec = toScheduleSpec(event.payload.triggerConfig);
        await this.registry.register(run, spec);
        this.logger.log({ msg: 'schedule.registered', ...run, schedule: spec.label });
      } else {
        await this.registry.unregister(run);
      }
    } catch (error) {
      this.logger.error({ msg: 'schedule.sync_failed', ...run, error: (error as Error).message });
    }
  }

  @OnEvent(WORKFLOW_EVENTS.archived, { async: true, promisify: true })
  async onArchived(event: DomainEvent<WorkflowArchivedPayload>) {
    await this.registry.unregister({ tenantId: event.tenantId, workflowId: event.payload.workflowId }).catch((error: Error) => {
      this.logger.error({ msg: 'schedule.unregister_failed', workflowId: event.payload.workflowId, error: error.message });
    });
  }

  /**
   * One tick of a schedule. Stale timers (workflow archived or no longer scheduled) remove themselves;
   * a paused workflow's timer keeps ticking but starts nothing, so resuming needs no re-registering.
   */
  async fire(run: ScheduledRun, firedAt = new Date()) {
    const live = await this.workflows.resolvePublished(run.tenantId, run.workflowId).catch((error: unknown) => (error instanceof WorkflowPausedError ? 'paused' : null));
    if (live === 'paused') {
      this.logger.log({ msg: 'schedule.skipped_paused', ...run });
      return null;
    }
    const props = live?.workflow.toJSON();
    if (!live || props?.triggerEvent !== SCHEDULE_TRIGGER_EVENT) {
      await this.registry.unregister(run);
      this.logger.warn({ msg: 'schedule.stale_removed', ...run });
      return null;
    }
    return this.engine.start({
      tenantId: run.tenantId,
      workflowId: run.workflowId,
      workflowName: props.name,
      workflowVersion: live.version.version,
      definition: live.version.definition,
      trigger: { event: SCHEDULE_TRIGGER_EVENT, data: { firedAt: firedAt.toISOString() } },
      shipmentId: null,
      mode: 'schedule',
    });
  }
}
