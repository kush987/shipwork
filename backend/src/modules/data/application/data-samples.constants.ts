import type { FieldSpec } from '../../../shared/schema/field-schema.types';

/**
 * Sample data for the API templates and the docs walkthrough. A record's `password` is stored as a
 * `passwordHash` (never in clear), exactly as the Sign-up API template does it.
 */
export const SAMPLE_COLLECTIONS: { name: string; label: string; description: string; fields: FieldSpec[]; records: Record<string, unknown>[] }[] = [
  {
    name: 'products',
    label: 'Products',
    description: 'Catalog with price and stock — read and updated by the Create order API.',
    fields: [
      { key: 'sku', type: 'string', required: true },
      { key: 'name', type: 'string', required: true },
      { key: 'price', type: 'number', required: true },
      { key: 'stock', type: 'number', required: true },
    ],
    records: [
      { sku: 'KUR-001', name: 'Cotton kurta', price: 1299, stock: 40 },
      { sku: 'DUP-004', name: 'Silk dupatta', price: 2499, stock: 8 },
      { sku: 'SAR-010', name: 'Banarasi saree', price: 7999, stock: 3 },
    ],
  },
  {
    name: 'orders',
    label: 'Orders',
    description: 'Orders created through the API.',
    fields: [
      { key: 'customerId', type: 'string', required: true },
      { key: 'productId', type: 'string', required: true },
      { key: 'quantity', type: 'number', required: true },
      { key: 'total', type: 'number', required: true },
      { key: 'status', type: 'string', required: true },
    ],
    records: [],
  },
  {
    name: 'app_users',
    label: 'App users',
    description: 'Users of your app — created by the Sign-up API, checked by the Login API, roles read by the role-based authorizer.',
    fields: [
      { key: 'email', type: 'string', required: true },
      { key: 'name', type: 'string', required: false },
      { key: 'passwordHash', type: 'string', required: true },
      { key: 'roles', type: 'array', required: true },
    ],
    records: [
      { email: 'admin@example.com', name: 'Asha (admin)', password: 'admin-password-1', roles: ['admin'] },
      { email: 'customer@example.com', name: 'Ravi (customer)', password: 'customer-password-1', roles: ['customer'] },
    ],
  },
];
