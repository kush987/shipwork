import { CourierRejectedError, CourierUnavailableError } from '../../domain/courier-provider';
import { normalizeCourierStatus } from '../../domain/courier-status';
import type { ParcelDetails } from '../../domain/courier-provider.types';
import type { OutboundHttp } from '../../../../shared/http/outbound-http';
import type { OutboundRequest, OutboundResponse } from '../../../../shared/http/outbound-http.types';
import { OutboundHttpError } from '../../../../shared/http/outbound-http';
import { CourierAuthError } from './courier-http';
import { DelhiveryProvider } from './delhivery/delhivery.provider';
import { XpressbeesProvider } from './xpressbees/xpressbees.provider';
import { BluedartProvider } from './bluedart/bluedart.provider';
import { EkartProvider } from './ekart/ekart.provider';

const CARD = { baseRate: 40, perKgRate: 20, codFeePct: 2, codMinFee: 30, avgDeliveryDays: 4 };

/** Answers by "METHOD path" (first match wins); records every request. */
function fakeHttp(routes: [string, (req: OutboundRequest) => Partial<OutboundResponse> | Error][]) {
  const calls: OutboundRequest[] = [];
  const http = {
    request: async (req: OutboundRequest) => {
      calls.push(req);
      const path = new URL(req.url).pathname;
      const route = routes.find(([key]) => {
        const [method, p] = key.split(' ');
        return method === req.method && path.startsWith(p);
      });
      if (!route) throw new Error(`No fake route for ${req.method} ${path}`);
      const res = route[1](req);
      if (res instanceof Error) throw res;
      return { status: 200, ok: true, headers: {}, durationMs: 1, url: req.url, body: null, ...res } as OutboundResponse;
    },
  } as unknown as OutboundHttp;
  return { http, calls };
}

const parcel: ParcelDetails = {
  reference: 'ship_1',
  paymentMode: 'COD',
  codAmount: 1500,
  orderValue: 1500,
  weightKg: 1.2,
  pickupPincode: '110020',
  deliveryPincode: '560001',
  customer: { name: 'Meera Iyer', phone: '+91 98450 12345' },
  items: [{ name: 'Kurta & scarf', sku: 'KU-1', quantity: 2, unitPrice: 750 }],
  dimensions: { lengthCm: 20, breadthCm: 15, heightCm: 10 },
  pickupContact: { name: 'Asha Traders', phone: '9811111111' },
  pickupAddress: { line1: 'Plot 4, Okhla Phase 2', city: 'New Delhi', state: 'Delhi', pincode: '110020' },
  deliveryAddress: { line1: '12 MG Road', line2: 'Near Trinity Metro', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  rtoAddress: { line1: 'Plot 9', line2: 'Sector 37', city: 'Gurugram', state: 'Haryana', pincode: '122001' },
};

const creds = (values: Record<string, string>, baseUrl = 'https://courier.example') => ({ env: 'sandbox' as const, baseUrl, values });

describe('Delhivery adapter', () => {
  const make = (routes: Parameters<typeof fakeHttp>[0]) => {
    const fake = fakeHttp(routes);
    return { ...fake, courier: new DelhiveryProvider('delhivery', 'Delhivery', fake.http, creds({ apiToken: 'tok123', pickupLocation: 'Okhla WH' }), CARD) };
  };

  it('books with the token, the pickup location and the form-style body; returns the waybill and label', async () => {
    const { courier, calls } = make([
      ['POST /api/cmu/create.json', () => ({ body: { success: true, packages: [{ status: 'Success', waybill: '1490811234567', refnum: 'ship_1' }] } })],
      ['GET /api/p/packing_slip', () => ({ body: { packages: [{ pdf_download_link: 'https://labels.example/1490811234567.pdf' }] } })],
    ]);
    const booking = await courier.createShipment(parcel);
    expect(booking).toEqual({ awb: '1490811234567', courierCode: 'delhivery', labelUrl: 'https://labels.example/1490811234567.pdf', reference: 'ship_1' });
    const create = calls[0];
    expect(create.headers?.authorization).toBe('Token tok123');
    expect(String(create.body)).toMatch(/^format=json&data=\{/);
    const data = JSON.parse(String(create.body).slice('format=json&data='.length));
    expect(data.pickup_location).toEqual({ name: 'Okhla WH' });
    expect(data.shipments[0]).toMatchObject({ order: 'ship_1', pin: '560001', phone: '9845012345', payment_mode: 'COD', cod_amount: 1500, weight: 1200, return_pin: '122001' });
    // Characters Delhivery's manifest API rejects are taken out of free text.
    expect(data.shipments[0].products_desc).toBe('Kurta   scarf x2');
  });

  it('a failed package is a rejection with Delhivery’s remarks; 401 is a credentials error; 503 means unavailable', async () => {
    await expect(make([['POST /api/cmu/create.json', () => ({ body: { success: false, packages: [{ status: 'Fail', remarks: ['Duplicate order id'] }] } })]]).courier.createShipment(parcel)).rejects.toThrow(
      new CourierRejectedError('delhivery', 'Delhivery did not book it: Duplicate order id'),
    );
    await expect(make([['GET /c/api/pin-codes/json/', () => ({ status: 401, ok: false, body: { detail: 'Invalid token' } })]]).courier.checkServiceability(parcel)).rejects.toBeInstanceOf(CourierAuthError);
    await expect(make([['GET /c/api/pin-codes/json/', () => ({ status: 503, ok: false, body: 'down' })]]).courier.checkServiceability(parcel)).rejects.toBeInstanceOf(CourierUnavailableError);
    // A timeout stays an "unknown outcome" for the gateway (it reconciles before booking again).
    await expect(
      make([['POST /api/cmu/create.json', () => new OutboundHttpError('timeout', 'POST staging-express.delhivery.com timed out after 15000 ms')]]).courier.createShipment(parcel),
    ).rejects.toThrow(/timed out/);
  });

  it('serviceability and prices from its APIs; tracking normalised; a lost booking found by reference', async () => {
    const { courier, calls } = make([
      ['GET /c/api/pin-codes/json/', () => ({ body: { delivery_codes: [{ postal_code: { pin: 560001, cod: 'Y', pre_paid: 'Y' } }] } })],
      ['GET /api/kinko/v1/invoice/charges/.json', () => ({ body: [{ total_amount: 171.1, gross_amount: 145, charge_COD: 35 }] })],
      [
        'GET /api/v1/packages/json/',
        (req) =>
          req.query?.ref_ids
            ? { body: { ShipmentData: [{ Shipment: { AWB: '1490811234567' } }] } }
            : {
                body: {
                  ShipmentData: [
                    {
                      Shipment: {
                        Scans: [
                          { ScanDetail: { Scan: 'Manifested', ScanDateTime: '2026-11-09T10:00:00', ScannedLocation: 'Delhi' } },
                          { ScanDetail: { Scan: 'In Transit', Instructions: 'Shipment picked up', ScanDateTime: '2026-11-09T18:00:00', ScannedLocation: 'Delhi_Okhla' } },
                          { ScanDetail: { Scan: 'Dispatched', Instructions: 'Out for delivery', ScanDateTime: '2026-11-11T09:00:00', ScannedLocation: 'Bengaluru' } },
                          { ScanDetail: { Scan: 'Delivered', ScanDateTime: '2026-11-11T15:00:00', ScannedLocation: 'Bengaluru' } },
                        ],
                      },
                    },
                  ],
                },
              },
      ],
    ]);
    expect(await courier.checkServiceability(parcel)).toEqual({ serviceable: true });
    expect(calls[0].query).toEqual({ filter_codes: '560001' });
    expect(await courier.getRate(parcel)).toMatchObject({ total: 171.1, codFee: 35, freight: 136.1, courierCode: 'delhivery' });
    expect(calls[1].query).toMatchObject({ o_pin: '110020', d_pin: '560001', cgm: 1200, pt: 'COD', cod: 1500 });
    expect((await courier.trackShipment('1490811234567')).map((e) => e.status)).toEqual(['manifested', 'picked_up', 'out_for_delivery', 'delivered']);
    expect(await courier.findShipmentByReference('ship_1')).toMatchObject({ awb: '1490811234567' });
  });
});

describe('XpressBees adapter', () => {
  it('signs in once, reuses the token, and signs in again when the token is refused', async () => {
    let logins = 0;
    let refuseNext = false;
    const { http, calls } = fakeHttp([
      ['POST /api/users/login', () => ({ body: { status: true, data: `token-${++logins}` } })],
      [
        'POST /api/courier/serviceability',
        () => {
          if (refuseNext) {
            refuseNext = false;
            return { status: 401, ok: false, body: { message: 'Token expired' } };
          }
          return { body: { status: true, data: [{ id: 2, name: 'Air', freight_charges: 150, cod_charges: 40, total_charges: 190 }, { id: 1, name: 'Surface', freight_charges: 90, cod_charges: 30, total_charges: 120 }] } };
        },
      ],
      ['POST /api/shipments2', () => ({ body: { status: true, data: { awb_number: 'XB123', label: 'https://xb.example/label.pdf' } } })],
    ]);
    const courier = new XpressbeesProvider('xpressbees', 'XpressBees', http, creds({ email: 'ops@seller.in', password: 'pw' }), CARD);
    expect(await courier.getRate(parcel)).toMatchObject({ total: 120, freight: 90, codFee: 30 });
    expect(await courier.checkServiceability(parcel)).toEqual({ serviceable: true });
    expect(logins).toBe(1);
    refuseNext = true;
    expect(await courier.getRate(parcel)).toMatchObject({ total: 120 });
    expect(logins).toBe(2);
    expect(calls.filter((c) => c.url.endsWith('/serviceability')).at(-1)?.headers?.authorization).toBe('Bearer token-2');

    const booking = await courier.createShipment(parcel);
    expect(booking).toMatchObject({ awb: 'XB123', labelUrl: 'https://xb.example/label.pdf' });
    const body = calls.at(-1)!.body as Record<string, any>;
    expect(body).toMatchObject({ order_number: 'ship_1', payment_type: 'cod', collectable_amount: 1500, package_weight: 1200, is_rto_different: 'yes' });
    expect(body.consignee).toMatchObject({ pincode: '560001', phone: '9845012345' });
    expect(body.order_items).toEqual([{ name: 'Kurta & scarf', sku: 'KU-1', qty: 2, price: 750 }]);
  });

  it('a failed sign-in is a rejection naming XpressBees', async () => {
    const { http } = fakeHttp([['POST /api/users/login', () => ({ body: { status: false, message: 'Invalid credentials' } })]]);
    const courier = new XpressbeesProvider('xpressbees', 'XpressBees', http, creds({ email: 'x', password: 'y' }), CARD);
    await expect(courier.testConnection()).rejects.toThrow('XpressBees sign-in failed: Invalid credentials');
  });
});

describe('Blue Dart adapter', () => {
  const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.y`;
  const make = (routes: Parameters<typeof fakeHttp>[0]) => {
    const fake = fakeHttp([['GET /in/transportation/token/v1/login', () => ({ body: { JWTToken: token } })], ...routes]);
    const values = { clientId: 'cid', clientSecret: 'csecret', loginId: 'DEL123', licenceKey: 'lic', customerCode: '123456', originArea: 'DEL' };
    return { ...fake, courier: new BluedartProvider('bluedart', 'Blue Dart', fake.http, creds(values, 'https://bd.example/in/transportation'), CARD) };
  };

  it('books with the JWT and profile; three 30-character address lines; rejections carry Blue Dart’s status text', async () => {
    const { courier, calls } = make([['POST /in/transportation/waybill/v1/GenerateWayBill', () => ({ body: { GenerateWayBillResult: { AWBNo: '69012345678', IsError: false } } })]]);
    expect(await courier.createShipment(parcel)).toMatchObject({ awb: '69012345678', courierCode: 'bluedart' });
    expect(calls[0].headers).toMatchObject({ ClientID: 'cid', clientSecret: 'csecret' });
    const req = calls[1];
    expect(req.headers?.JWTToken).toBe(token);
    const body = req.body as Record<string, any>;
    expect(body.Profile).toEqual({ Api_type: 'S', LicenceKey: 'lic', LoginID: 'DEL123' });
    expect(body.Request.Services).toMatchObject({ ProductCode: 'A', SubProductCode: 'C', CollectableAmount: 1500, CreditReferenceNo: 'ship_1' });
    expect(body.Request.Shipper).toMatchObject({ CustomerCode: '123456', OriginArea: 'DEL', CustomerPincode: '110020' });
    for (const k of ['ConsigneeAddress1', 'ConsigneeAddress2', 'ConsigneeAddress3']) expect(body.Request.Consignee[k].length).toBeLessThanOrEqual(30);

    const refused = make([['POST /in/transportation/waybill/v1/GenerateWayBill', () => ({ body: { GenerateWayBillResult: { IsError: true, Status: [{ StatusInformation: 'Invalid pincode' }] } } })]]);
    await expect(refused.courier.createShipment(parcel)).rejects.toThrow('Blue Dart did not book it: Invalid pincode');
  });

  it('prices from the rate card (no rate API); tracking reads DD-Mon-YYYY scan times', async () => {
    const { courier } = make([
      [
        'GET /in/transportation/tracking/v1/shipment',
        () => ({
          body: {
            ShipmentData: {
              Shipment: [
                {
                  Scans: [
                    { ScanDetail: { Scan: 'SHIPMENT DELIVERED', ScanDate: '11-Nov-2026', ScanTime: '15:20', ScannedLocation: 'BANGALORE' } },
                    { ScanDetail: { Scan: 'SHIPMENT PICKED UP', ScanDate: '09-Nov-2026', ScanTime: '18:05', ScannedLocation: 'DELHI' } },
                  ],
                },
              ],
            },
          },
        }),
      ],
    ]);
    expect((await courier.getRate(parcel)).total).toBeGreaterThan(0);
    const events = await courier.trackShipment('69012345678');
    expect(events.map((e) => [e.status, e.at])).toEqual([
      ['picked_up', '2026-11-09T12:35:00.000Z'],
      ['delivered', '2026-11-11T09:50:00.000Z'],
    ]);
  });
});

describe('Ekart adapter', () => {
  it('gets a token for its client id, books with PUT and tracks', async () => {
    const { http, calls } = fakeHttp([
      ['POST /integrations/v2/auth/token/', () => ({ body: { access_token: 'ek-token', expires_in: 3600 } })],
      ['PUT /api/v1/package/create', () => ({ body: { status: true, tracking_id: 'EKT123' } })],
      ['GET /api/v1/track/', () => ({ body: { track: { details: [{ status: 'Out For Delivery', ctime: Date.parse('2026-11-11T03:30:00Z'), location: 'Bengaluru' }] } } })],
      ['DELETE /api/v1/package/cancel', () => ({ body: { status: false, remark: 'Already picked up' } })],
    ]);
    const courier = new EkartProvider('ekart', 'Ekart', http, creds({ clientId: 'EKC', username: 'u', password: 'p' }), CARD);
    expect(await courier.createShipment(parcel)).toMatchObject({ awb: 'EKT123' });
    expect(new URL(calls[0].url).pathname).toBe('/integrations/v2/auth/token/EKC');
    expect(calls[1].headers?.authorization).toBe('Bearer ek-token');
    expect(calls[1].body).toMatchObject({ order_number: 'ship_1', payment_mode: 'COD', weight: 1200, drop_location: { pin: '560001' }, return_location: { pin: '122001' } });
    expect(await courier.trackShipment('EKT123')).toEqual([{ status: 'out_for_delivery', at: '2026-11-11T03:30:00.000Z', location: 'Bengaluru', description: 'Out For Delivery' }]);
    await expect(courier.cancelShipment('EKT123')).rejects.toThrow('Ekart did not cancel EKT123: Already picked up');
  });
});

describe('courier scan wording → ShipFlow statuses', () => {
  it.each([
    ['Shipment Picked Up', 'picked_up'],
    ['In Transit - Reached Hub', 'in_transit'],
    ['Out For Delivery', 'out_for_delivery'],
    ['Delivered to consignee', 'delivered'],
    ['Undelivered - Consignee not available', 'ndr'],
    ['RTO Initiated', 'rto_initiated'],
    ['RTO In Transit', 'rto_in_transit'],
    ['Returned to origin - Delivered', 'rto_delivered'],
    ['Cancelled by seller', 'cancelled'],
    ['Manifested', 'manifested'],
    ['Weather delay', null],
  ])('%s → %s', (text, status) => expect(normalizeCourierStatus(text)).toBe(status));
});
