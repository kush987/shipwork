export const DEFAULT_POLICY = JSON.stringify(
  {
    statements: [
      { effect: 'allow', actions: ['*'], resources: ['*'], roles: ['admin'], description: 'admins can do anything' },
      { effect: 'allow', actions: ['orders:read'], resources: ['*'], roles: ['customer'], description: 'customers read orders' },
    ],
  },
  null,
  2,
);

export const POLICY_HELP =
  'Statements with effect allow/deny, actions, resources (* matches anything), optional roles and when-conditions ' +
  '[{ "left": "{{context.order.customerId}}", "op": "eq", "right": "{{request.auth.id}}" }]. Default deny; a matching deny always wins.';
