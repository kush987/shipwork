import { Workflow, WorkflowVersion } from '../domain/workflow.entity';
import type { WorkflowProps, WorkflowVersionProps } from '../domain/workflow.types';
import type { WorkflowDoc, WorkflowVersionDoc } from './workflow.schema';

/** Workflows saved before pausing existed have no `paused` field: they are not paused. */
export const toWorkflow = ({ _id, ...doc }: WorkflowDoc) =>
  Workflow.restore({ id: _id, ...doc, paused: doc.paused ?? false, pausedAt: doc.pausedAt ?? null } as WorkflowProps);
export const toWorkflowVersion = ({ _id, ...doc }: WorkflowVersionDoc) => WorkflowVersion.restore({ id: _id, ...doc } as WorkflowVersionProps);
