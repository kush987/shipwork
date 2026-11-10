import type { ShipmentsTableProps } from './list.types';
import { ShipmentRow } from './ShipmentRow';

export function ShipmentsTable({
  rows,
  selected,
  selectableCount,
  allSelected,
  onToggle,
  onToggleAll,
  onOpen,
  courierName,
}: ShipmentsTableProps) {
  return (
    <div className="card">
      <table className="table table-hover">
        <thead>
          <tr>
            <th className="col-check">
              <input
                type="checkbox"
                aria-label="Select all shipments awaiting trigger"
                disabled={!selectableCount}
                checked={allSelected}
                onChange={onToggleAll}
              />
            </th>
            <th>Order</th>
            <th>Status</th>
            <th>Payment</th>
            <th className="num">Value</th>
            <th className="num">Weight</th>
            <th>Route</th>
            <th>Courier</th>
            <th className="num">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <ShipmentRow
              key={s.id}
              shipment={s}
              selected={selected.has(s.id)}
              onToggle={() => onToggle(s.id)}
              onOpen={() => onOpen(s.id)}
              courierName={courierName}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
