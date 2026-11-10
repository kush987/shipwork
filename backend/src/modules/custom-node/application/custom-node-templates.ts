import { SIMPLE_API } from '../domain/custom-node.constants';
import type { CustomNodeSpec, CustomNodeTemplate } from '../domain/custom-node.types';
import type { FieldSpec } from '../../../shared/schema/field-schema.types';
import { BLANK_CODE, CALCULATE_CODE, MESSAGE_CODE, RAISE_EVENT_CODE, ROUTER_CODE, VALIDATE_CODE } from './custom-node-templates.constants';

const ONE_BRANCH = [{ id: 'next', label: 'Next' }];

const field = (key: string, type: FieldSpec['type'], description: string): FieldSpec => ({ key, type, required: true, description });

/** Every template uses the simple format; only what differs is spelled out. */
const simple = (spec: Omit<CustomNodeSpec, 'apiVersion' | 'errorBranch' | 'outputs'> & Partial<CustomNodeSpec>): CustomNodeSpec => ({
  outputs: ONE_BRANCH,
  errorBranch: false,
  ...spec,
  apiVersion: SIMPLE_API,
});

/** Starting points offered when creating a custom node. Each one passes validation and runs as is. */
export const CUSTOM_NODE_TEMPLATES: CustomNodeTemplate[] = [
  {
    id: 'blank',
    name: 'Start from scratch',
    summary: 'One branch, no settings. Return a value and it is saved for the next steps.',
    spec: simple({
      label: 'My node',
      description: '',
      icon: 'puzzle',
      configSchema: [],
      code: BLANK_CODE,
      resultName: 'myNode',
      resultSchema: [],
    }),
  },
  {
    id: 'router',
    name: 'Route by a rule',
    summary: 'Compare a value with a threshold and continue on a "High" or "Normal" branch.',
    spec: simple({
      label: 'High value check',
      description: 'Sends amounts above a threshold down the "High" branch.',
      icon: 'split',
      configSchema: [
        {
          key: 'amount',
          label: 'Amount',
          kind: 'text',
          default: '{{shipment.codAmount}}',
          required: true,
          help: 'A number, or a placeholder such as {{request.body.amount}}',
        },
        { key: 'threshold', label: 'Threshold', kind: 'number', default: 2000, required: true },
      ],
      outputs: [
        { id: 'high', label: 'High' },
        { id: 'normal', label: 'Normal' },
      ],
      code: ROUTER_CODE,
      resultName: 'valueCheck',
      resultSchema: [
        field('high', 'boolean', 'True when the amount is above the threshold'),
        field('amount', 'number', 'The amount that was checked'),
        field('threshold', 'number', 'The threshold it was compared with'),
      ],
    }),
  },
  {
    id: 'calculate',
    name: 'Calculate a value',
    summary: 'Total an order from request.body.items with tax and shipping — for API endpoints.',
    spec: simple({
      label: 'Order totals',
      description: 'Adds up request.body.items and applies tax and shipping.',
      icon: 'calculator',
      configSchema: [
        { key: 'taxRate', label: 'Tax rate (%)', kind: 'number', default: 18, required: true },
        { key: 'freeShippingAbove', label: 'Free shipping above', kind: 'number', default: 999, required: true },
        { key: 'shippingFee', label: 'Shipping fee', kind: 'number', default: 49, required: true },
      ],
      code: CALCULATE_CODE,
      resultName: 'totals',
      resultSchema: [
        field('itemCount', 'number', 'Number of line items'),
        field('subtotal', 'number', 'Sum of price × quantity'),
        field('tax', 'number', 'Tax on the subtotal'),
        field('shipping', 'number', 'Shipping fee, 0 above the free-shipping amount'),
        field('total', 'number', 'Subtotal + tax + shipping'),
      ],
      errorBranch: true,
    }),
  },
  {
    id: 'validate',
    name: 'Validate a request',
    summary: 'Check request.body for required fields and continue on "Valid" or "Invalid" with the errors.',
    spec: simple({
      label: 'Validate request',
      description: 'Checks required fields and email format in request.body.',
      icon: 'shield-check',
      configSchema: [
        {
          key: 'requiredFields',
          label: 'Required fields',
          kind: 'text',
          default: 'name, email',
          required: true,
          help: 'Comma-separated names of request.body fields',
        },
        { key: 'emailField', label: 'Email field', kind: 'text', default: 'email', help: 'Checked for a valid address. Leave empty to skip.' },
      ],
      outputs: [
        { id: 'valid', label: 'Valid' },
        { id: 'invalid', label: 'Invalid' },
      ],
      code: VALIDATE_CODE,
      resultName: 'validation',
      resultSchema: [field('valid', 'boolean', 'True when there are no errors'), field('errors', 'array', 'One message per problem')],
    }),
  },
  {
    id: 'message',
    name: 'Build a message',
    summary: 'Fill a message from settings and placeholders, then send it with an HTTP request or Notify step.',
    spec: simple({
      label: 'Compose message',
      description: 'Builds a message for a following HTTP request or Notify step.',
      icon: 'message-square',
      configSchema: [
        {
          key: 'message',
          label: 'Message',
          kind: 'text',
          default: 'Order {{shipment.orderId}} for {{shipment.customer.name}} is {{shipment.status}}',
          required: true,
          help: 'Use {{shipment.*}}, {{request.*}} or {{context.*}} placeholders',
        },
        {
          key: 'channel',
          label: 'Channel',
          kind: 'select',
          options: [
            { value: 'slack', label: 'Slack' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'email', label: 'Email' },
          ],
          default: 'slack',
          required: true,
        },
        { key: 'urgent', label: 'Mark as urgent', kind: 'boolean', default: false },
      ],
      code: MESSAGE_CODE,
      resultName: 'message',
      resultSchema: [
        field('channel', 'string', 'Where to send it'),
        field('text', 'string', 'The finished message'),
        field('urgent', 'boolean', 'Whether it was marked urgent'),
      ],
    }),
  },
  {
    id: 'raise-event',
    name: 'Raise an event',
    summary: 'Send one of your custom events for high-value shipments with emit(), so other workflows react.',
    spec: simple({
      label: 'High value alert',
      description: 'Raises the chosen custom event when the order value is above a threshold.',
      icon: 'bell',
      configSchema: [
        { key: 'threshold', label: 'Order value above', kind: 'number', default: 5000, required: true },
        { key: 'alertEvent', label: 'Event to raise', kind: 'select', optionsSource: 'custom-events', required: true },
      ],
      outputs: [
        { id: 'raised', label: 'Raised' },
        { id: 'skipped', label: 'Skipped' },
      ],
      code: RAISE_EVENT_CODE,
      resultName: 'alert',
      resultSchema: [field('raised', 'boolean', 'True when the event was raised'), field('orderValue', 'number', 'The order value checked')],
    }),
  },
];
