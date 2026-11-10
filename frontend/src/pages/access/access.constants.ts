import type { SegmentedOption } from '../../components/Segmented.types';
import type { Policy } from '../../api/types';
import type { AccessTab, DecisionFilter, PolicyEditorMode, RoleForm, SubjectKind } from './access.types';

export const ACCESS_TABS: SegmentedOption<AccessTab>[] = [
  { value: 'roles', label: 'Roles' },
  { value: 'check', label: 'Check access' },
  { value: 'audit', label: 'Audit log' },
];
export const DEFAULT_TAB: AccessTab = 'roles';
/** `?tab=` keeps the open tab in the URL, so it survives reloads and can be linked to. */
export const TAB_PARAM = 'tab';

export const EDITOR_MODES: SegmentedOption<PolicyEditorMode>[] = [
  { value: 'matrix', label: 'Permissions' },
  { value: 'json', label: 'Advanced (JSON)' },
];

export const BLANK_ROLE_FORM: RoleForm = { name: '', description: '' };

/** Placeholder of the policy editor: an allow plus a deny on some resources. */
export const EXAMPLE_POLICY: Policy = {
  statements: [
    { effect: 'allow', actions: ['workflows:*', 'executions:read'], resources: ['*'] },
    { effect: 'deny', actions: ['workflows:publish'], resources: ['workflow:wf_pay*'], description: 'Payment workflows are published by owners' },
  ],
};

export const NOT_IN_MATRIX_NOTE =
  'This policy uses deny rules, resource patterns or descriptions the permission grid can’t show, so it opens as JSON.';

/** Missing actions listed by name in a role's summary; more become a count. */
export const SUMMARY_MAX_LISTED = 4;

export const LIST_FORMAT = new Intl.ListFormat('en', { type: 'conjunction' });

export const SUBJECT_KINDS: SegmentedOption<SubjectKind>[] = [
  { value: 'member', label: 'Member' },
  { value: 'role', label: 'Role' },
];

export const DECISION_FILTERS: SegmentedOption<DecisionFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'allowed', label: 'Allowed' },
  { value: 'denied', label: 'Denied' },
];

/** Typing in the action filter waits this long before asking the server. */
export const ACTION_FILTER_DELAY_MS = 300;
export const AUDIT_PAGE_SIZE = 50;
