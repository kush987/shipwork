import type { AccessArea } from '../../../shared/auth/auth.types';
import type { AccessAreaInfo, RoleDefinition } from './access.types';

type ActionRow = [verb: string, label: string, description: string];

const area = (id: AccessArea, label: string, resource: string, actions: ActionRow[]): AccessAreaInfo => ({
  area: id,
  label,
  resource,
  actions: actions.map(([verb, actionLabel, description]) => ({ action: `${id}:${verb}`, label: actionLabel, description })),
});

/**
 * Every permission in the builder. Routes name theirs with @Area / @Permission; roles allow or deny
 * them on resources `<resource>:<id>` (or `<resource>:*` for lists and new items).
 */
export const ACCESS_CATALOG: AccessAreaInfo[] = [
  area('workflows', 'Workflows', 'workflow', [
    ['read', 'View', 'See workflows, their versions, templates and the node catalog'],
    ['write', 'Change', 'Create, edit, duplicate and delete workflows'],
    ['publish', 'Publish', 'Publish a version (it goes live for its triggers and endpoints), and pause or resume a published workflow'],
    ['run', 'Test-run', 'Start test runs from the editor'],
  ]),
  area('executions', 'Runs', 'execution', [
    ['read', 'View', 'See runs and their step-by-step history'],
    ['run', 'Replay', 'Replay a run'],
  ]),
  area('endpoints', 'Endpoints', 'endpoint', [
    ['read', 'View', 'See endpoints and download the OpenAPI document'],
    ['write', 'Change', 'Create, edit and delete endpoints'],
  ]),
  area('auth-providers', 'Auth providers', 'auth-provider', [
    ['read', 'View', 'See auth providers and check tokens against them'],
    ['write', 'Change', 'Create, edit and delete providers, and issue test tokens'],
  ]),
  area('api-keys', 'API keys', 'api-key', [
    ['read', 'View', 'See API keys (never their secrets)'],
    ['write', 'Change', 'Create, limit and revoke API keys'],
  ]),
  area('data', 'Data', 'collection', [
    ['read', 'View', 'See collections, their records and built-in data'],
    ['write', 'Change', 'Create and delete collections, change records, add sample data'],
  ]),
  area('shipments', 'Shipments', 'shipment', [
    ['read', 'View', 'See shipments, courier options and quotes'],
    ['write', 'Change', 'Create and change shipments, assign couriers, cancel'],
    ['run', 'Dispatch', 'Dispatch shipments and run their workflows'],
  ]),
  area('warehouses', 'Warehouses', 'warehouse', [
    ['read', 'View', 'See warehouses'],
    ['write', 'Change', 'Create, change, deactivate and reactivate warehouses'],
  ]),
  area('couriers', 'Couriers', 'courier', [
    ['read', 'View', 'See couriers and their settings'],
    ['write', 'Change', 'Change courier settings (platform administrators only — they apply to every workspace)'],
  ]),
  area('custom-nodes', 'Nodes', 'custom-node', [
    ['read', 'View', 'See custom nodes and their versions, and the workspace’s changes to built-in steps (resource builtin-node:<type>)'],
    ['write', 'Change', 'Create, edit, test, archive and restore custom nodes; change and reset built-in steps (name, icon, defaults, workspace logic)'],
  ]),
  area('events', 'Events', 'event', [
    ['read', 'View', 'See the event catalog and custom event definitions'],
    ['write', 'Change', 'Create, change, archive and restore custom events'],
    ['emit', 'Emit', 'Emit events by hand (starts the workflows they trigger)'],
  ]),
  area('dashboard', 'Dashboard', 'dashboard', [['read', 'View', 'See workspace statistics']]),
  area('members', 'Members', 'member', [
    ['read', 'View', 'See who is in the workspace and their roles'],
    ['manage', 'Manage', 'Add and remove people and change their roles'],
  ]),
  area('roles', 'Roles', 'role', [
    ['read', 'View', 'See roles and use the permission simulator'],
    ['manage', 'Manage', 'Create, change and delete custom roles'],
  ]),
  area('database', 'Database', 'database', [
    ['read', 'View', 'See which database holds the business data'],
    ['manage', 'Manage', 'Test and switch the workspace database'],
  ]),
  area('audit', 'Audit log', 'audit', [['read', 'View', 'See who changed what, and attempts that were denied']]),
];

export const ALL_ACTIONS = ACCESS_CATALOG.flatMap((a) => a.actions.map((x) => x.action));

export const RESOURCE_TYPES = ACCESS_CATALOG.map((a) => a.resource);

/** Route parameter that names an area's resource, when it isn't `id`. */
export const RESOURCE_PARAM: Partial<Record<AccessArea, string>> = { data: 'name', members: 'userId', couriers: 'code' };

/** What only owners get by default (editors build; they don't run the workspace). */
const ADMIN_ACTIONS = ['members:manage', 'roles:manage', 'database:manage', 'audit:read'];

/** Built-in roles, expressed in the same policy language as custom roles. */
export const BUILT_IN_ROLES: RoleDefinition[] = [
  {
    id: 'owner',
    name: 'Owner',
    description: 'Everything, including members, roles, the workspace database and the audit log',
    builtIn: true,
    policy: { statements: [{ effect: 'allow', actions: ['*'], resources: ['*'], description: 'Owners can do everything' }] },
  },
  {
    id: 'editor',
    name: 'Editor',
    description: 'Builds and runs everything: workflows, endpoints, data, keys, shipments… — not members, roles, database or audit log',
    builtIn: true,
    policy: {
      statements: [
        { effect: 'allow', actions: ['*'], resources: ['*'], description: 'Editors build and run everything' },
        { effect: 'deny', actions: ADMIN_ACTIONS, resources: ['*'], description: 'Running the workspace is for owners' },
      ],
    },
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Sees everything except the audit log; changes nothing',
    builtIn: true,
    policy: {
      statements: [
        { effect: 'allow', actions: ['*:read'], resources: ['*'], description: 'Viewers can look at everything' },
        { effect: 'deny', actions: ['audit:read'], resources: ['*'], description: 'The audit log is for owners' },
      ],
    },
  },
];

export const CUSTOM_ROLE_PREFIX = 'role';
export const MAX_CUSTOM_ROLES = 50;
export const MAX_ROLE_NAME_LENGTH = 60;
export const MAX_ROLE_DESCRIPTION_LENGTH = 300;
/** Custom role changes reach every replica's guard within this long (at once on the replica that made them). */
export const ROLE_CACHE_MS = 10_000;
