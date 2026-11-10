import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import type { HttpMethod, ShipmentInput, TestRecordChange } from '../api/types';
import { HttpResponseView } from '../components/HttpResponseView';
import { JsonField } from '../components/JsonField';
import { MethodBadge } from '../components/MethodBadge';
import { ShipmentForm } from '../components/ShipmentForm';
import { Button, Field, Modal } from '../components/ui';
import { methodHasBody } from '../lib/endpoints';
import { HTTP_METHODS } from '../lib/endpoints.constants';
import { sampleShipment } from '../lib/format';
import { SAMPLE_RECORD_CHANGE, TEST_RUN_DESCRIPTION } from './builder.constants';
import { useJsonText } from '../lib/useJsonText';
import type { BoundEndpointsProps, RequestTestFormProps, TestRunModalProps } from './builder.types';
import { useRequestDraft } from './useRequestDraft';
import { useCallerDraft } from './useCallerDraft';
import { RunAsFields } from './RunAsFields';

/** Test run whose input depends on the trigger: a shipment (event), a request (http) or nothing (schedule). */
export function TestRunModal({
  open,
  onClose,
  onRun,
  running,
  dirty,
  triggerKind,
  workflowId,
  result,
}: TestRunModalProps) {
  const [payload, setPayload] = useState<ShipmentInput>(sampleShipment);
  const change = useJsonText(SAMPLE_RECORD_CHANGE, { expect: 'object' });
  const endpoints = useQuery({
    queryKey: queryKeys.endpoints,
    queryFn: api.listEndpoints,
    enabled: open && triggerKind === 'http',
  });
  const bound = useMemo(() => endpoints.data?.filter((e) => e.workflowId === workflowId) ?? [], [endpoints.data, workflowId]);
  const draft = useRequestDraft(bound[0]);
  const caller = useCallerDraft();

  const run = () => {
    if (triggerKind === 'event') onRun({ payload });
    else if (triggerKind === 'http') onRun({ request: { ...draft.build(), auth: caller.build() } });
    else if (triggerKind === 'record') onRun({ change: change.value as TestRecordChange });
    else onRun({});
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={triggerKind === 'schedule' ? 480 : 640}
      title="Test run"
      description={TEST_RUN_DESCRIPTION[triggerKind]}
      footer={
        <>
          {dirty && <span className="muted small footer-note">Unsaved changes will be saved first.</span>}
          <Button variant="ghost" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            icon={Play}
            loading={running}
            disabled={(triggerKind === 'http' && !(draft.valid && caller.valid)) || (triggerKind === 'record' && !change.valid)}
            onClick={run}
          >
            {triggerKind === 'schedule' ? 'Run now' : triggerKind === 'http' ? 'Send request' : 'Run test'}
          </Button>
        </>
      }
    >
      {triggerKind === 'event' && <ShipmentForm value={payload} onChange={setPayload} onRandomize={() => setPayload(sampleShipment())} />}
      {triggerKind === 'record' && (
        <JsonField
          label="The change"
          state={change}
          rows={10}
          help="operation: created, updated or deleted · record: the record after the change · previous: before it (updates, deletes) · changedFields: what an update changed. The run reads them as trigger.data."
        />
      )}
      {triggerKind === 'schedule' && (
        <p className="muted" style={{ margin: 0 }}>
          Scheduled workflows have no input. The run starts immediately and opens in the execution view.
        </p>
      )}
      {triggerKind === 'http' && (
        <div className="form-stack">
          <BoundEndpoints endpoints={bound} loading={endpoints.isLoading} onUse={draft.prefill} />
          <RequestTestForm draft={draft} />
          <RunAsFields caller={caller} />
          {result?.response && (
            <div className="test-result">
              <div className="field-label">Response</div>
              <HttpResponseView
                status={result.response.statusCode}
                headers={result.response.headers}
                body={result.response.body}
                executionId={result.executionId}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function BoundEndpoints({ endpoints, loading, onUse }: BoundEndpointsProps) {
  if (loading) return null;
  if (!endpoints.length) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        No endpoint calls this workflow yet.{' '}
        <Link to="/endpoints" className="link-inline" target="_blank" rel="noreferrer">
          Create one <ExternalLink size={12} />
        </Link>
      </p>
    );
  }
  return (
    <div className="bound-endpoints">
      <span className="muted small">Called by</span>
      {endpoints.map((e) => (
        <button key={e.id} type="button" className="chip bound-endpoint" title="Fill the form from this endpoint" onClick={() => onUse(e)}>
          <MethodBadge method={e.method} />
          <span className="mono">{e.path}</span>
        </button>
      ))}
    </div>
  );
}

function RequestTestForm({ draft }: RequestTestFormProps) {
  const hasBody = methodHasBody(draft.method);
  return (
    <>
      <div className="request-line">
        <Field label="Method">
          <select className="input" value={draft.method} onChange={(e) => draft.setMethod(e.target.value as HttpMethod)}>
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Path" help="request.path — :params are filled from Params">
          <input className="input mono" value={draft.path} placeholder="/orders/:id" onChange={(e) => draft.setPath(e.target.value)} />
        </Field>
      </div>
      <div className="form-grid">
        <JsonField label="Params" state={draft.params} rows={3} help="request.params" />
        <JsonField label="Query parameters" state={draft.query} rows={3} help="request.query" />
      </div>
      {hasBody && <JsonField label="Request body" state={draft.body} rows={7} help="request.body" />}
    </>
  );
}
