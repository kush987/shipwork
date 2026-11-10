import { ScheduledRun } from './schedule-registry.types';
import type { ScheduleSpec } from '../../nodes/domain/schedule-spec.types';

/**
 * Port for keeping one recurring timer per published scheduled workflow. BullMQ job schedulers
 * implement it (durable, shared by all workers, exactly one fire per tick across instances).
 */
export abstract class ScheduleRegistry {
  abstract register(run: ScheduledRun, spec: ScheduleSpec): Promise<void>;
  abstract unregister(run: ScheduledRun): Promise<void>;
}
