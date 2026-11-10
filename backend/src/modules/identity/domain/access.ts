import { pick } from 'lodash';
import { evaluatePolicy, matchesPattern, policyIssues } from '../../../shared/policy/policy';
import type { Policy, PolicyStatement } from '../../../shared/policy/policy.types';
import { ACCESS_CATALOG, ALL_ACTIONS, BUILT_IN_ROLES, RESOURCE_TYPES } from './access.constants';
import type { AccessActionInfo, AccessAreaInfo, RoleDefinition } from './access.types';

export const builtInRole = (id: string): RoleDefinition | undefined => BUILT_IN_ROLES.find((r) => r.id === id);

export const areaOf = (action: string): AccessAreaInfo | undefined => ACCESS_CATALOG.find((a) => action.startsWith(`${a.area}:`));

export const actionInfo = (action: string): AccessActionInfo | undefined => areaOf(action)?.actions.find((a) => a.action === action);

/** The resource for "all of them": what lists and new items are checked against (`workflow:*`). */
export const anyResourceOf = (action: string) => `${areaOf(action)?.resource ?? '*'}:*`;

/** Builder roles apply to whoever has them, so statements have no roles or conditions. */
export const decide = (policy: Policy, action: string, resource: string) => evaluatePolicy(policy, { action, resource, roles: [] });

/** Permissions the policy grants on every resource of their type. */
export const allowedActions = (policy: Policy) => ALL_ACTIONS.filter((action) => decide(policy, action, anyResourceOf(action)).allowed);

/**
 * Permissions the policy could grant on at least one resource: an allow statement names them and
 * no deny takes them away everywhere. Used to stop people handing out more than they have.
 */
export function grantableActions(policy: Policy): string[] {
  const named = (s: PolicyStatement) => (action: string) => s.actions.some((p) => matchesPattern(p, action));
  return ALL_ACTIONS.filter((action) => {
    if (!policy.statements.some((s) => s.effect === 'allow' && named(s)(action))) return false;
    const everywhere = decide(policy, action, anyResourceOf(action));
    return everywhere.allowed || everywhere.statement === null || policy.statements[everywhere.statement].effect !== 'deny';
  });
}

/** What `target` grants that `holder` doesn't have — empty when handing it out is no escalation. */
export const beyond = (target: Policy, holder: Policy) => {
  const held = new Set(allowedActions(holder));
  return grantableActions(target).filter((action) => !held.has(action));
};

/** "Your role (Support) can't publish workflows (workflows:publish on workflow:wf_1)". */
export function denialMessage(roleName: string, action: string, resource: string) {
  const info = actionInfo(action);
  const what = info ? `${info.label.toLowerCase()} ${areaOf(action)!.label.toLowerCase()}` : `do ${action}`;
  return `Your role (${roleName}) can't ${what} (${action} on ${resource})`;
}

const resourceIssue = (resource: string) => {
  if (resource === '*') return null;
  const colon = resource.indexOf(':');
  const type = colon > 0 ? resource.slice(0, colon) : '';
  if (type === '*' || RESOURCE_TYPES.includes(type)) return null;
  return `“${resource}” should look like workflow:* or workflow:wf_123 (types: ${RESOURCE_TYPES.join(', ')})`;
};

/**
 * Problems with a builder role's policy, plus the policy reduced to what builder roles use
 * (effect, actions, resources, description).
 */
export function builderPolicy(raw: unknown): { issues: string[]; policy: Policy } {
  const issues = policyIssues(raw);
  if (issues.length) return { issues, policy: { statements: [] } };
  const statements = (raw as Policy).statements;
  statements.forEach((s, i) => {
    const where = `Statement ${i + 1}`;
    if (s.roles?.length) issues.push(`${where}: leave out roles — a builder role applies to the members who have it`);
    if (s.when?.length) issues.push(`${where}: conditions (when) aren't supported in builder roles`);
    for (const action of s.actions) {
      if (!ALL_ACTIONS.some((known) => matchesPattern(action, known))) issues.push(`${where}: “${action}” matches no permission — e.g. workflows:publish, workflows:*, *:read`);
    }
    for (const resource of s.resources) {
      const issue = resourceIssue(resource);
      if (issue) issues.push(`${where}: ${issue}`);
    }
  });
  return { issues, policy: { statements: statements.map((s) => pick(s, ['effect', 'actions', 'resources', 'description']) as PolicyStatement) } };
}
