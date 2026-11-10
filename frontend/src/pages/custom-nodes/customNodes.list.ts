import type { BuiltinNodeView, CustomNode } from '../../api/types';
import type { ListConfig } from '../../components/list/list.types';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '../../lib/icons.constants';
import { changeSummary } from './builtinNodes.helpers';
import { isClassic } from './customNodes.helpers';

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** Search, sort and filters of the workspace's custom nodes. */
export const CUSTOM_NODE_LIST: ListConfig<CustomNode> = {
  noun: ['custom node', 'custom nodes'],
  searchPlaceholder: 'Search name, type or description',
  searchText: (n) => [n.label, n.type, n.description, ...n.outputs.map((o) => o.label || o.id)].join(' '),
  defaultSort: { key: 'name', dir: 'asc' },
  fields: [
    { key: 'name', label: 'Node', kind: 'text', get: (n) => n.label },
    { key: 'type', label: 'Type', kind: 'text', get: (n) => n.type },
    {
      key: 'format',
      label: 'Format',
      kind: 'enum',
      quick: true,
      get: (n) => (isClassic(n) ? 'classic' : 'simple'),
      options: [
        { value: 'simple', label: 'Simple' },
        { value: 'classic', label: 'Classic' },
      ],
    },
    { key: 'branches', label: 'Branches', kind: 'number', get: (n) => (n.outputs.length > 1 ? n.outputs.length : 0) },
    { key: 'failed', label: 'Failed branch', kind: 'enum', get: (n) => (n.errorBranch ? 'yes' : 'no'), options: YES_NO },
    { key: 'settings', label: 'Settings', kind: 'number', get: (n) => n.configSchema.length },
    { key: 'version', label: 'Version', kind: 'number', get: (n) => n.latestVersion },
    { key: 'updated', label: 'Updated', kind: 'date', get: (n) => n.updatedAt },
    { key: 'created', label: 'Created', kind: 'date', get: (n) => n.createdAt },
  ],
};

/** Search, sort and filters of the app's built-in steps (shown grouped by category, sorted inside each). */
export const BUILTIN_NODE_LIST: ListConfig<BuiltinNodeView> = {
  noun: ['built-in step', 'built-in steps'],
  searchPlaceholder: 'Search name, type or description',
  searchText: (n) => [n.label, n.base.label, n.type, n.description].join(' '),
  defaultSort: null,
  fields: [
    { key: 'name', label: 'Step', kind: 'text', get: (n) => n.label },
    { key: 'type', label: 'Type', kind: 'text', get: (n) => n.type },
    {
      key: 'category',
      label: 'Category',
      kind: 'enum',
      quick: true,
      get: (n) => n.category,
      options: CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
    },
    {
      key: 'changed',
      label: 'Changed here',
      kind: 'enum',
      quick: true,
      get: (n) => (n.edited ? 'edited' : 'default'),
      options: [
        { value: 'edited', label: 'Edited' },
        { value: 'default', label: 'App default' },
      ],
    },
    { key: 'changes', label: 'What changed', kind: 'text', get: (n) => changeSummary(n.edit).join(', '), sortable: false },
    { key: 'version', label: 'Version', kind: 'number', get: (n) => n.edit?.version },
    { key: 'updated', label: 'Updated', kind: 'date', get: (n) => n.edit?.createdAt },
  ],
};
