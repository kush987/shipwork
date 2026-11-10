import { MapPin, Undo2, Warehouse as WarehouseIcon } from 'lucide-react';
import { formatAddress } from '../../../lib/format';
import type { AddressCardProps, ShipmentSectionProps, WarehouseCardProps } from './drawer.types';

function AddressCard({
  icon: Icon,
  title,
  name,
  phone,
  address,
  note,
}: AddressCardProps) {
  return (
    <div className="address-card">
      <div className="address-card-title">
        <Icon size={13} /> {title}
        {note && <span className="address-card-note">{note}</span>}
      </div>
      {address ? (
        <>
          {name && <div className="address-card-name">{name}</div>}
          <div className="address-card-body">{formatAddress(address)}</div>
          {phone && <div className="address-card-phone mono">{phone}</div>}
        </>
      ) : (
        <div className="muted small">Not recorded</div>
      )}
    </div>
  );
}

/** A warehouse snapshot as an address card: its name, contact and address. */
function WarehouseCard({ icon, title, warehouse, note }: WarehouseCardProps) {
  return (
    <AddressCard
      icon={icon}
      title={title}
      name={warehouse?.name}
      phone={warehouse && `${warehouse.contactName} · ${warehouse.phone}`}
      address={warehouse?.address}
      note={note}
    />
  );
}

export function AddressesSection({ shipment: s }: ShipmentSectionProps) {
  return (
    <section>
      <h3 className="drawer-h">Addresses</h3>
      <div className="address-grid">
        <AddressCard icon={MapPin} title="Ship to" name={s.customer?.name} phone={s.customer?.phone} address={s.shippingAddress} />
        <AddressCard
          icon={MapPin}
          title="Bill to"
          address={s.billingAddress}
          note={s.billingAddress && formatAddress(s.billingAddress) === formatAddress(s.shippingAddress) ? 'Same as shipping' : undefined}
        />
        <WarehouseCard icon={WarehouseIcon} title="Pickup from" warehouse={s.pickupAddress} />
        <WarehouseCard
          icon={Undo2}
          title="RTO to"
          warehouse={s.rtoAddress}
          note={s.rtoAddress && s.rtoAddress.warehouseId === s.pickupAddress?.warehouseId ? 'Same as pickup' : undefined}
        />
      </div>
    </section>
  );
}
