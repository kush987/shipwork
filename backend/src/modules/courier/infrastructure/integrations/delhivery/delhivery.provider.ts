import { CourierRejectedError } from '../../../domain/courier-provider';
import { normalizeCourierStatus } from '../../../domain/courier-status';
import { TEST_PINCODE } from '../../../domain/courier-integration.constants';
import type { BookingResult, ParcelDetails, RateQuote, ServiceabilityResult, TrackingEvent } from '../../../domain/courier-provider.types';
import { RealCourierBase, money } from '../real-courier.base';
import { addressLine, grams, itemsText, phone10, quantityOf, returnAddress, yes } from '../parcel-format';
import { DELHIVERY_PATHS, DELHIVERY_SETTINGS, DELHIVERY_UNSAFE_TEXT } from './delhivery.api';
import type { DelhiveryCharge, DelhiveryCreateResponse, DelhiveryPincodeResponse, DelhiveryTrackResponse } from './delhivery.types';

const clean = (text: string | null | undefined) => String(text ?? '').replace(DELHIVERY_UNSAFE_TEXT, ' ').trim();

/** Delhivery's B2C API: token auth; bookings are made against a pickup location registered with Delhivery. */
export class DelhiveryProvider extends RealCourierBase {
  private headers() {
    return { authorization: `Token ${this.setting(DELHIVERY_SETTINGS.token)}`, accept: 'application/json' };
  }

  private async pincode(pin: string) {
    const body = await this.api.send<DelhiveryPincodeResponse>({ method: 'GET', path: DELHIVERY_PATHS.serviceability, headers: this.headers(), query: { filter_codes: pin } });
    return body?.delivery_codes?.[0]?.postal_code ?? null;
  }

  async checkServiceability(parcel: ParcelDetails): Promise<ServiceabilityResult> {
    const pin = await this.pincode(parcel.deliveryPincode);
    if (!pin) return { serviceable: false, reason: `Delhivery does not deliver to ${parcel.deliveryPincode}` };
    if (parcel.paymentMode === 'COD' && !yes(pin.cod)) return { serviceable: false, reason: `No COD to ${parcel.deliveryPincode}` };
    if (parcel.paymentMode === 'PREPAID' && !yes(pin.pre_paid)) return { serviceable: false, reason: `No prepaid delivery to ${parcel.deliveryPincode}` };
    return { serviceable: true };
  }

  async getRate(parcel: ParcelDetails): Promise<RateQuote> {
    const charges = await this.api.send<DelhiveryCharge[] | DelhiveryCharge>({
      method: 'GET',
      path: DELHIVERY_PATHS.rates,
      headers: this.headers(),
      query: {
        md: 'S',
        ss: 'Delivered',
        o_pin: parcel.pickupPincode,
        d_pin: parcel.deliveryPincode,
        cgm: grams(parcel.weightKg),
        pt: parcel.paymentMode === 'COD' ? 'COD' : 'Pre-paid',
        cod: parcel.paymentMode === 'COD' ? parcel.codAmount : 0,
      },
    });
    const charge = Array.isArray(charges) ? charges[0] : charges;
    if (!charge?.total_amount) throw new CourierRejectedError(this.code, 'Delhivery returned no price for this parcel');
    // Zone and delivery days aren't in the answer: they come from the rate card.
    const card = this.rateCardQuote(parcel);
    const codFee = money(charge.charge_COD);
    return { ...card, total: money(charge.total_amount), codFee, freight: money(charge.total_amount) - codFee };
  }

  async createShipment(parcel: ParcelDetails): Promise<BookingResult> {
    const to = parcel.deliveryAddress;
    const back = returnAddress(parcel);
    const data = {
      pickup_location: { name: this.setting(DELHIVERY_SETTINGS.pickupLocation) },
      shipments: [
        {
          order: parcel.reference,
          name: clean(parcel.customer.name),
          phone: phone10(parcel.customer.phone),
          add: clean(addressLine(to)),
          pin: parcel.deliveryPincode,
          city: clean(to?.city),
          state: clean(to?.state),
          country: 'India',
          payment_mode: parcel.paymentMode === 'COD' ? 'COD' : 'Prepaid',
          cod_amount: parcel.paymentMode === 'COD' ? parcel.codAmount : 0,
          total_amount: parcel.orderValue,
          products_desc: clean(itemsText(parcel)),
          quantity: quantityOf(parcel),
          weight: grams(parcel.weightKg),
          shipment_length: parcel.dimensions?.lengthCm,
          shipment_width: parcel.dimensions?.breadthCm,
          shipment_height: parcel.dimensions?.heightCm,
          shipping_mode: 'Surface',
          seller_name: clean(parcel.pickupContact?.name),
          return_name: clean(parcel.pickupContact?.name),
          return_phone: phone10(parcel.pickupContact?.phone),
          return_add: clean(addressLine(back)),
          return_pin: back?.pincode,
          return_city: clean(back?.city),
          return_state: clean(back?.state),
          return_country: 'India',
        },
      ],
    };
    const res = await this.api.send<DelhiveryCreateResponse>({
      method: 'POST',
      path: DELHIVERY_PATHS.create,
      headers: { ...this.headers(), 'content-type': 'application/json' },
      // Delhivery takes this form-style body, as in its documentation.
      body: `format=json&data=${JSON.stringify(data)}`,
    });
    const pkg = res?.packages?.[0];
    if (!res?.success || !pkg?.waybill || /fail/i.test(pkg.status ?? '')) {
      const remarks = Array.isArray(pkg?.remarks) ? pkg.remarks.join('; ') : pkg?.remarks;
      throw new CourierRejectedError(this.code, `Delhivery did not book it: ${remarks || res?.rmk || 'no reason given'}`);
    }
    return { awb: pkg.waybill, courierCode: this.code, labelUrl: await this.labelUrl(pkg.waybill), reference: parcel.reference };
  }

  /** The PDF label's link; empty when Delhivery has none yet (the booking still stands). */
  private async labelUrl(awb: string): Promise<string> {
    try {
      const res = await this.api.send<{ packages?: { pdf_download_link?: string }[] }>({ method: 'GET', path: DELHIVERY_PATHS.label, headers: this.headers(), query: { wbns: awb, pdf: 'true' } });
      return res?.packages?.[0]?.pdf_download_link ?? '';
    } catch {
      return '';
    }
  }

  async cancelShipment(awb: string): Promise<{ cancelled: boolean }> {
    const res = await this.api.send<{ status?: boolean | string; remark?: string; error?: string }>({
      method: 'POST',
      path: DELHIVERY_PATHS.cancel,
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: { waybill: awb, cancellation: 'true' },
    });
    if (!yes(res?.status)) throw new CourierRejectedError(this.code, `Delhivery did not cancel ${awb}: ${res?.remark ?? res?.error ?? 'no reason given'}`);
    return { cancelled: true };
  }

  private async shipment(query: Record<string, string>) {
    const res = await this.api.send<DelhiveryTrackResponse>({ method: 'GET', path: DELHIVERY_PATHS.track, headers: this.headers(), query });
    return res?.ShipmentData?.[0]?.Shipment ?? null;
  }

  async findShipmentByReference(reference: string): Promise<BookingResult | null> {
    const shipment = await this.shipment({ ref_ids: reference });
    return shipment?.AWB ? { awb: shipment.AWB, courierCode: this.code, labelUrl: '', reference } : null;
  }

  async trackShipment(awb: string): Promise<TrackingEvent[]> {
    const shipment = await this.shipment({ waybill: awb });
    if (!shipment) throw new CourierRejectedError(this.code, `Delhivery has no shipment ${awb}`);
    return (shipment.Scans ?? [])
      .map((s) => s.ScanDetail)
      .filter((d): d is NonNullable<typeof d> => !!d?.ScanDateTime)
      .map((d) => {
        const words = [d.Scan, d.Instructions].filter(Boolean).join(' — ');
        return { status: normalizeCourierStatus(words) ?? d.Scan ?? 'update', at: d.ScanDateTime!, location: d.ScannedLocation, description: words };
      });
  }

  async testConnection(): Promise<string> {
    const pin = await this.pincode(TEST_PINCODE);
    if (!this.setting(DELHIVERY_SETTINGS.pickupLocation)) return 'Signed in, but no pickup location is set — bookings need one';
    return pin ? `Signed in; pincode ${TEST_PINCODE} is served (COD: ${yes(pin.cod) ? 'yes' : 'no'})` : `Signed in; pincode ${TEST_PINCODE} is not served`;
  }
}
