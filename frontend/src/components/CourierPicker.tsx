import { humanize, inr, pluralize } from '../lib/format';
import { CircuitBadge } from './CircuitBadge';
import { isPickable } from './CourierPicker.helpers';
import type { CourierPickerProps } from './CourierPicker.types';
import { Badge, ErrorState, Skeleton } from './ui';

/** Radio list of couriers with live price, ETA and health. Used when creating and (re)assigning. */
export function CourierPicker({ options, loading, error, onRetry, selected, onSelect }: CourierPickerProps) {
  if (loading) {
    return (
      <div className="form-stack">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={58} />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  return (
    <div className="courier-options" role="radiogroup" aria-label="Courier">
      {(options ?? []).map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={selected === o.courierCode}
          key={o.courierCode}
          disabled={!isPickable(o)}
          className={`courier-option${selected === o.courierCode ? ' selected' : ''}`}
          onClick={() => onSelect(o.courierCode)}
        >
          <span className="courier-option-radio" />
          <span className="courier-option-main">
            <span className="courier-option-name">
              {o.courierName}
              {o.current && <Badge tone="accent">Current</Badge>}
              <CircuitBadge circuit={o.circuit} />
            </span>
            <span className="courier-option-meta">
              {o.serviceable && o.quote
                ? `${pluralize(o.quote.estimatedDays, 'day')} · ${humanize(o.quote.zone)} zone`
                : (o.reason ?? 'No quote available')}
            </span>
          </span>
          {o.quote && o.serviceable && (
            <span className="courier-option-price">
              <strong>{inr(o.quote.total)}</strong>
              <span>
                {inr(o.quote.freight)} freight{o.quote.codFee ? ` + ${inr(o.quote.codFee)} COD` : ''}
              </span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
