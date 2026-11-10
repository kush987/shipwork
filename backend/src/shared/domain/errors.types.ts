export interface ValidationIssue {
  nodeId?: string;
  edgeId?: string;
  /** Form field the issue is about (e.g. `name`, `policy`). */
  field?: string;
  message: string;
}
