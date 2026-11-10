import { pick } from 'lodash-es';
import type { Warehouse, WarehouseInput } from '../api/types';
import type { WarehouseAction } from './Warehouses.types';

/** The editable copy of a warehouse (address copied, so edits don't touch the cached one). */
export const toWarehouseInput = (w: Warehouse): WarehouseInput => ({
  ...pick(w, ['name', 'contactName', 'phone']),
  address: { ...w.address },
});

/** Toast title after a row action. */
export const actionToastTitle = (kind: WarehouseAction, name: string) =>
  kind === 'default' ? `${name} is now the default` : kind === 'deactivate' ? `${name} deactivated` : `${name} reactivated`;
