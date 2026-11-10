import { InvalidOperationError } from '../../../shared/domain/errors';

/** The workflow is published but paused: nothing may start it until it is resumed. */
export class WorkflowPausedError extends InvalidOperationError {
  constructor(name: string) {
    super(`Workflow “${name}” is paused — resume it to run it`);
  }
}
