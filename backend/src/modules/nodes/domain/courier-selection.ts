import type { RateQuote } from '../../courier/domain/courier-provider.types';
import { SelectionStrategy } from './courier-selection.types';

/**
 * Orders quotes by strategy; the first item is the pick and the rest are fallbacks.
 * `balanced` weighs normalised price (60%) against delivery time (40%).
 */
export function rankQuotes(quotes: RateQuote[], strategy: SelectionStrategy, preferred?: string): RateQuote[] {
  const sorted = [...quotes];
  switch (strategy) {
    case 'cheapest':
      return sorted.sort((a, b) => a.total - b.total || a.estimatedDays - b.estimatedDays);
    case 'fastest':
      return sorted.sort((a, b) => a.estimatedDays - b.estimatedDays || a.total - b.total);
    case 'preferred': {
      const rest = sorted.sort((a, b) => a.total - b.total);
      const hit = rest.findIndex((q) => q.courierCode === preferred);
      if (hit > 0) rest.unshift(...rest.splice(hit, 1));
      return rest;
    }
    case 'balanced': {
      const span = (values: number[]) => [Math.min(...values), Math.max(...values) - Math.min(...values) || 1];
      const [minP, spanP] = span(quotes.map((q) => q.total));
      const [minD, spanD] = span(quotes.map((q) => q.estimatedDays));
      const score = (q: RateQuote) => 0.6 * ((q.total - minP) / spanP) + 0.4 * ((q.estimatedDays - minD) / spanD);
      return sorted.sort((a, b) => score(a) - score(b));
    }
  }
}
