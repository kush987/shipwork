import { CourierRejectedError } from '../../../domain/courier-provider';
import { normalizeCourierStatus } from '../../../domain/courier-status';
import { TEST_PINCODE } from '../../../domain/courier-integration.constants';
import type { BookingResult, ParcelDetails, RateQuote, ServiceabilityResult, TrackingEvent } from '../../../domain/courier-provider.types';
import { TokenCache } from '../courier-http';
import { RealCourierBase, money } from '../real-courier.base';
import { grams, phone10 } from '../parcel-format';
import { XPRESSBEES_PATHS, XPRESSBEES_SETTINGS, XPRESSBEES_TOKEN_TTL_SECONDS } from './xpressbees.api';
import type { XpressbeesBooking, XpressbeesEnvelope, XpressbeesService, XpressbeesTracking } from './xpressbees.types';
import type { OutboundHttp } from '../../../../../shared/http/outbound-http';
import type { CourierCredentials } from '../../../domain/courier-integration.types';
import type { RateCard } from '../../../domain/rate-calculator.types';

/** XpressBees: email + password sign-in for a Bearer token; prices and serviceability come from one call. */
export class XpressbeesProvider extends RealCourierBase {
  private readonly tokens: TokenCache;

  constructor(code: string, name: string, http: OutboundHttp, credentials: CourierCredentials, rateCard: RateCard) {
    super(code, name, http, credentials, rateCard);
    this.tokens = new TokenCache(async () => {
      const res = await this.api.send<XpressbeesEnvelope<string>>({
        method: 'POST',
        path: XPRESSBEES_PATHS.login,
        body: { email: this.setting(XPRESSBEES_SETTINGS.email), password: this.setting(XPRESSBEES_SETTINGS.password) },
      });
      if (!res?.status || typeof res.data !== 'string') throw new CourierRejectedError(this.code, `XpressBees sign-in failed: ${res?.message ?? 'no token returned'}`);
      return { token: res.data, ttlSeconds: XPRESSBEES_TOKEN_TTL_SECONDS };
    });
  }

  private call<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
    return this.tokens.withToken((token) => this.api.send<XpressbeesEnvelope<T>>({ method, path, body, headers: { authorization: `Bearer ${token}` } }));
  }

  /** The services that can carry the parcel, cheapest first. */
  private async services(parcel: ParcelDetails): Promise<XpressbeesService[]> {
    const res = await this.call<XpressbeesService[]>('POST', XPRESSBEES_PATHS.serviceability, {
      origin: parcel.pickupPincode,
      destination: parcel.deliveryPincode,
      payment_type: parcel.paymentMode === 'COD' ? 'cod' : 'prepaid',
      order_amount: parcel.paymentMode === 'COD' ? parcel.codAmount : parcel.orderValue,
      weight: grams(parcel.weightKg),
      length: parcel.dimensions?.lengthCm ?? 10,
      breadth: parcel.dimensions?.breadthCm ?? 10,
      height: parcel.dimensions?.heightCm ?? 10,
    });
    const list = res?.status && Array.isArray(res.data) ? res.data : [];
    const wanted = this.setting(XPRESSBEES_SETTINGS.courierId);
    return list.filter((s) => !wanted || String(s.id) === wanted).sort((a, b) => money(a.total_charges) - money(b.total_charges));
  }

  async checkServiceability(parcel: ParcelDetails): Promise<ServiceabilityResult> {
    const services = await this.services(parcel);
    return services.length ? { serviceable: true } : { serviceable: false, reason: `XpressBees does not serve ${parcel.pickupPincode} → ${parcel.deliveryPincode} for this parcel` };
  }

  async getRate(parcel: ParcelDetails): Promise<RateQuote> {
    const [best] = await this.services(parcel);
    if (!best) throw new CourierRejectedError(this.code, 'XpressBees returned no price for this parcel');
    const card = this.rateCardQuote(parcel);
    return { ...card, freight: money(best.freight_charges), codFee: money(best.cod_charges), total: money(best.total_charges) };
  }

  async createShipment(parcel: ParcelDetails): Promise<BookingResult> {
    const to = parcel.deliveryAddress;
    const from = parcel.pickupAddress;
    const courierId = this.setting(XPRESSBEES_SETTINGS.courierId);
    const res = await this.call<XpressbeesBooking>('POST', XPRESSBEES_PATHS.create, {
      order_number: parcel.reference,
      unique_order_number: 'yes',
      payment_type: parcel.paymentMode === 'COD' ? 'cod' : 'prepaid',
      order_amount: parcel.orderValue,
      collectable_amount: parcel.paymentMode === 'COD' ? parcel.codAmount : 0,
      discount: 0,
      shipping_charges: 0,
      cod_charges: 0,
      package_weight: grams(parcel.weightKg),
      package_length: parcel.dimensions?.lengthCm ?? 10,
      package_breadth: parcel.dimensions?.breadthCm ?? 10,
      package_height: parcel.dimensions?.heightCm ?? 10,
      request_auto_pickup: 'yes',
      ...(courierId ? { courier_id: courierId } : {}),
      consignee: {
        name: parcel.customer.name,
        phone: phone10(parcel.customer.phone),
        address: to?.line1 ?? '',
        address_2: [to?.line2, to?.landmark].filter(Boolean).join(', '),
        city: to?.city ?? '',
        state: to?.state ?? '',
        pincode: parcel.deliveryPincode,
      },
      pickup: {
        warehouse_name: this.setting(XPRESSBEES_SETTINGS.warehouse) || parcel.pickupContact?.name || 'Warehouse',
        name: parcel.pickupContact?.name ?? '',
        phone: phone10(parcel.pickupContact?.phone),
        address: from?.line1 ?? '',
        address_2: from?.line2 ?? '',
        city: from?.city ?? '',
        state: from?.state ?? '',
        pincode: parcel.pickupPincode,
      },
      // Returns go to the pickup address unless the parcel names another one.
      ...(parcel.rtoAddress
        ? {
            is_rto_different: 'yes',
            rto: {
              name: parcel.pickupContact?.name ?? '',
              phone: phone10(parcel.pickupContact?.phone),
              address: parcel.rtoAddress.line1,
              address_2: parcel.rtoAddress.line2 ?? '',
              city: parcel.rtoAddress.city,
              state: parcel.rtoAddress.state,
              pincode: parcel.rtoAddress.pincode,
            },
          }
        : {}),
      order_items: parcel.items.map((i) => ({ name: i.name, sku: i.sku, qty: i.quantity, price: i.unitPrice })),
    });
    const awb = res?.data?.awb_number;
    if (!res?.status || !awb) throw new CourierRejectedError(this.code, `XpressBees did not book it: ${res?.message ?? 'no AWB returned'}`);
    return { awb, courierCode: this.code, labelUrl: res.data?.label ?? '', reference: parcel.reference };
  }

  async cancelShipment(awb: string): Promise<{ cancelled: boolean }> {
    const res = await this.call<unknown>('POST', XPRESSBEES_PATHS.cancel, { awb });
    if (!res?.status) throw new CourierRejectedError(this.code, `XpressBees did not cancel ${awb}: ${res?.message ?? 'no reason given'}`);
    return { cancelled: true };
  }

  /** XpressBees has no lookup by order number here: a booking whose answer was lost is retried, and a duplicate order number is refused. */
  async findShipmentByReference(): Promise<BookingResult | null> {
    return null;
  }

  async trackShipment(awb: string): Promise<TrackingEvent[]> {
    const res = await this.call<XpressbeesTracking>('GET', `${XPRESSBEES_PATHS.track}${encodeURIComponent(awb)}`);
    if (!res?.status || !res.data) throw new CourierRejectedError(this.code, `XpressBees has no shipment ${awb}: ${res?.message ?? ''}`.trim());
    return (res.data.history ?? [])
      .filter((h) => h.event_time)
      .map((h) => {
        const words = h.message || h.status_code || '';
        return { status: normalizeCourierStatus(words) ?? h.status_code ?? 'update', at: h.event_time!, location: h.location, description: words };
      });
  }

  async testConnection(): Promise<string> {
    await this.tokens.get();
    try {
      const services = await this.services({
        reference: 'test', paymentMode: 'PREPAID', codAmount: 0, orderValue: 500, weightKg: 0.5,
        pickupPincode: TEST_PINCODE, deliveryPincode: TEST_PINCODE, customer: { name: 'Test', phone: '9999999999' }, items: [],
      });
      return `Signed in; ${services.length} service${services.length === 1 ? '' : 's'} for ${TEST_PINCODE} → ${TEST_PINCODE}`;
    } catch (error) {
      return `Signed in (price check failed: ${(error as Error).message})`;
    }
  }
}
