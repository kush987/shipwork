/**
 * XpressBees shipment API — every path the adapter uses, in one place. Sign in with the account's
 * email and password for a Bearer token. If your API document differs, change it here.
 */
export const XPRESSBEES_PATHS = {
  /** POST { email, password } → { status, data: "<token>" } */
  login: '/api/users/login',
  /** POST { origin, destination, payment_type, order_amount, weight(g), length, breadth, height } → { status, data: [{ id, name, freight_charges, cod_charges, total_charges }] } */
  serviceability: '/api/courier/serviceability',
  /** POST the order → { status, data: { awb_number, courier_id, courier_name, label, shipment_id } } */
  create: '/api/shipments2',
  /** POST { awb } → { status, message } */
  cancel: '/api/shipments2/cancel',
  /** GET /api/shipments2/track/<awb> → { status, data: { status, history: [{ status_code, location, event_time, message }] } } */
  track: '/api/shipments2/track/',
} as const;

export const XPRESSBEES_SETTINGS = { email: 'email', password: 'password', warehouse: 'warehouseName', courierId: 'courierId' } as const;

/** How long a sign-in token is reused (XpressBees doesn't say in the answer). */
export const XPRESSBEES_TOKEN_TTL_SECONDS = 3600;
