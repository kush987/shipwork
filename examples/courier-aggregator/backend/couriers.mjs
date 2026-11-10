/**
 * Starting rate cards, saved as records in the `couriers` collection. They are sample prices,
 * not anyone's real tariff: change them on the Data page and the next quote uses the new ones.
 *
 * Zones (worked out by the “Quote couriers” step from the two pincodes):
 *   A within the city · B within the region · C metro to metro · D rest of India · E J&K, Ladakh and the North-East
 * Each zone: first = price of the first 0.5 kg, extra = each further 0.5 kg, days = delivery days.
 */
const rates = (a, b, c, d, e) => ({
  A: { first: a[0], extra: a[1], days: a[2] },
  B: { first: b[0], extra: b[1], days: b[2] },
  C: { first: c[0], extra: c[1], days: c[2] },
  D: { first: d[0], extra: d[1], days: d[2] },
  E: { first: e[0], extra: e[1], days: e[2] },
});

export const COURIERS = [
  {
    code: 'delhivery',
    name: 'Delhivery Surface',
    active: true,
    awbPrefix: 'DL',
    cod: true,
    maxWeightKg: 30,
    blockedPrefixes: ['194'],
    rates: rates([32, 28, 2], [38, 32, 3], [46, 40, 4], [52, 46, 5], [70, 62, 8]),
    codFixed: 35,
    codPercent: 1.75,
  },
  {
    code: 'xpressbees',
    name: 'Xpressbees',
    active: true,
    awbPrefix: 'XB',
    cod: true,
    maxWeightKg: 20,
    blockedPrefixes: ['744', '194'],
    rates: rates([30, 27, 2], [36, 31, 3], [44, 39, 4], [50, 45, 5], [74, 66, 9]),
    codFixed: 30,
    codPercent: 1.9,
  },
  {
    code: 'bluedart',
    name: 'Blue Dart Air',
    active: true,
    awbPrefix: 'BD',
    cod: false,
    maxWeightKg: 10,
    blockedPrefixes: [],
    rates: rates([45, 40, 1], [55, 48, 2], [65, 58, 2], [78, 70, 3], [95, 85, 4]),
    codFixed: 0,
    codPercent: 0,
  },
  {
    code: 'ekart',
    name: 'Ekart',
    active: true,
    awbPrefix: 'EK',
    cod: true,
    maxWeightKg: 15,
    blockedPrefixes: ['18', '19', '79'],
    rates: rates([29, 26, 3], [35, 30, 4], [42, 37, 5], [48, 43, 6], [80, 70, 10]),
    codFixed: 28,
    codPercent: 2,
  },
];
