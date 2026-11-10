import { useEffect, useMemo, useState } from 'react';
import type { Shipment } from '../../../api/types';
import { isAwaitingTrigger, needsCourierChoice } from '../shipments.helpers';

/**
 * Checkbox selection for the shipments list. Only shipments awaiting trigger can be selected, and
 * the selection drops any that stop awaiting trigger.
 *
 * @param rows    the shipments currently listed
 * @param pending every shipment awaiting trigger (independent of the current view)
 */
export function useShipmentSelection(rows: Shipment[], pending: Shipment[] | undefined) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Selection only ever holds shipments that are still awaiting trigger.
  const pendingIds = useMemo(() => new Set((pending ?? []).map((s) => s.id)), [pending]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => pendingIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pendingIds]);

  const selectableRows = rows.filter(isAwaitingTrigger);
  const allSelected = selectableRows.length > 0 && selectableRows.every((s) => selected.has(s.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableRows.map((s) => s.id)));
  const clear = () => setSelected(new Set());
  /** Selected manual-dispatch shipments that have no courier yet. */
  const withoutCourier = (pending ?? []).filter((s) => selected.has(s.id) && needsCourierChoice(s)).length;

  return { selected, selectableRows, allSelected, withoutCourier, toggle, toggleAll, clear };
}
