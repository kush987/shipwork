import { request } from '../http';
import type {
  CreateWorkflowInput,
  CreateWorkflowResult,
  DuplicateWorkflowInput,
  TestRunInput,
  TestRunResult,
  ValidateResult,
  Workflow,
  WorkflowDefinition,
  WorkflowDetail,
  WorkflowTemplate,
  WorkflowVersion,
} from '../types';

export const workflowsApi = {
  listWorkflows: () => request<Workflow[]>('GET', '/workflows'),
  templates: () => request<WorkflowTemplate[]>('GET', '/workflows/templates'),
  createWorkflow: (body: CreateWorkflowInput) => request<CreateWorkflowResult>('POST', '/workflows', body),
  getWorkflow: (id: string) => request<WorkflowDetail>('GET', `/workflows/${id}`),
  getVersion: (id: string, version: number) => request<WorkflowVersion>('GET', `/workflows/${id}/versions/${version}`),
  saveDraft: (id: string, definition: WorkflowDefinition) =>
    request<WorkflowVersion>('PUT', `/workflows/${id}/draft`, { definition }),
  validate: (id: string, definition: WorkflowDefinition) =>
    request<ValidateResult>('POST', `/workflows/${id}/validate`, { definition }),
  publish: (id: string) => request<WorkflowVersion>('POST', `/workflows/${id}/publish`),
  testRun: (id: string, input: TestRunInput, version?: number) =>
    request<TestRunResult>('POST', `/workflows/${id}/test`, { ...input, version }),
  archiveWorkflow: (id: string) => request<void>('DELETE', `/workflows/${id}`),
  /** Stops every trigger from starting a published workflow, without unpublishing it. */
  pauseWorkflow: (id: string) => request<Workflow>('POST', `/workflows/${id}/pause`),
  resumeWorkflow: (id: string) => request<Workflow>('POST', `/workflows/${id}/resume`),
  /** Copies a workflow under a new name as a new v1 draft workflow. */
  duplicateWorkflow: (id: string, body: DuplicateWorkflowInput) =>
    request<CreateWorkflowResult>('POST', `/workflows/${id}/duplicate`, body),
};
