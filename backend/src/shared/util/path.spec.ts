import { getPath, renderDeep, renderTemplate } from './path';

describe('path utils', () => {
  const data = {
    shipment: {
      orderId: 'ORD-1',
      customer: { name: 'Asha' },
      tags: ['a'],
      items: [
        { name: 'Kurta', sku: 'KUR-001' },
        { name: 'Dupatta', sku: 'DUP-004' },
      ],
    },
    context: { rates: [{ total: 99 }] },
  };

  it('reads nested and array paths', () => {
    expect(getPath(data, 'shipment.customer.name')).toBe('Asha');
    expect(getPath(data, 'context.rates.0.total')).toBe(99);
    expect(getPath(data, 'shipment.missing.deep')).toBeUndefined();
  });

  it('maps over arrays with *', () => {
    expect(getPath(data, 'shipment.items.*.sku')).toEqual(['KUR-001', 'DUP-004']);
    expect(getPath(data, 'shipment.items.1.name')).toBe('Dupatta');
    expect(getPath(data, 'shipment.tags.*.missing')).toEqual([]);
  });

  it('joins primitive arrays in templates', () => {
    expect(renderTemplate('Items: {{shipment.items.*.name}}', data)).toBe('Items: Kurta, Dupatta');
  });

  it('renders templates, blanking missing values', () => {
    expect(renderTemplate('Hi {{ shipment.customer.name }} · {{shipment.awb}}', data)).toBe('Hi Asha · ');
  });

  it('renders inside nested JSON', () => {
    expect(renderDeep({ id: '{{shipment.orderId}}', list: ['{{context.rates.0.total}}'] }, data)).toEqual({ id: 'ORD-1', list: ['99'] });
  });
});

import { normalizeAddress, sameAddress } from '../domain/address';

describe('address helpers', () => {
  it('trims and drops empty optional parts', () => {
    expect(
      normalizeAddress({ line1: ' 12 MG Road ', line2: '  ', landmark: null as unknown as string, city: 'Bengaluru ', state: 'Karnataka', pincode: '560001' }),
    ).toEqual({ line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' });
  });

  it('treats blank and missing optional parts as the same address', () => {
    const a = { line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };
    expect(sameAddress(a, { ...a, line2: '', landmark: ' ' })).toBe(true);
    expect(sameAddress(a, { ...a, pincode: '560002' })).toBe(false);
  });
});
