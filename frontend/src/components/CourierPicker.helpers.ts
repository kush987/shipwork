import type { CourierOption } from '../api/types';

/** A courier is pickable when it can carry the parcel, has a live quote, and isn't the current one. */
export const isPickable = (o: CourierOption) => o.serviceable && !!o.quote && !o.current;
