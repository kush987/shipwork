import { CourierRejectedError } from '../../../domain/courier-provider';
import { normalizeCourierStatus } from '../../../domain/courier-status';
import { TEST_PINCODE } from '../../../domain/courier-integration.constants';
import type { BookingResult, ParcelDetails, RateQuote, ServiceabilityResult, TrackingEvent } from '../../../domain/courier-provider.types';
import { TokenCache } from '../courier-http';
import { RealCourierBase } from '../real-courier.base';
import { phone10, quantityOf, returnAddress, yes } from '../parcel-format';
import { BLUEDART_DEFAULT_PRODUCT, BLUEDART_PATHS, BLUEDART_SETTINGS, BLUEDART_SUB_PRODUCT, BLUEDART_TOKEN_TTL_SECONDS } from './bluedart.api';
import type { BluedartCancelResult, BluedartPincodeResult, BluedartScanDetail, BluedartStatus, BluedartTrackResult, BluedartWaybillResult } from './bluedart.types';
import type { OutboundHttp } from '../../../../../shared/http/outbound-http';
import type { CourierCredentials } from '../../../domain/courier-integration.types';
import type { RateCard } from '../../../domain/rate-calculator.types';
import type { Address } from '../../../../../shared/domain/address.types';

const statusText = (status: BluedartStatus[] | undefined) => (status ?? []).map((s) => s.StatusInformation).filter(Boolean).join('; ');

/** Blue Dart addresses are three lines of at most 30 characters. */
function lines(a: Address | null | undefined): [string, string, string] {
  const words = [a?.line1, a?.line2, a?.landmark].filter(Boolean).join(', ').split(/\s+/);
  const out: string[] = [''];
  for (const w of words) {
    if ((out[out.length - 1] + ' ' + w).trim().length > 30 && out.length < 3) out.push('');
    out[out.length - 1] = (out[out.length - 1] + ' ' + w).trim();
  }
  return [out[0] ?? '', out[1] ?? '', out[2] ?? ''];
}

/** "DD-MM-YYYY" + "HH:mm" → ISO time (India time). */
function scanTime(date?: string, time?: string): string | null {
  const m = /^(\d{2})-(\d{2}|[A-Za-z]{3})-(\d{4})$/.exec(date ?? '');
  if (!m) return null;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : months.indexOf(m[2].toLowerCase()) + 1;
  const iso = `${m[3]}-${String(month).padStart(2, '0')}-${m[1]}T${(time ?? '00:00').padEnd(5, '0').slice(0, 5)}:00+05:30`;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** Seconds until a JWT's `exp`, when it has one. */
function jwtTtl(token: string): number | null {
  try {
    const exp = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).exp;
    return typeof exp === 'number' ? exp - Math.floor(Date.now() / 1000) : null;
  } catch {
    return null;
  }
}

/** Blue Dart: a JWT from ClientID + secret, and the login id + licence key on every request. Prices come from the rate card. */
export class BluedartProvider extends RealCourierBase {
  private readonly tokens: TokenCache;

  constructor(code: string, name: string, http: OutboundHttp, credentials: CourierCredentials, rateCard: RateCard) {
    super(code, name, http, credentials, rateCard);
    this.tokens = new TokenCache(async () => {
      const res = await this.api.send<{ JWTToken?: string }>({
        method: 'GET',
        path: BLUEDART_PATHS.login,
        headers: { ClientID: this.setting(BLUEDART_SETTINGS.clientId), clientSecret: this.setting(BLUEDART_SETTINGS.clientSecret) },
      });
      if (!res?.JWTToken) throw new CourierRejectedError(this.code, 'Blue Dart sign-in returned no token');
      return { token: res.JWTToken, ttlSeconds: jwtTtl(res.JWTToken) ?? BLUEDART_TOKEN_TTL_SECONDS };
    });
  }

  private profile() {
    return { Api_type: 'S', LicenceKey: this.setting(BLUEDART_SETTINGS.licenceKey), LoginID: this.setting(BLUEDART_SETTINGS.loginId) };
  }

  private call<T>(method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, unknown>) {
    return this.tokens.withToken((token) => this.api.send<T>({ method, path, body, query, headers: { JWTToken: token } }));
  }

  private async pincode(pin: string) {
    const res = await this.call<BluedartPincodeResult>('POST', BLUEDART_PATHS.serviceability, { pinCode: pin, profile: this.profile() });
    const result = res?.GetServicesforPincodeResult;
    if (!result || result.IsError) return null;
    return result;
  }

  async checkServiceability(parcel: ParcelDetails): Promise<ServiceabilityResult> {
    const pin = await this.pincode(parcel.deliveryPincode);
    if (!pin) return { serviceable: false, reason: `Blue Dart does not deliver to ${parcel.deliveryPincode}` };
    const ok = parcel.paymentMode === 'COD' ? yes(pin.eTailCODAirInbound) : yes(pin.eTailPrePaidAirInbound);
    return ok ? { serviceable: true } : { serviceable: false, reason: `No ${parcel.paymentMode === 'COD' ? 'COD' : 'prepaid'} delivery to ${parcel.deliveryPincode}` };
  }

  /** Blue Dart prices by contract: the rate card on the Couriers page stands in for a rate API. */
  async getRate(parcel: ParcelDetails): Promise<RateQuote> {
    return this.rateCardQuote(parcel);
  }

  async createShipment(parcel: ParcelDetails): Promise<BookingResult> {
    const [to1, to2, to3] = lines(parcel.deliveryAddress);
    const [from1, from2, from3] = lines(parcel.pickupAddress);
    const back = returnAddress(parcel);
    const [back1, back2, back3] = lines(back);
    const cod = parcel.paymentMode === 'COD';
    const res = await this.call<BluedartWaybillResult>('POST', BLUEDART_PATHS.create, {
      Request: {
        Consignee: {
          ConsigneeName: parcel.customer.name,
          ConsigneeAddress1: to1,
          ConsigneeAddress2: to2,
          ConsigneeAddress3: to3,
          ConsigneePincode: parcel.deliveryPincode,
          ConsigneeMobile: phone10(parcel.customer.phone),
          ConsigneeAttention: parcel.customer.name,
        },
        Shipper: {
          CustomerCode: this.setting(BLUEDART_SETTINGS.customerCode),
          OriginArea: this.setting(BLUEDART_SETTINGS.originArea),
          CustomerName: parcel.pickupContact?.name ?? '',
          CustomerAddress1: from1,
          CustomerAddress2: from2,
          CustomerAddress3: from3,
          CustomerPincode: parcel.pickupPincode,
          CustomerMobile: phone10(parcel.pickupContact?.phone),
          Sender: parcel.pickupContact?.name ?? '',
        },
        Returnadds: {
          ReturnAddress1: back1,
          ReturnAddress2: back2,
          ReturnAddress3: back3,
          ReturnPincode: back?.pincode ?? parcel.pickupPincode,
          ReturnMobile: phone10(parcel.pickupContact?.phone),
          ReturnContact: parcel.pickupContact?.name ?? '',
        },
        Services: {
          ProductCode: this.setting(BLUEDART_SETTINGS.productCode) || BLUEDART_DEFAULT_PRODUCT,
          SubProductCode: cod ? BLUEDART_SUB_PRODUCT.COD : BLUEDART_SUB_PRODUCT.PREPAID,
          ProductType: 1,
          PieceCount: 1,
          ActualWeight: parcel.weightKg,
          CollectableAmount: cod ? parcel.codAmount : 0,
          DeclaredValue: parcel.orderValue,
          CreditReferenceNo: parcel.reference,
          RegisterPickup: true,
          PickupDate: `/Date(${Date.now()})/`,
          PickupTime: '1600',
          Dimensions: parcel.dimensions
            ? [{ Length: parcel.dimensions.lengthCm, Breadth: parcel.dimensions.breadthCm, Height: parcel.dimensions.heightCm, Count: 1 }]
            : [],
          itemdtl: parcel.items.map((i) => ({ ItemName: i.name, SKUNumber: i.sku, Itemquantity: i.quantity, ItemValue: i.unitPrice })),
          PackType: '',
          Commodity: { CommodityDetail1: parcel.items[0]?.name ?? 'Goods', CommodityDetail2: '', CommodityDetail3: '' },
          TotalItems: quantityOf(parcel),
        },
      },
      Profile: this.profile(),
    });
    const result = res?.GenerateWayBillResult;
    if (!result?.AWBNo || result.IsError) throw new CourierRejectedError(this.code, `Blue Dart did not book it: ${statusText(result?.Status) || 'no reason given'}`);
    return { awb: result.AWBNo, courierCode: this.code, labelUrl: '', reference: parcel.reference };
  }

  async cancelShipment(awb: string): Promise<{ cancelled: boolean }> {
    const res = await this.call<BluedartCancelResult>('POST', BLUEDART_PATHS.cancel, { Request: { AWBNo: awb }, Profile: this.profile() });
    const result = res?.CancelWaybillResult;
    if (!result || result.IsError) throw new CourierRejectedError(this.code, `Blue Dart did not cancel ${awb}: ${statusText(result?.Status) || 'no reason given'}`);
    return { cancelled: true };
  }

  /** Blue Dart's tracking needs the AWB: a booking whose answer was lost is booked again (the reference is ours). */
  async findShipmentByReference(): Promise<BookingResult | null> {
    return null;
  }

  async trackShipment(awb: string): Promise<TrackingEvent[]> {
    const res = await this.call<BluedartTrackResult>('GET', BLUEDART_PATHS.track, undefined, {
      handler: 'tnt',
      action: 'custom',
      loginid: this.setting(BLUEDART_SETTINGS.loginId),
      lickey: this.setting(BLUEDART_SETTINGS.licenceKey),
      numbers: awb,
      format: 'json',
      scan: 1,
      verno: 1,
    });
    const shipment = res?.ShipmentData?.Shipment?.[0];
    if (!shipment) throw new CourierRejectedError(this.code, `Blue Dart has no shipment ${awb}${res?.ShipmentData?.Error ? `: ${res.ShipmentData.Error}` : ''}`);
    const raw = shipment.Scans;
    const details: BluedartScanDetail[] = (Array.isArray(raw) ? raw.map((s) => s.ScanDetail) : [raw?.ScanDetail].flat()).filter((d): d is BluedartScanDetail => !!d);
    return details
      .map((d) => ({ d, at: scanTime(d.ScanDate, d.ScanTime) }))
      .filter((x): x is { d: BluedartScanDetail; at: string } => !!x.at)
      .map(({ d, at }) => ({ status: normalizeCourierStatus(d.Scan) ?? d.Scan ?? 'update', at, location: d.ScannedLocation, description: d.Scan }))
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  async testConnection(): Promise<string> {
    await this.tokens.get();
    const pin = await this.pincode(TEST_PINCODE);
    return pin ? `Signed in; pincode ${TEST_PINCODE}: ${pin.PincodeDescription ?? 'served'}` : `Signed in; pincode ${TEST_PINCODE} is not served (or the login id / licence key is wrong)`;
  }
}
