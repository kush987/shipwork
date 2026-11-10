import { formatDateTime } from '../../../lib/format';
import { isCustomEvent } from '../shipments.helpers';
import type { EventTimelineProps } from './drawer.types';

/** The shipment's events, newest first. */
export function EventTimeline({ events, eventLabel }: EventTimelineProps) {
  return (
    <section>
      <h3 className="drawer-h">Event timeline</h3>
      {events.length === 0 ? (
        <p className="muted small">No events yet.</p>
      ) : (
        <ol className="event-timeline">
          {[...events].reverse().map((e, i) => (
            <li key={i}>
              <span className={`ev-dot ${isCustomEvent(e.status) ? 'ev-custom' : `ev-${e.status}`}`} />
              <div>
                <div className="ev-title">
                  {eventLabel(e.status)}
                  {isCustomEvent(e.status) && <span className="ev-kind">custom event</span>}
                </div>
                <div className="ev-meta">
                  {formatDateTime(e.at)} · <span className="mono">{e.source}</span>
                </div>
                {e.note && <div className="ev-note">{e.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
