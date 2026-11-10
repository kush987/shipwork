import { isPlainObject } from 'lodash-es';
import type { AccessAction, AccessArea, AuditFilters, Member, Policy, Role, SimulateInput } from '../../api/types';
import { isReadAction, wildcardMatch } from '../../auth/auth.helpers';
import { ACCESS_TABS, DEFAULT_TAB, LIST_FORMAT, SUMMARY_MAX_LISTED } from './access.constants';
import type { AccessTab, DecisionFilter, PolicySummary, SimulationForm } from './access.types';

export const parseTab = (value: string | null): AccessTab => ACCESS_TABS.find((t) => t.value === value)?.value ?? DEFAULT_TAB;

/** `workflows:publish` for an action of the catalog (the API may name the verb alone or the full action). */
export const actionId = (area: AccessArea, a: AccessAction) => (a.action.includes(':') ? a.action : `${area.area}:${a.action}`);

export const areaActionIds = (area: AccessArea) => area.actions.map((a) => actionId(area, a));

export const allActionIds = (areas: AccessArea[]) => areas.flatMap(areaActionIds);

/** Resource a check of `action` covers when none is given: every resource of the action's type. */
export function defaultResource(areas: AccessArea[], action: string): string {
  const area = areas.find((a) => areaActionIds(a).includes(action));
  return area ? `${area.resource}:*` : '*';
}

/** Whether `policy` allows `action` on `resource`: default deny, any matching deny wins (as on the server). */
export function evaluatePolicy(policy: Policy, action: string, resource: string): boolean {
  const matching = policy.statements.filter(
    (s) => s.actions.some((p) => wildcardMatch(p, action)) && s.resources.some((p) => wildcardMatch(p, resource)),
  );
  return matching.some((s) => s.effect === 'allow') && !matching.some((s) => s.effect === 'deny');
}

/** Catalog actions the policy allows on every resource of their type. */
export const allowedActionIds = (policy: Policy, areas: AccessArea[]) =>
  areas.flatMap((area) => areaActionIds(area).filter((id) => evaluatePolicy(policy, id, `${area.resource}:*`)));

/**
 * The actions to tick when the matrix can show `policy` exactly — allow rules on every resource naming
 * catalog actions, whole areas (`workflows:*`) or everything (`*`) — else null (edit it as JSON).
 */
export function matrixFromPolicy(policy: Policy, areas: AccessArea[]): string[] | null {
  const known = new Set(allActionIds(areas));
  const areaWildcards = new Set(areas.map((a) => `${a.area}:*`));
  const fits = policy.statements.every(
    (s) =>
      s.effect === 'allow' &&
      !s.description &&
      s.resources.length > 0 &&
      s.resources.every((r) => r === '*') &&
      s.actions.every((a) => a === '*' || known.has(a) || areaWildcards.has(a)),
  );
  return fits ? allowedActionIds(policy, areas) : null;
}

/**
 * The ticks that grant what `policy` grants today, when its rules apply to every resource — used to view a
 * role and to copy one into a new role (a copy may spell deny rules as an explicit allow list). Null when
 * some rules apply to specific resources only.
 */
export const effectiveTicks = (policy: Policy, areas: AccessArea[]): string[] | null =>
  policy.statements.every((s) => s.resources.every((r) => r === '*')) ? allowedActionIds(policy, areas) : null;

/** The matrix as a policy: one allow statement on every resource; fully ticked areas become `<area>:*`. */
export function policyFromMatrix(checked: string[], areas: AccessArea[]): Policy {
  const on = new Set(checked);
  const actions = areas.flatMap((area) => {
    const ids = areaActionIds(area);
    const ticked = ids.filter((id) => on.has(id));
    return ids.length > 0 && ticked.length === ids.length ? [`${area.area}:*`] : ticked;
  });
  return { statements: actions.length ? [{ effect: 'allow', actions, resources: ['*'] }] : [] };
}

/** "Publish workflows", or the label alone when it already names the area ("Read audit log"). */
export function actionPhrase(area: AccessArea, a: AccessAction): string {
  const label = a.label.toLowerCase();
  return label.includes(area.label.toLowerCase()) ? label : `${label} ${area.label.toLowerCase()}`;
}

function phrasesOf(ids: string[], areas: AccessArea[]): string[] {
  return areas.flatMap((area) => area.actions.filter((a) => ids.includes(actionId(area, a))).map((a) => actionPhrase(area, a)));
}

const listed = (phrases: string[]) => LIST_FORMAT.format(phrases);

/** What a role allows, in plain words: "Everything", "Everything except manage members and …", "View everything, change nothing". */
export function policySummary(policy: Policy, areas: AccessArea[]): PolicySummary {
  const scoped = policy.statements.some((s) => s.resources.some((r) => r !== '*'));
  const all = allActionIds(areas);
  const allowed = new Set(allowedActionIds(policy, areas));
  const missing = all.filter((id) => !allowed.has(id));
  const text = (() => {
    if (!all.length) return '';
    if (!allowed.size) return 'No permissions';
    if (!missing.length) return 'Everything';
    if ([...allowed].every(isReadAction)) {
      const unseen = missing.filter(isReadAction);
      if (!unseen.length) return 'View everything, change nothing';
      if (unseen.length <= SUMMARY_MAX_LISTED) return `View everything except ${listed(phrasesOf(unseen, areas).map(stripVerb))}; change nothing`;
      return `View only (${allowed.size} of ${all.length} permissions)`;
    }
    if (missing.length <= SUMMARY_MAX_LISTED) return `Everything except ${listed(phrasesOf(missing, areas))}`;
    return `${allowed.size} of ${all.length} permissions`;
  })();
  return { text, scoped };
}

/** "read audit log" → "audit log": in a view-only summary the verb is implied. */
const stripVerb = (phrase: string) => phrase.replace(/^(read|view)\s+/, '');

/** A policy the editor can send: an object with a `statements` list (the server checks the rest). */
export function policyShapeProblem(value: unknown): string | undefined {
  if (value === undefined) return 'Enter the policy';
  if (!isPlainObject(value) || !Array.isArray((value as Policy).statements)) return 'The policy needs a "statements" list: { "statements": [ … ] }';
  return undefined;
}

/** The statement a simulation names (an index into the role's statements), when the policy is known. */
export const statementAt = (roles: Role[] | undefined, roleId: string, index: number | null) =>
  index === null ? undefined : roles?.find((r) => r.id === roleId)?.policy.statements[index];

export function simulationInput(form: SimulationForm): SimulateInput {
  const resource = form.resource.trim();
  return {
    action: form.action,
    ...(resource ? { resource } : {}),
    ...(form.kind === 'member' ? { userId: form.subject } : { roleId: form.subject }),
  };
}

/** Why the simulator can't run yet, or undefined. */
export function simulationProblem(form: SimulationForm): string | undefined {
  if (!form.subject) return form.kind === 'member' ? 'Pick a member' : 'Pick a role';
  if (!form.action) return 'Pick an action';
  return undefined;
}

export const auditFilters = (actor: string, decision: DecisionFilter, action: string): AuditFilters => ({
  ...(actor ? { actor } : {}),
  ...(decision !== 'all' ? { decision } : {}),
  ...(action.trim() ? { action: action.trim() } : {}),
});

export const memberLabel = (m: Pick<Member, 'name' | 'email'>) => (m.name ? `${m.name} · ${m.email}` : m.email);
