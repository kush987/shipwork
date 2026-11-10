import type { OptionsSource, ConfigField } from '../../nodes/domain/workflow-node.types';

/**
 * Checks that a setting pointing at another resource (an event, a data collection…) still points
 * at something that exists. Each resource type contributes one checker, so publishing validation
 * grows by adding a class rather than another branch in WorkflowService (Open/Closed).
 */
export interface ReferenceChecker {
  readonly sources: OptionsSource[];
  /** A problem description, or null when the value is fine. */
  check(tenantId: string, value: string, field: ConfigField): Promise<string | null>;
}
