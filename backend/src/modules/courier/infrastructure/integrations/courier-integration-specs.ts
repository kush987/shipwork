import { BASE_URL_FIELD } from '../../domain/courier-integration.constants';
import type { CourierIntegrationSpec, IntegrationField } from '../../domain/courier-integration.types';
import { BLUEDART_SETTINGS } from './bluedart/bluedart.api';
import { DELHIVERY_SETTINGS } from './delhivery/delhivery.api';
import { EKART_SETTINGS } from './ekart/ekart.api';
import { XPRESSBEES_SETTINGS } from './xpressbees/xpressbees.api';

/** Every courier's optional host override (the Couriers page shows each environment's default). */
const baseUrl = (): IntegrationField => ({ key: BASE_URL_FIELD, label: 'API base URL' });

/** What each courier's API needs, keyed by courier code. Adding a courier's API = a spec here + an adapter. */
export const COURIER_INTEGRATION_SPECS: Record<string, CourierIntegrationSpec> = {
  delhivery: {
    code: 'delhivery',
    docsUrl: 'https://one.delhivery.com/developer-portal/documents',
    baseUrls: { sandbox: 'https://staging-express.delhivery.com', live: 'https://track.delhivery.com' },
    rates: 'api',
    testDescription: `Checks pincode 110001 with Delhivery's pincode API (proves the API token).`,
    fields: [
      { key: DELHIVERY_SETTINGS.token, label: 'API token', secret: true, required: true, help: 'Delhivery One → Settings → API setup' },
      { key: DELHIVERY_SETTINGS.pickupLocation, label: 'Pickup location name', required: true, help: 'Exactly as the warehouse is registered with Delhivery' },
      baseUrl(),
    ],
  },
  xpressbees: {
    code: 'xpressbees',
    baseUrls: { sandbox: 'https://shipment.xpressbees.com', live: 'https://shipment.xpressbees.com' },
    rates: 'api',
    testDescription: 'Signs in with the email and password, then asks for services from 110001 to 110001.',
    fields: [
      { key: XPRESSBEES_SETTINGS.email, label: 'Account email', required: true },
      { key: XPRESSBEES_SETTINGS.password, label: 'Password', secret: true, required: true },
      { key: XPRESSBEES_SETTINGS.warehouse, label: 'Pickup warehouse name', help: 'As registered with XpressBees; empty uses the parcel’s pickup contact name' },
      { key: XPRESSBEES_SETTINGS.courierId, label: 'Service id', help: 'Book this XpressBees service only (e.g. surface, air); empty picks the cheapest' },
      baseUrl(),
    ],
  },
  bluedart: {
    code: 'bluedart',
    docsUrl: 'https://apiportal.bluedart.com',
    baseUrls: {
      sandbox: 'https://apigateway-sandbox.bluedart.com/in/transportation',
      live: 'https://apigateway.bluedart.com/in/transportation',
    },
    rates: 'rate-card',
    testDescription: 'Gets a token with the client id and secret, then checks pincode 110001 (proves the login id and licence key).',
    fields: [
      { key: BLUEDART_SETTINGS.clientId, label: 'Client ID', required: true, help: 'From the Blue Dart API portal app' },
      { key: BLUEDART_SETTINGS.clientSecret, label: 'Client secret', secret: true, required: true },
      { key: BLUEDART_SETTINGS.loginId, label: 'Login ID', required: true },
      { key: BLUEDART_SETTINGS.licenceKey, label: 'Licence key', secret: true, required: true },
      { key: BLUEDART_SETTINGS.customerCode, label: 'Customer code', required: true },
      { key: BLUEDART_SETTINGS.originArea, label: 'Origin area', required: true, help: 'Your pickup area code, e.g. DEL' },
      { key: BLUEDART_SETTINGS.productCode, label: 'Product code', placeholder: 'A', help: 'Empty uses A (Domestic Priority)' },
      baseUrl(),
    ],
  },
  ekart: {
    code: 'ekart',
    baseUrls: { sandbox: 'https://app.elite.ekartlogistics.in', live: 'https://app.elite.ekartlogistics.in' },
    rates: 'rate-card',
    testDescription: 'Gets a token with the client id, username and password, then checks pincode 110001.',
    fields: [
      { key: EKART_SETTINGS.clientId, label: 'Client ID', required: true },
      { key: EKART_SETTINGS.username, label: 'Username', required: true },
      { key: EKART_SETTINGS.password, label: 'Password', secret: true, required: true },
      { key: EKART_SETTINGS.sellerName, label: 'Seller name', help: 'Printed on the label; empty uses the parcel’s pickup contact' },
      { key: EKART_SETTINGS.gstin, label: 'Seller GSTIN' },
      baseUrl(),
    ],
  },
};
