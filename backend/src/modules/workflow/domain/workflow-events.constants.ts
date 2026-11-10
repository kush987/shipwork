/** Domain events the workflow module publishes; other modules (e.g. schedules) react to them. */
export const WORKFLOW_EVENTS = {
  published: 'workflow.published',
  archived: 'workflow.archived',
} as const;
