export interface WorkflowPublishedPayload {
  workflowId: string;
  version: number;
  /** What the workflow now subscribes to (event name, `http.request`, `schedule`). */
  triggerEvent: string;
  /** Settings of the published trigger node (e.g. the schedule). */
  triggerConfig: Record<string, unknown>;
}

export interface WorkflowArchivedPayload {
  workflowId: string;
}
