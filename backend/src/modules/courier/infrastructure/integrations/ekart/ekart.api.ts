/**
 * Ekart (Elite) integration API — every path the adapter uses, in one place. Ekart shares its API
 * document with account holders; these follow it as we know it. Check them against your document
 * (and Test connection) before switching Ekart to Live, and change them here if they differ.
 */
export const EKART_PATHS = {
  /** POST /integrations/v2/auth/token/<clientId> { username, password } → { access_token, expires_in } */
  token: '/integrations/v2/auth/token/',
  /** GET /api/v2/serviceability/<pincode> → { status, details: { cod, prepaid } , remark } */
  serviceability: '/api/v2/serviceability/',
  /** PUT the package → { status, tracking_id, barcodes: { wbn }, remark } */
  create: '/api/v1/package/create',
  /** DELETE ?tracking_id=<awb> → { status, remark } */
  cancel: '/api/v1/package/cancel',
  /** GET /api/v1/track/<tracking id> → { track: { status, details: [{ status, ctime, location, desc }] } } */
  track: '/api/v1/track/',
} as const;

export const EKART_SETTINGS = { clientId: 'clientId', username: 'username', password: 'password', sellerName: 'sellerName', gstin: 'sellerGstin' } as const;
