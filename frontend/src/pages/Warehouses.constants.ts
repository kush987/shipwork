import type { WarehouseInput } from '../api/types';
import { emptyAddress } from '../lib/format';

export const BLANK_WAREHOUSE: WarehouseInput = { name: '', contactName: '', phone: '', address: emptyAddress(), isDefault: false };
