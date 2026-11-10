import { compact, random, sample, sampleSize, sumBy } from 'lodash-es';
import type { Address, ShipmentInput, ShipmentItem } from '../api/types';
import { HTTP_STATUS_TEXT, SAMPLE_ADDRESSES, SAMPLE_NAMES, SAMPLE_PRODUCTS, TRIGGER_LABEL } from './format.constants';

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 10_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

export function humanize(s: string | null | undefined): string {
  if (!s) return '—';
  return s.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortId(id: string): string {
  return id.length > 10 ? id.slice(-8) : id;
}

export function pretty(v: unknown): string {
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** "1 shipment", "3 shipments". */
export const pluralize = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const emptyAddress = (): Address => ({ line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' });

/** "12 MG Road, Bengaluru, Karnataka 560001" */
export const formatAddress = (a: Address | null | undefined) =>
  a ? compact([a.line1, a.line2, a.landmark, a.city, `${a.state} ${a.pincode}`]).join(', ') : '—';

export function sampleShipment(): ShipmentInput {
  const cod = Math.random() > 0.4;
  const picks = sampleSize(SAMPLE_PRODUCTS, random(1, 2));
  const items = picks.map((p) => ({ ...p, quantity: random(1, 2) }));
  const orderValue = itemsTotal(items);
  const address = sample(SAMPLE_ADDRESSES)!;
  return {
    items,
    orderId: `ORD-${random(100000, 999999)}`,
    paymentMode: cod ? 'COD' : 'PREPAID',
    codAmount: cod ? orderValue : 0,
    orderValue,
    weightKg: Math.round(random(0.3, 6.3) * 10) / 10,
    shippingAddress: { ...address },
    billingAddress: { ...address },
    // Filled with the seller's default warehouse by the form.
    pickupWarehouseId: '',
    rtoWarehouseId: '',
    customer: {
      name: sample(SAMPLE_NAMES)!,
      phone: `9${random(100000000, 999999998)}`,
    },
  };
}

export const itemsTotal = (items: Pick<ShipmentItem, 'quantity' | 'unitPrice'>[]) =>
  Math.round(sumBy(items, (i) => i.quantity * i.unitPrice) * 100) / 100;

/** "404 Not Found" */
export function httpStatusLabel(code: number, fallbackText?: string): string {
  const text = HTTP_STATUS_TEXT[code] ?? fallbackText;
  return text ? `${code} ${text}` : String(code);
}

/** "API request" for 'http.request', "Schedule" for 'schedule', the event key otherwise. */
export const triggerLabel = (event: string | null | undefined): string => {
  if (!event) return '—';
  // Record-changed triggers are keyed record:<collection>.
  if (event.startsWith('record:')) return `Record changed · ${event.slice('record:'.length)}`;
  return TRIGGER_LABEL[event] ?? event;
};

/** "Payment failed!" → "payment_failed" (lowercase, underscores, max 48 chars). */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

/** "admin, ops,  ,support" → ['admin', 'ops', 'support'] (trimmed, empties dropped, no duplicates). */
export const splitList = (text: string): string[] => [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))];
