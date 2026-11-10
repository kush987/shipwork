import { rankQuotes } from './courier-selection';
import type { RateQuote } from '../../courier/domain/courier-provider.types';

const quote = (courierCode: string, total: number, estimatedDays: number): RateQuote => ({
  courierCode,
  courierName: courierCode,
  total,
  freight: total,
  codFee: 0,
  estimatedDays,
  zone: 'national',
});

const quotes = [quote('ekart', 120, 5), quote('bluedart', 210, 2), quote('delhivery', 140, 3)];

describe('rankQuotes', () => {
  it('cheapest puts the lowest total first', () => {
    expect(rankQuotes(quotes, 'cheapest').map((q) => q.courierCode)).toEqual(['ekart', 'delhivery', 'bluedart']);
  });

  it('fastest puts the shortest ETA first', () => {
    expect(rankQuotes(quotes, 'fastest')[0].courierCode).toBe('bluedart');
  });

  it('preferred promotes the preferred courier and keeps the rest as cheapest-first fallbacks', () => {
    expect(rankQuotes(quotes, 'preferred', 'delhivery').map((q) => q.courierCode)).toEqual([
      'delhivery',
      'ekart',
      'bluedart',
    ]);
  });

  it('balanced trades price against speed', () => {
    expect(rankQuotes(quotes, 'balanced')[0].courierCode).toBe('delhivery');
  });
});
