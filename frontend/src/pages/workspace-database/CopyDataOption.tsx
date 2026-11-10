import { HAS_DATA_NOTE } from './database.constants';
import type { CopyDataOptionProps } from './database.types';

export function CopyDataOption({ checked, onChange, targetHasData, disabled }: CopyDataOptionProps) {
  return (
    <div className="db-copy">
      <label className="check">
        <input type="checkbox" checked={checked && !targetHasData} disabled={disabled || targetHasData} onChange={(e) => onChange(e.target.checked)} />
        Copy my current data into it
      </label>
      <p className="muted small">{targetHasData ? HAS_DATA_NOTE : 'Copies this workspace’s shipments, warehouses, courier requests and data records before switching.'}</p>
    </div>
  );
}
