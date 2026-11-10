import { Execution, StepJob } from './execution.types';
import type { ExecutionData } from '../../nodes/domain/workflow-node.types';

export abstract class StepScheduler {
  abstract schedule(job: StepJob, delayMs?: number): Promise<void>;
}

/**
 * Port: loads the domain objects a run is about (today: its shipment), so the engine itself stays
 * domain-agnostic. A new domain adds its objects here instead of teaching the engine about them.
 */
export abstract class ExecutionScopeLoader {
  abstract load(execution: Execution): Promise<Pick<ExecutionData, 'shipment'>>;
}
