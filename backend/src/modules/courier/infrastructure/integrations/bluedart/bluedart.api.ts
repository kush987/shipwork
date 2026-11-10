/**
 * Blue Dart API gateway (apigateway.bluedart.com/in/transportation) — every path the adapter uses,
 * in one place. Docs: https://apiportal.bluedart.com (sign in with your Blue Dart API account).
 * Calls carry a JWT from the login call plus your login id and licence key. If your contract's
 * documents differ, change them here.
 */
export const BLUEDART_PATHS = {
  /** GET with headers ClientID + clientSecret → { JWTToken } */
  login: '/token/v1/login',
  /** POST { pinCode, profile } → { GetServicesforPincodeResult: { IsError, ErrorMessage, eTailCODAirInbound, eTailPrePaidAirInbound } } */
  serviceability: '/finder/v1/GetServicesforPincode',
  /** POST { Request: { Consignee, Shipper, Services, Returnadds }, Profile } → { GenerateWayBillResult: { AWBNo, IsError, Status } } */
  create: '/waybill/v1/GenerateWayBill',
  /** POST { Request: { AWBNo }, Profile } → { CancelWaybillResult: { IsError, Status } } */
  cancel: '/waybill/v1/CancelWaybill',
  /** GET ?handler=tnt&loginid&numbers&format=json&lickey&scan=1&action=custom&verno=1 → { ShipmentData: { Shipment: [...] } } */
  track: '/tracking/v1/shipment',
} as const;

export const BLUEDART_SETTINGS = {
  clientId: 'clientId',
  clientSecret: 'clientSecret',
  loginId: 'loginId',
  licenceKey: 'licenceKey',
  customerCode: 'customerCode',
  originArea: 'originArea',
  productCode: 'productCode',
} as const;

/** Domestic Priority, unless the contract says otherwise. */
export const BLUEDART_DEFAULT_PRODUCT = 'A';
/** Sub-products: C = COD, P = prepaid. */
export const BLUEDART_SUB_PRODUCT = { COD: 'C', PREPAID: 'P' } as const;
export const BLUEDART_TOKEN_TTL_SECONDS = 3600;
