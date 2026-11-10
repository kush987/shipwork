import { CourierRejectedError } from '../../../domain/courier-provider';
import { normalizeCourierStatus } from '../../../domain/courier-status';
import { TEST_PINCODE } from '../../../domain/courier-integration.constants';
import type { BookingResult, ParcelDetails, RateQuote, ServiceabilityResult, TrackingEvent } from '../../../domain/courier-provider.types';
import { TokenCache } from '../courier-http';
import { RealCourierBase } from '../real-courier.base';
import { addressLine, grams, itemsText, phone10, quantityOf, returnAddress } from '../parcel-format';
import { EKART_PATHS, EKART_SETTINGS } from './ekart.api';
import type { EkartCreated, EkartServiceability, EkartToken, EkartTrack } from './ekart.types';
import type { OutboundHttp } from '../../../../../shared/http/outbound-http';
import type { CourierCredentials } from '../../../domain/courier-integration.types';
import type { RateCard } from '../../../domain/rate-calculator.types';
import type { Address } from '../../../../../shared/domain/address.types';

const location = (a: Address | null | undefined, name: string, phone: string, pin: string) => ({
  location_type: 'Office',
  name,
  phone: phone10(phone),
  address: addressLine(a),
  city: a?.city ?? '',
  state: a?.state ?? '',
  country: 'India',
  pin,
});

/** Ekart: a Bearer token from client id + username + password. Prices come from the rate card. */
export class EkartProvider extends RealCourierBase {
  private readonly tokens: TokenCache;

  constructor(code: string, name: string, http: OutboundHttp, credentials: CourierCredentials, rateCard: RateCard) {
    super(code, name, http, credentials, rateCard);
    this.tokens = new TokenCache(async () => {
      const res = await this.api.send<EkartToken>({
        method: 'POST',
        path: `${EKART_PATHS.token}${encodeURIComponent(this.setting(EKART_SETTINGS.clientId))}`,
        body: { username: this.setting(EKART_SETTINGS.username), password: this.setting(EKART_SETTINGS.password) },
      });
      if (!res?.access_token) throw new CourierRejectedError(this.code, 'Ekart sign-in returned no token');
      return { token: res.access_token, ttlSeconds: Number(res.expires_in) || 3600 };
    });
  }

  private call<T>(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown, query?: Record<string, unknown>) {
    return this.tokens.withToken((token) => this.api.send<T>({ method, path, body, query, headers: { authorization: `Bearer ${token}` } }));
  }

  private serviceability(pin: string) {
    return this.call<EkartServiceability>('GET', `${EKART_PATHS.serviceability}${encodeURIComponent(pin)}`);
  }

  async checkServiceability(parcel: ParcelDetails): Promise<ServiceabilityResult> {
    const res = await this.serviceability(parcel.deliveryPincode);
    if (!res?.status) return { serviceable: false, reason: res?.remark || `Ekart does not deliver to ${parcel.deliveryPincode}` };
    if (parcel.paymentMode === 'COD' && res.details?.cod === false) return { serviceable: false, reason: `No COD to ${parcel.deliveryPincode}` };
    return { serviceable: true };
  }

  /** Prices come from the rate card on the Couriers page. */
  async getRate(parcel: ParcelDetails): Promise<RateQuote> {
    return this.rateCardQuote(parcel);
  }

  async createShipment(parcel: ParcelDetails): Promise<BookingResult> {
    const cod = parcel.paymentMode === 'COD';
    const seller = this.setting(EKART_SETTINGS.sellerName) || parcel.pickupContact?.name || '';
    const back = returnAddress(parcel);
    const res = await this.call<EkartCreated>('PUT', EKART_PATHS.create, {
      order_number: parcel.reference,
      invoice_number: parcel.reference,
      invoice_date: new Date().toISOString().slice(0, 10),
      seller_name: seller,
      seller_address: addressLine(parcel.pickupAddress),
      seller_gst_tin: this.setting(EKART_SETTINGS.gstin),
      consignee_name: parcel.customer.name,
      consignee_phone: phone10(parcel.customer.phone),
      payment_mode: cod ? 'COD' : 'Prepaid',
      cod_amount: cod ? parcel.codAmount : 0,
      total_amount: parcel.orderValue,
      taxable_amount: parcel.orderValue,
      commodity_value: String(parcel.orderValue),
      products_desc: itemsText(parcel),
      category_of_goods: 'General',
      quantity: quantityOf(parcel),
      weight: grams(parcel.weightKg),
      length: parcel.dimensions?.lengthCm ?? 10,
      width: parcel.dimensions?.breadthCm ?? 10,
      height: parcel.dimensions?.heightCm ?? 10,
      drop_location: location(parcel.deliveryAddress, parcel.customer.name, parcel.customer.phone, parcel.deliveryPincode),
      pickup_location: location(parcel.pickupAddress, seller, parcel.pickupContact?.phone ?? '', parcel.pickupPincode),
      return_location: location(back, seller, parcel.pickupContact?.phone ?? '', back?.pincode ?? parcel.pickupPincode),
    });
    const awb = res?.tracking_id ?? res?.barcodes?.wbn;
    if (!res?.status || !awb) throw new CourierRejectedError(this.code, `Ekart did not book it: ${res?.remark ?? 'no tracking id returned'}`);
    return { awb, courierCode: this.code, labelUrl: '', reference: parcel.reference };
  }

  async cancelShipment(awb: string): Promise<{ cancelled: boolean }> {
    const res = await this.call<{ status?: boolean; remark?: string }>('DELETE', EKART_PATHS.cancel, undefined, { tracking_id: awb });
    if (!res?.status) throw new CourierRejectedError(this.code, `Ekart did not cancel ${awb}: ${res?.remark ?? 'no reason given'}`);
    return { cancelled: true };
  }

  /** Ekart tracks by tracking id only: a booking whose answer was lost is booked again (the order number is ours). */
  async findShipmentByReference(): Promise<BookingResult | null> {
    return null;
  }

  async trackShipment(awb: string): Promise<TrackingEvent[]> {
    const res = await this.call<EkartTrack>('GET', `${EKART_PATHS.track}${encodeURIComponent(awb)}`);
    if (!res?.track) throw new CourierRejectedError(this.code, `Ekart has no shipment ${awb}`);
    const events: TrackingEvent[] = [];
    for (const d of res.track.details ?? []) {
      const time = d.ctime === undefined || d.ctime === '' ? null : new Date(typeof d.ctime === 'number' ? d.ctime : String(d.ctime));
      if (!time || Number.isNaN(time.getTime())) continue;
      const words = [d.status, d.desc].filter(Boolean).join(' — ');
      events.push({ status: normalizeCourierStatus(words) ?? d.status ?? 'update', at: time.toISOString(), location: d.location, description: words });
    }
    return events.sort((a, b) => a.at.localeCompare(b.at));
  }

  async testConnection(): Promise<string> {
    await this.tokens.get();
    const res = await this.serviceability(TEST_PINCODE);
    return `Signed in; pincode ${TEST_PINCODE} ${res?.status ? 'is served' : `is not served${res?.remark ? ` (${res.remark})` : ''}`}`;
  }
}
