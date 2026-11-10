// Builder IAM: roles built on policies, the access check (simulator) and the audit log.

export type PolicyEffect = 'allow' | 'deny';

/**
 * One rule of a role's policy. Actions are `<area>:<verb>` (e.g. `workflows:publish`), resources
 * `<type>:<id>` (e.g. `workflow:wf_pay*`); both accept `*` wildcards.
 */
export interface PolicyStatement {
  effect: PolicyEffect;
  actions: string[];
  resources: string[];
  description?: string;
}

/** Default deny: an action needs a matching allow, and any matching deny wins. */
export interface Policy {
  statements: PolicyStatement[];
}

export interface AccessAction {
  action: string;
  label: string;
  description: string;
}

/** A part of the app (workflows, members…) with the actions a role can be given on it. */
export interface AccessArea {
  area: string;
  label: string;
  /** Resource type the actions apply to, e.g. `workflow` (resources are `workflow:<id>`). */
  resource: string;
  actions: AccessAction[];
}

export interface AccessCatalog {
  areas: AccessArea[];
}

export interface RoleRef {
  id: string;
  name: string;
}

/** A workspace role: built-in (owner, editor, viewer — read-only) or custom (`role_…`). */
export interface Role extends RoleRef {
  description: string;
  builtIn: boolean;
  policy: Policy;
  memberCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RoleInput {
  name: string;
  description?: string;
  policy: Policy;
}

/** Ask what a member (or anyone with a role) may do. `resource` defaults to `<type>:*`. */
export interface SimulateInput {
  action: string;
  resource?: string;
  userId?: string;
  roleId?: string;
}

export interface SimulateResult {
  allowed: boolean;
  reason: string;
  /** The policy statement that decided, or null when nothing matched (denied by default). */
  statement: number | null;
  role: RoleRef;
}

/** The signed-in member's role in the active workspace and every action it allows. */
export interface AccessMe {
  role: RoleRef;
  allowed: string[];
}

export type AuditDecision = 'allowed' | 'denied';

export interface AuditEvent {
  id: string;
  at: string;
  actor: { userId: string; email: string } | null;
  action: string;
  resource: string;
  method: string;
  path: string;
  decision: AuditDecision;
  status: number | null;
  reason?: string;
  ip: string;
}

export interface AuditQuery {
  limit?: number;
  /** Events older than this time (ISO), for the next page. */
  before?: string;
  actor?: string;
  decision?: AuditDecision;
  /** Action prefix, e.g. `workflows:` or `workflows:publish`. */
  action?: string;
}

export interface AuditPage {
  items: AuditEvent[];
  /** Pass as `before` for older events; null when there are none. */
  nextBefore: string | null;
}

/** The audit log's filters (everything but paging). */
export type AuditFilters = Pick<AuditQuery, 'actor' | 'decision' | 'action'>;
