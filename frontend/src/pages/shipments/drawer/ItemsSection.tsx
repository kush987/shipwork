import { inr } from '../../../lib/format';
import type { ItemsSectionProps } from './drawer.types';

export function ItemsSection({ items }: ItemsSectionProps) {
  return (
    <section>
      <h3 className="drawer-h">Items</h3>
      {items?.length ? (
        <table className="table items-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Qty</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={`${item.sku}-${i}`}>
                <td>
                  <div>{item.name}</div>
                  <div className="cell-secondary mono">{item.sku}</div>
                </td>
                <td className="num">{item.quantity}</td>
                <td className="num">{inr(item.quantity * item.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted small">No line items on this shipment.</p>
      )}
    </section>
  );
}
