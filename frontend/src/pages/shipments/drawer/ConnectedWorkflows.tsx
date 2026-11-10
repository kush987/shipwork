import { ChevronRight, Play } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '../../../components/ui';
import { useRunWorkflows } from '../hooks/useShipmentMutations';
import { connectedState, isCustomEvent, sortConnected } from '../shipments.helpers';
import type { ConnectedWorkflow } from '../shipments.types';
import { CONNECTED_STATE_BADGE } from './drawer.constants';
import type { ConnectedWorkflowItemProps, ConnectedWorkflowsProps } from './drawer.types';

/** Every published workflow and whether it has run for this shipment yet — visible even before anything runs. */
export function ConnectedWorkflows({
  shipment,
  waiting,
  workflows,
  ranIds,
  eventLabel,
}: ConnectedWorkflowsProps) {
  const [open, setOpen] = useState(false);
  const run = useRunWorkflows(shipment.id);
  if (!workflows.length) return null;

  const state = (w: ConnectedWorkflow) => connectedState(w, ranIds, shipment);
  const sorted = sortConnected(workflows, state);
  const notRun = sorted.filter((w) => !ranIds.has(w.id));
  const missed = sorted.filter((w) => state(w) === 'missed');
  const runAllNotRun = () => {
    const waitingOnes = notRun.length - missed.length;
    if (
      waitingOnes > 0 &&
      !window.confirm(
        `${waitingOnes} of these workflows start on events that haven't happened to this shipment yet (e.g. NDR or cancellation). Run all ${notRun.length} anyway?`,
      )
    ) {
      return;
    }
    run.mutate(notRun.map((w) => w.id));
  };
  const busy = (ids: string[]) => run.isPending && ids.every((id) => run.variables?.includes(id));
  const blockedTitle = waiting ? 'Trigger the shipment first' : undefined;

  return (
    <div className="connected">
      <div className="connected-head">
        <button type="button" className="connected-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <ChevronRight size={14} className={open ? 'rot-90' : ''} />
          Connected workflows
          <span className="muted small">
            {workflows.length - notRun.length} of {workflows.length} ran
          </span>
        </button>
        {missed.length > 0 && (
          <Button
            size="sm"
            variant="primary"
            icon={Play}
            disabled={waiting || run.isPending}
            loading={busy(missed.map((w) => w.id)) && missed.length > 1}
            title={blockedTitle ?? 'Run the workflows whose event already happened to this shipment but which never ran'}
            onClick={() => run.mutate(missed.map((w) => w.id))}
          >
            Run missed ({missed.length})
          </Button>
        )}
      </div>
      {notRun.length > missed.length && (
        <div className="connected-subhead">
          <button type="button" className="link-inline small" disabled={waiting || run.isPending} onClick={runAllNotRun}>
            Run all not-run ({notRun.length})
          </button>
        </div>
      )}
      {open && (
        <ul className="connected-list">
          {sorted.map((w) => (
            <ConnectedWorkflowItem
              key={w.id}
              workflow={w}
              state={state(w)}
              disabled={waiting || run.isPending}
              loading={busy([w.id]) && run.variables?.length === 1}
              blockedTitle={blockedTitle}
              eventLabel={eventLabel}
              onRun={() => run.mutate([w.id])}
            />
          ))}
        </ul>
      )}
      {waiting && <p className="muted small connected-note">Workflows can be run once the shipment is triggered.</p>}
    </div>
  );
}

function ConnectedWorkflowItem({
  workflow: w,
  state: st,
  disabled,
  loading,
  blockedTitle,
  eventLabel,
  onRun,
}: ConnectedWorkflowItemProps) {
  const didRun = st === 'ran';
  const custom = isCustomEvent(w.triggerEvent!);
  const badge = CONNECTED_STATE_BADGE[st];
  return (
    <li>
      <Link to={`/workflows/${w.id}`} className="connected-name">
        {w.name}
      </Link>
      <span className="connected-event">
        starts on {eventLabel(w.triggerEvent!)}
        {custom && !didRun && ' · runs without event data'}
      </span>
      <span className="connected-status">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <Button
          size="sm"
          variant={didRun ? 'ghost' : 'secondary'}
          icon={Play}
          disabled={disabled}
          loading={loading}
          title={
            blockedTitle ??
            (didRun
              ? 'Runs it again — any notifications or calls in it happen again'
              : st === 'waiting'
                ? `Runs now, even though “${eventLabel(w.triggerEvent!)}” hasn't happened to this shipment`
                : `Run ${w.name} now`)
          }
          onClick={onRun}
        >
          {didRun ? 'Run again' : 'Run'}
        </Button>
      </span>
    </li>
  );
}
