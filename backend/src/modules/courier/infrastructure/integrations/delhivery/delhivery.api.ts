/**
 * Delhivery B2C (Express) API — every path and code the adapter uses, in one place.
 * Docs: https://one.delhivery.com/developer-portal/documents (sign-in with your Delhivery One account).
 * If your contract's documents differ, change them here.
 */
export const DELHIVERY_PATHS = {
  /** GET ?filter_codes=<pincode> → { delivery_codes: [{ postal_code: { pin, pre_paid, cod, pickup } }] } */
  serviceability: '/c/api/pin-codes/json/',
  /** GET ?md=S&ss=Delivered&o_pin&d_pin&cgm(grams)&pt(COD|Pre-paid)&cod → [{ total_amount, gross_amount, charge_COD }] */
  rates: '/api/kinko/v1/invoice/charges/.json',
  /** POST body `format=json&data=<json>` → { success, packages: [{ status, waybill, refnum, remarks }], rmk } */
  create: '/api/cmu/create.json',
  /** POST { waybill, cancellation: "true" } → { status, remark } */
  cancel: '/api/p/edit',
  /** GET ?waybill=<awb> or ?ref_ids=<order> → { ShipmentData: [{ Shipment: { AWB, Status, Scans } }] } */
  track: '/api/v1/packages/json/',
  /** GET ?wbns=<awb>&pdf=true → { packages: [{ pdf_download_link }] } */
  label: '/api/p/packing_slip',
} as const;

export const DELHIVERY_SETTINGS = { token: 'apiToken', pickupLocation: 'pickupLocation' } as const;

/** Characters Delhivery's manifest API rejects in free text. */
export const DELHIVERY_UNSAFE_TEXT = /[&#%;\\]/g;
