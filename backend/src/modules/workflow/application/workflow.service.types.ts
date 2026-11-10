export interface CreateWorkflowInput {
  name: string;
  description?: string;
  templateId?: string;
}

export interface DuplicateWorkflowInput {
  /** Name of the copy; must differ from the source workflow's name. */
  name: string;
  /** Defaults to the source workflow's description. */
  description?: string;
  /** Version to copy; defaults to the working version (the draft, else the published one). */
  version?: number;
}

/** Name and description of a workflow being created. */
export interface WorkflowMeta {
  name: string;
  description?: string;
}
