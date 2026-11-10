import type { Address, ShipmentItem } from '../api/types';

/** Customer names for generated sample shipments. */
export const SAMPLE_NAMES = ['Aarav Sharma', 'Priya Nair', 'Rohan Gupta', 'Ananya Iyer', 'Vikram Rao', 'Meera Joshi'];

/** Catalog items for generated sample shipments. */
export const SAMPLE_PRODUCTS: Omit<ShipmentItem, 'quantity'>[] = [
  { name: 'Cotton kurta', sku: 'KUR-001', unitPrice: 899 },
  { name: 'Silk dupatta', sku: 'DUP-004', unitPrice: 649 },
  { name: 'Wireless earbuds', sku: 'AUD-210', unitPrice: 2499 },
  { name: 'Steel water bottle', sku: 'BTL-075', unitPrice: 399 },
  { name: 'Running shoes', sku: 'SHO-332', unitPrice: 3199 },
  { name: 'Ceramic mug set', sku: 'MUG-018', unitPrice: 549 },
];

/** Delivery addresses for generated sample shipments. */
export const SAMPLE_ADDRESSES: Address[] = [
  { line1: 'Flat 302, Lotus Residency', line2: '14th Main, HSR Layout', city: 'Bengaluru', state: 'Karnataka', pincode: '560102' },
  { line1: 'B-14, Green Park Extension', city: 'New Delhi', state: 'Delhi', pincode: '110016' },
  { line1: '7, Sea View Apartments', line2: 'Marine Drive', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' },
  { line1: '22, Anna Salai', landmark: 'Near Spencer Plaza', city: 'Chennai', state: 'Tamil Nadu', pincode: '600002' },
  { line1: '45/2, Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016' },
  { line1: 'Plot 9, Jubilee Hills Road 36', city: 'Hyderabad', state: 'Telangana', pincode: '500033' },
  { line1: '11, FC Road', landmark: 'Opp. Fergusson College', city: 'Pune', state: 'Maharashtra', pincode: '411004' },
  { line1: 'C-Scheme, Ashok Marg', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export const HTTP_STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** Workflow trigger keys with a friendlier name than the raw event key. */
export const TRIGGER_LABEL: Record<string, string> = {
  'http.request': 'API request',
  schedule: 'Schedule',
};

/** Below this width the app uses its phone layout (top bar + slide-in menu, stacked builder panels). Keep in step with styles.css. */
export const PHONE_QUERY = '(max-width: 768px)';
