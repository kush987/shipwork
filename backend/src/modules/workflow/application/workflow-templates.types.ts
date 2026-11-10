import { WorkflowDefinition } from '../domain/workflow-definition.types';

/**
 * A workflow a template creates alongside its main one, for its Run workflow steps to call. Created as
 * a draft named "<main name> · <name>"; the main workflow's steps point at it through `partRef(key)`.
 */
export interface TemplatePart {
  key: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
  parts?: TemplatePart[];
}

/** A workflow created for a template part: what the create call reports back. */
export interface CreatedPart {
  key: string;
  id: string;
  name: string;
}
