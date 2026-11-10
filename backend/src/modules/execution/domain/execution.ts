import { StepJob } from './execution.types';

/** The same node of the same execution is never scheduled twice; implementations dedupe on this id. */
export const stepJobId = (job: StepJob) => `${job.executionId}__${job.nodeId}`;
