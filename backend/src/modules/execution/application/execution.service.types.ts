import { Execution, NodeExecution } from '../domain/execution.types';

export type ExecutionView = Omit<Execution, 'definition' | 'pendingSteps'> & { nodeExecutions: NodeExecution[] };
