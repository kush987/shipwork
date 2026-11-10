import { useQuery } from '@tanstack/react-query';
import { Plus, Shuffle, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Address, ShipmentInput, ShipmentItem } from '../api/types';
import { formatAddress, inr, itemsTotal, pluralize } from '../lib/format';
import { AddressFields } from './AddressFields';
import { EMPTY_ITEM, PAYMENT_MODES } from './ShipmentForm.constants';
import { sameAddress, toNumber } from './ShipmentForm.helpers';
import type { ShipmentFormProps, WarehouseSelectProps } from './ShipmentForm.types';
import { Field } from './ui';

/**
 * Controlled editor for a ShipmentInput, used for creating, editing and test runs.
 * Empty warehouse ids are filled with the seller's default warehouse.
 */
export function ShipmentForm({
  value,
  onChange,
  onRandomize,
  lockParcel = false,
}: ShipmentFormProps) {
  const set = <K extends keyof ShipmentInput>(k: K, v: ShipmentInput[K]) => onChange((prev) => ({ ...prev, [k]: v }));
  const items = value.items ?? [];

  const warehouses = useQuery({ queryKey: ['warehouses', 'all'], queryFn: () => api.listWarehouses(true) });
  const active = (warehouses.data ?? []).filter((w) => w.active);
  const fallback = active.find((w) => w.isDefault) ?? active[0];

  const [billingSame, setBillingSame] = useState(() => sameAddress(value.billingAddress, value.shippingAddress));
  const [rtoSame, setRtoSame] = useState(() => !value.rtoWarehouseId || value.rtoWarehouseId === value.pickupWarehouseId);

  // New shipments start from the default warehouse.
  useEffect(() => {
    if (!value.pickupWarehouseId && fallback) {
      onChange((prev) =>
        prev.pickupWarehouseId
          ? prev
          : { ...prev, pickupWarehouseId: fallback.id, rtoWarehouseId: rtoSame || !prev.rtoWarehouseId ? fallback.id : prev.rtoWarehouseId },
      );
    }
  }, [fallback?.id, value.pickupWarehouseId]);

  // Items drive the order value (and COD amount for COD orders); both stay editable afterwards.
  const updateItems = (fn: (items: ShipmentItem[]) => ShipmentItem[]) =>
    onChange((prev) => {
      const next = fn(prev.items ?? []);
      const total = itemsTotal(next);
      return { ...prev, items: next, orderValue: total, codAmount: prev.paymentMode === 'COD' ? total : 0 };
    });
  const setItem = (index: number, patch: Partial<ShipmentItem>) =>
    updateItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const setShipping = (shippingAddress: Address) =>
    onChange((prev) => ({ ...prev, shippingAddress, billingAddress: billingSame ? { ...shippingAddress } : prev.billingAddress }));
  const toggleBillingSame = (same: boolean) => {
    setBillingSame(same);
    if (same) onChange((prev) => ({ ...prev, billingAddress: { ...prev.shippingAddress } }));
  };

  const setPickup = (id: string) =>
    onChange((prev) => ({ ...prev, pickupWarehouseId: id, rtoWarehouseId: rtoSame ? id : prev.rtoWarehouseId }));
  const toggleRtoSame = (same: boolean) => {
    setRtoSame(same);
    if (same) onChange((prev) => ({ ...prev, rtoWarehouseId: prev.pickupWarehouseId }));
  };

  return (
    <div className="form-sections">
      <section className="form-section">
        <h4 className="form-section-title">Order</h4>
        <div className="form-grid">
          <Field label="Order ID" required>
            <input className="input mono" disabled={lockParcel} value={value.orderId} onChange={(e) => set('orderId', e.target.value)} />
          </Field>
          <Field label="Payment mode" required>
            <div className="segmented">
              {PAYMENT_MODES.map(({ value: m, label }) => (
                <button
                  type="button"
                  key={m}
                  className={value.paymentMode === m ? 'on' : ''}
                  disabled={lockParcel}
                  onClick={() => onChange((prev) => ({ ...prev, paymentMode: m, codAmount: m === 'PREPAID' ? 0 : prev.codAmount || prev.orderValue }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <div className="form-grid-full items-editor">
            <div className="items-head">
              <span className="field-label">Items</span>
              <span className="muted small">
                {pluralize(items.length, 'item')} · {inr(itemsTotal(items))}
              </span>
            </div>
            {items.length > 0 && (
              <div className="items-row items-row-head" aria-hidden>
                <span>Product name</span>
                <span>SKU</span>
                <span>Qty</span>
                <span>Unit price (₹)</span>
                <span />
              </div>
            )}
            {items.map((item, i) => (
              <div className="items-row" key={i}>
                <input
                  className="input"
                  placeholder="Cotton kurta"
                  disabled={lockParcel}
                  aria-label={`Item ${i + 1} product name`}
                  value={item.name}
                  onChange={(e) => setItem(i, { name: e.target.value })}
                />
                <input
                  className="input mono"
                  placeholder="KUR-001"
                  disabled={lockParcel}
                  aria-label={`Item ${i + 1} SKU`}
                  value={item.sku}
                  onChange={(e) => setItem(i, { sku: e.target.value.toUpperCase() })}
                />
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={1}
                  aria-label={`Item ${i + 1} quantity`}
                  disabled={lockParcel}
                  value={item.quantity}
                  onChange={(e) => setItem(i, { quantity: Math.max(1, Math.floor(toNumber(e.target.value))) })}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  aria-label={`Item ${i + 1} unit price`}
                  disabled={lockParcel}
                  value={item.unitPrice}
                  onChange={(e) => setItem(i, { unitPrice: toNumber(e.target.value) })}
                />
                {lockParcel ? (
                  <span />
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    title="Remove item"
                    aria-label={`Remove item ${i + 1}`}
                    onClick={() => updateItems((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {!lockParcel && (
              <button type="button" className="link-inline" onClick={() => updateItems((list) => [...list, { ...EMPTY_ITEM }])}>
                <Plus size={13} /> Add item
              </button>
            )}
          </div>
          <Field label="Order value (₹)">
            <input
              className="input"
              type="number"
              min={0}
              disabled={lockParcel}
              value={value.orderValue}
              onChange={(e) => set('orderValue', toNumber(e.target.value))}
            />
          </Field>
          <Field label="COD amount (₹)">
            <input
              className="input"
              type="number"
              min={0}
              disabled={lockParcel || value.paymentMode === 'PREPAID'}
              value={value.codAmount}
              onChange={(e) => set('codAmount', toNumber(e.target.value))}
            />
          </Field>
          <Field label="Weight (kg)">
            <input
              className="input"
              type="number"
              step="0.1"
              min={0}
              disabled={lockParcel}
              value={value.weightKg}
              onChange={(e) => set('weightKg', toNumber(e.target.value))}
            />
          </Field>
        </div>
      </section>

      <section className="form-section">
        <h4 className="form-section-title">Customer</h4>
        <div className="form-grid">
          <Field label="Customer name" required>
            <input className="input" value={value.customer.name} onChange={(e) => {
                const name = e.target.value;
                onChange((prev) => ({ ...prev, customer: { ...prev.customer, name } }));
              }} />
          </Field>
          <Field label="Customer phone" required>
            <input
              className="input mono"
              inputMode="tel"
              value={value.customer.phone}
              onChange={(e) => {
                const phone = e.target.value;
                onChange((prev) => ({ ...prev, customer: { ...prev.customer, phone } }));
              }}
            />
          </Field>
        </div>
      </section>

      <section className="form-section">
        <h4 className="form-section-title">Shipping address</h4>
        <AddressFields label="Shipping address" value={value.shippingAddress} onChange={setShipping} lockPincode={lockParcel} />
      </section>

      <section className="form-section">
        <div className="form-section-head">
          <h4 className="form-section-title">Billing address</h4>
          <label className="check">
            <input type="checkbox" checked={billingSame} onChange={(e) => toggleBillingSame(e.target.checked)} />
            Same as shipping address
          </label>
        </div>
        {!billingSame && <AddressFields label="Billing address" value={value.billingAddress} onChange={(a) => set('billingAddress', a)} />}
      </section>

      <section className="form-section">
        <h4 className="form-section-title">Warehouses</h4>
        {warehouses.isSuccess && active.length === 0 ? (
          <div className="notice">
            No active warehouses yet. <Link to="/warehouses">Add a warehouse</Link> to choose where parcels are picked up from and
            returned to.
          </div>
        ) : (
          <div className="form-grid">
            <WarehouseSelect
              label="Pickup warehouse"
              help="Where the courier collects the parcel"
              value={value.pickupWarehouseId}
              warehouses={warehouses.data}
              disabled={lockParcel}
              onChange={setPickup}
            />
            <div className="field">
              <span className="field-label">RTO warehouse</span>
              <label className="check">
                <input type="checkbox" checked={rtoSame} disabled={lockParcel} onChange={(e) => toggleRtoSame(e.target.checked)} />
                Return to the pickup warehouse
              </label>
              {!rtoSame && (
                <WarehouseSelect
                  label="RTO warehouse"
                  hideLabel
                  help="Where undelivered parcels are returned"
                  value={value.rtoWarehouseId}
                  warehouses={warehouses.data}
                  disabled={lockParcel}
                  onChange={(id) => set('rtoWarehouseId', id)}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {onRandomize && (
        <div>
          <button type="button" className="link-inline" onClick={onRandomize}>
            <Shuffle size={13} /> Randomize sample
          </button>
        </div>
      )}
    </div>
  );
}

function WarehouseSelect({
  label,
  hideLabel = false,
  help,
  value,
  warehouses,
  disabled,
  onChange,
}: WarehouseSelectProps) {
  const selected = warehouses?.find((w) => w.id === value);
  const select = (
    <select className="input" aria-label={label} disabled={disabled || !warehouses} value={value} onChange={(e) => onChange(e.target.value)}>
      {!selected && <option value="">{warehouses ? 'Choose a warehouse' : 'Loading…'}</option>}
      {warehouses?.map((w) => (
        // Deactivated ones only appear so an existing shipment still shows its warehouse.
        <option key={w.id} value={w.id} disabled={!w.active}>
          {w.name}
          {w.isDefault ? ' (default)' : ''}
          {!w.active ? ' (deactivated)' : ''}
        </option>
      ))}
    </select>
  );
  const preview = selected ? (
    <span className="warehouse-preview">
      <WarehouseIcon size={13} />
      <span>
        {formatAddress(selected.address)} · {selected.contactName}, {selected.phone}
      </span>
    </span>
  ) : (
    <span className="field-help">{help}</span>
  );

  if (hideLabel) {
    return (
      <>
        {select}
        {preview}
      </>
    );
  }
  return (
    <div className="field">
      <span className="field-label">
        {label}
        <span className="req">*</span>
      </span>
      {select}
      {preview}
    </div>
  );
}
