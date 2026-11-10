/** What a schedule fires with: enough to find the workflow's live version at that moment. */
export interface ScheduledRun {
  tenantId: string;
  workflowId: string;
}
