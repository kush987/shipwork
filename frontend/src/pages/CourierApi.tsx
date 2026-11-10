import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, ExternalLink, KeyRound, PlugZap, Save } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { CourierIntegration, CourierStatus, IntegrationEnv, IntegrationMode, IntegrationTestResult } from '../api/types';
import { Segmented } from '../components/Segmented';
import { Badge, Button, Field, Modal } from '../components/ui';
import { useToast } from '../components/useToast';
import { errorMessages } from '../lib/errors';
import { timeAgo } from '../lib/format';
import { ENV_OPTIONS, MODE_COPY, MODE_OPTIONS, MODE_TONE } from './Couriers.constants';

const COURIERS_KEY = ['couriers'];

/** Keeps the page's copy of a courier's integration in step after a change. */
function useIntegrationCache() {
  const qc = useQueryClient();
  return (code: string, integration: CourierIntegration) =>
    qc.setQueryData<CourierStatus[]>(COURIERS_KEY, (xs) => xs?.map((x) => (x.code === code ? { ...x, integration, mode: integration.mode } : x)));
}

function TestResult({ result }: { result: IntegrationTestResult | null }) {
  if (!result) return <span className="muted">Not tested yet.</span>;
  const Icon = result.ok ? CircleCheck : CircleX;
  return (
    <span className={`courier-test ${result.ok ? 'is-ok' : 'is-bad'}`}>
      <Icon size={14} aria-hidden /> {result.message} <span className="muted">· {timeAgo(result.at)}</span>
    </span>
  );
}

/** The card's "API connection" block: how the courier is reached now, and (for platform admins) switching it. */
export function CourierApiSection({ c, editable }: { c: CourierStatus; editable: boolean }) {
  const toast = useToast();
  const remember = useIntegrationCache();
  const [settingsFor, setSettingsFor] = useState<IntegrationEnv | null>(null);
  const integration = c.integration;

  const switchMode = useMutation({
    mutationFn: (mode: IntegrationMode) => api.updateCourierIntegration(c.code, { mode }),
    onSuccess: (next) => {
      remember(c.code, next);
      toast.success(`${c.name}: ${MODE_OPTIONS.find((m) => m.value === next.mode)?.label}`, MODE_COPY[next.mode]);
    },
    onError: (e: Error) => toast.error(`Could not switch ${c.name}`, errorMessages(e)[0]),
  });

  if (!integration) return null;
  const env = integration.mode === 'simulated' ? null : integration.mode;

  const choose = (mode: IntegrationMode) => {
    if (mode === integration.mode) return;
    // An account that isn't set up yet opens its settings instead of failing.
    if (mode !== 'simulated' && !integration.envs[mode].ready) return setSettingsFor(mode);
    if (mode === 'live' && !confirm(`Switch ${c.name} to its live API?\n\nBookings will create real AWBs and pickups, charged to your ${c.name} account.`)) return;
    switchMode.mutate(mode);
  };

  return (
    <div className="courier-api">
      <div className="courier-api-head">
        <span className="sim-title">API connection</span>
        <Badge tone={MODE_TONE[integration.mode]} dot>
          {MODE_OPTIONS.find((m) => m.value === integration.mode)?.label}
        </Badge>
      </div>
      {editable && <Segmented value={integration.mode} options={MODE_OPTIONS} onChange={choose} label={`How ${c.name} is reached`} disabled={switchMode.isPending} />}
      <p className="small muted courier-api-copy">{MODE_COPY[integration.mode]}</p>
      {env && (
        <div className="small courier-api-status">
          <div className="mono truncate" title={integration.envs[env].baseUrl}>
            {integration.envs[env].baseUrl}
          </div>
          <TestResult result={integration.envs[env].lastTest} />
        </div>
      )}
      <div className="small muted">Prices: {integration.rates === 'api' ? `${c.name}'s rate API` : 'the rate card below'} when connected.</div>
      {editable && (
        <Button size="sm" icon={KeyRound} onClick={() => setSettingsFor(env ?? 'sandbox')}>
          API settings
        </Button>
      )}
      {settingsFor && <CourierApiModal c={c} integration={integration} initialEnv={settingsFor} onClose={() => setSettingsFor(null)} />}
    </div>
  );
}

/** One environment's settings: plain values shown, secrets only as "saved"; save, then Test connection. */
function CourierApiModal({ c, integration, initialEnv, onClose }: { c: CourierStatus; integration: CourierIntegration; initialEnv: IntegrationEnv; onClose: () => void }) {
  const toast = useToast();
  const remember = useIntegrationCache();
  // The form is filled once per environment: the card refreshes every few seconds, and typing must not be lost to that.
  const formFor = (e: IntegrationEnv) => Object.fromEntries(integration.envs[e].fields.map((f) => [f.key, f.secret ? '' : (f.value ?? '')]));
  const [env, setEnvState] = useState<IntegrationEnv>(initialEnv);
  const [draft, setDraft] = useState<Record<string, string>>(() => formFor(initialEnv));
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const view = integration.envs[env];
  const setEnv = (next: IntegrationEnv) => {
    setEnvState(next);
    setDraft(formFor(next));
    setCleared(new Set());
  };

  const changes = () => {
    const values: Record<string, string | null> = {};
    for (const f of view.fields) {
      const typed = (draft[f.key] ?? '').trim();
      if (f.secret) {
        if (cleared.has(f.key)) values[f.key] = null;
        else if (typed) values[f.key] = typed;
      } else if (typed !== (f.value ?? '')) values[f.key] = typed || null;
    }
    return values;
  };
  const dirty = Object.keys(changes()).length > 0;

  const save = useMutation({
    mutationFn: () => api.updateCourierIntegration(c.code, { env, values: changes() }),
    onSuccess: (next) => {
      remember(c.code, next);
      setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, next.envs[env].fields.find((f) => f.key === k)?.secret ? '' : v])));
      setCleared(new Set());
      toast.success(`${c.name} ${env} settings saved`, next.envs[env].ready ? 'Test the connection before switching to it.' : `Still needed: ${next.envs[env].missing.join(', ')}`);
    },
    onError: (e: Error) => toast.error('Could not save the settings', errorMessages(e)[0]),
  });

  const test = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync();
      return api.testCourierIntegration(c.code, env);
    },
    onSuccess: (result) => {
      remember(c.code, { ...integration, envs: { ...integration.envs, [env]: { ...integration.envs[env], lastTest: result } } });
      if (result.ok) toast.success(`${c.name} ${env}: connected`, result.message);
      else toast.error(`${c.name} ${env}: not connected`, result.message);
    },
    onError: (e: Error) => toast.error('Could not test the connection', errorMessages(e)[0]),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`${c.name} API`}
      description={`Shared by every workspace. Secrets are stored encrypted and never shown again. ${integration.testDescription}`}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button icon={PlugZap} onClick={() => test.mutate()} loading={test.isPending} disabled={save.isPending}>
            {dirty ? 'Save and test' : 'Test connection'}
          </Button>
          <Button variant="primary" icon={Save} onClick={() => save.mutate()} loading={save.isPending && !test.isPending} disabled={!dirty}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate();
        }}
      >
        <Segmented value={env} options={ENV_OPTIONS} onChange={setEnv} label="Which account" />
        {integration.docsUrl && (
          <a className="link-inline small" href={integration.docsUrl} target="_blank" rel="noreferrer">
            {c.name} API documentation <ExternalLink size={12} aria-hidden />
          </a>
        )}
        {view.fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} help={f.help}>
            <div className="courier-secret-row">
              <input
                className="input"
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={draft[f.key] ?? ''}
                placeholder={f.secret ? (cleared.has(f.key) ? 'Will be removed on save' : f.set ? `Saved (${f.value}) — type to replace` : '') : (f.placeholder ?? '')}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((d) => ({ ...d, [f.key]: value }));
                  setCleared((s) => {
                    const next = new Set(s);
                    next.delete(f.key);
                    return next;
                  });
                }}
              />
              {f.secret && f.set && !cleared.has(f.key) && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setCleared((s) => new Set(s).add(f.key))}>
                  Remove
                </Button>
              )}
            </div>
          </Field>
        ))}
        <div className="small">
          <span className="field-label">Last test ({env})</span> <TestResult result={view.lastTest} />
        </div>
        {!view.ready && <p className="small muted">Still needed before {c.name} can use this account: {view.missing.join(', ')}.</p>}
      </form>
    </Modal>
  );
}
