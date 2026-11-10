import { difference, union } from 'lodash-es';
import { isReadAction } from '../../auth/auth.helpers';
import { Button } from '../../components/ui';
import { actionId, allActionIds, areaActionIds } from './access.helpers';
import type { PermissionMatrixProps } from './access.types';

/** One row per area: its checkbox ticks the whole row, the chips tick single actions. */
export function PermissionMatrix({ areas, checked, onChange, disabled }: PermissionMatrixProps) {
  const on = new Set(checked);
  const all = allActionIds(areas);
  const setMany = (ids: string[], value: boolean) => onChange(value ? union(checked, ids) : difference(checked, ids));

  return (
    <div className="perm-matrix">
      {!disabled && (
        <div className="perm-quick">
          <Button size="sm" variant="ghost" onClick={() => onChange(all)}>
            Everything
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange(all.filter(isReadAction))}>
            View only
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            Clear
          </Button>
          <span className="muted small perm-count">
            {checked.length} of {all.length} ticked
          </span>
        </div>
      )}
      <ul className="perm-rows">
        {areas.map((area) => {
          const ids = areaActionIds(area);
          const count = ids.filter((id) => on.has(id)).length;
          return (
            <li key={area.area} className="perm-row">
              <label className="check perm-area" title={`All ${area.label.toLowerCase()} permissions`}>
                <input
                  type="checkbox"
                  checked={count > 0 && count === ids.length}
                  ref={(el) => {
                    if (el) el.indeterminate = count > 0 && count < ids.length;
                  }}
                  disabled={disabled}
                  aria-label={`All ${area.label} permissions`}
                  onChange={(e) => setMany(ids, e.target.checked)}
                />
                <span className="perm-area-name">{area.label}</span>
              </label>
              <div className="perm-actions">
                {area.actions.map((a) => {
                  const id = actionId(area, a);
                  return (
                    <label key={id} className={`perm-chip${on.has(id) ? ' on' : ''}`} title={a.description}>
                      <input type="checkbox" checked={on.has(id)} disabled={disabled} onChange={(e) => setMany([id], e.target.checked)} />
                      {a.label}
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
