import { compact, uniq } from 'lodash';
import { NonRetryableError } from '../../../../shared/domain/errors';
import type { RateQuote } from '../../../courier/domain/courier-provider.types';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';
import type { Shipment } from '../../../shipment/domain/shipment.types';

export { toParcel } from '../../../shipment/application/to-parcel';

export function requireShipment(ctx: NodeExecutionContext): Shipment {
  if (!ctx.data.shipment) {
    throw new NonRetryableError('This step needs a shipment — start from a shipment event, or add a "Use shipment" step before it');
  }
  return ctx.data.shipment;
}

export const contextQuotes = (ctx: NodeExecutionContext): RateQuote[] =>
  Array.isArray(ctx.data.context.rates) ? (ctx.data.context.rates as RateQuote[]) : [];

/** Couriers to try in order: an explicit override, else the selected one then the ranked fallbacks. */
export function courierCandidates(ctx: NodeExecutionContext): string[] {
  if (ctx.config.courier) return [String(ctx.config.courier)];
  const selected = (ctx.data.context.selectedCourier as RateQuote | undefined)?.courierCode;
  const ranked = Array.isArray(ctx.data.context.rankedCouriers) ? (ctx.data.context.rankedCouriers as string[]) : [];
  const ordered = uniq(compact([selected, ...ranked]));
  return ctx.config.fallback === false ? ordered.slice(0, 1) : ordered;
}
