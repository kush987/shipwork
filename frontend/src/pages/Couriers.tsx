import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { CourierStatus, CourierUpdate } from '../api/types';
import { EmptyState, ErrorState, PageHeader, Skeleton, Toggle } from '../components/ui';
import { useToast } from '../components/useToast';
import { inr } from '../lib/format';
import { CIRCUIT_COPY, CIRCUIT_STEPS, COURIERS_REFETCH_MS, LATENCY_MAX_MS, PLATFORM_ONLY_NOTE } from './Couriers.constants';
import { useAuth } from '../auth/auth-store';
import { isPlatformAdmin } from '../auth/auth.helpers';
import { toPercent } from './Couriers.helpers';
import type { CourierCardProps } from './Couriers.types';
import { CourierApiSection } from './CourierApi';

export function CouriersPage() {
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: api.listCouriers, refetchInterval: COURIERS_REFETCH_MS });
  const editable = isPlatformAdmin(useAuth().user);

  return (
    <div className="page">
      <PageHeader
        title="Couriers"
        subtitle="Connect each courier's real API (sandbox or live account), or run it on its simulation to see retries and circuit breakers in action."
      />
      {!editable && (
        <p className="notice courier-readonly-note">
          <Lock size={14} aria-hidden /> {PLATFORM_ONLY_NOTE}
        </p>
      )}
      {couriers.isLoading ? (
        <div className="courier-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card courier-card">
              <Skeleton w="40%" h={18} />
              <Skeleton h={60} />
              <Skeleton h={90} />
            </div>
          ))}
        </div>
      ) : couriers.isError ? (
        <ErrorState error={couriers.error} onRetry={() => couriers.refetch()} />
      ) : (couriers.data?.length ?? 0) === 0 ? (
        <div className="card">
          <EmptyState icon={Truck} title="No couriers registered" description="Register a CourierProvider adapter on the backend." />
        </div>
      ) : (
        <div className="courier-grid">
          {couriers.data!.map((c) => (
            <CourierCard key={c.code} c={c} editable={editable} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourierCard({ c, editable }: CourierCardProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const [failure, setFailure] = useState(toPercent(c.simulation.failureRate));
  const [latency, setLatency] = useState(c.simulation.latencyMs);

  useEffect(() => setFailure(toPercent(c.simulation.failureRate)), [c.simulation.failureRate]);
  useEffect(() => setLatency(c.simulation.latencyMs), [c.simulation.latencyMs]);

  const update = useMutation({
    mutationFn: (body: CourierUpdate) => api.updateCourier(c.code, body),
    onSuccess: (next) => {
      qc.setQueryData<CourierStatus[]>(['couriers'], (xs) => xs?.map((x) => (x.code === next.code ? { ...x, ...next } : x)));
    },
    onError: (e: Error) => toast.error(`Could not update ${c.name}`, e.message),
  });

  const circuit = CIRCUIT_COPY[c.circuit] ?? CIRCUIT_COPY.closed;

  return (
    <div className={`card courier-card ${!c.enabled ? 'is-disabled' : ''}`}>
      <div className="courier-head">
        <div className="courier-logo">{c.name.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="courier-name">{c.name}</div>
          <div className="mono small muted">{c.code}</div>
        </div>
        <Toggle
          checked={c.enabled}
          onChange={(v) => update.mutate({ enabled: v })}
          label={`Enable ${c.name}`}
          disabled={!editable}
          title={editable ? undefined : 'Only platform administrators can change couriers'}
        />
      </div>

      <div className={`circuit circuit-${c.circuit}`}>
        <div className="circuit-track">
          {CIRCUIT_STEPS.map((s) => (
            <span key={s} className={`circuit-step ${c.circuit === s ? 'on' : ''}`}>
              {CIRCUIT_COPY[s].label}
            </span>
          ))}
        </div>
        <div className="circuit-desc">
          <span className="circuit-light" />
          <span>
            Circuit {circuit.label.toLowerCase()}. {circuit.desc}
          </span>
        </div>
        <div className="small muted">
          Consecutive failures: <strong className="mono">{c.consecutiveFailures}</strong>
        </div>
      </div>

      <CourierApiSection c={c} editable={editable} />

      <div className="rate-card">
        <div>
          <span>Base rate</span>
          <strong>{inr(c.baseRate)}</strong>
        </div>
        <div>
          <span>Per kg</span>
          <strong>{inr(c.perKgRate)}</strong>
        </div>
        <div>
          <span>COD fee</span>
          <strong>{c.codFeePct}%</strong>
        </div>
        <div>
          <span>Avg delivery</span>
          <strong>{c.avgDeliveryDays} days</strong>
        </div>
      </div>

      <fieldset className="sim" disabled={!editable}>
        <div className="sim-title">Simulation{!editable && <span className="muted small"> · read-only</span>}</div>
        <label className="slider-field">
          <span>
            Failure rate <strong className="mono">{failure}%</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={failure}
            onChange={(e) => setFailure(Number(e.target.value))}
            onPointerUp={() => update.mutate({ failureRate: failure / 100 })}
            onKeyUp={() => update.mutate({ failureRate: failure / 100 })}
            style={{ ['--fill' as string]: `${failure}%` }}
          />
        </label>
        <label className="slider-field">
          <span>
            Latency <strong className="mono">{latency} ms</strong>
          </span>
          <input
            type="range"
            min={0}
            max={LATENCY_MAX_MS}
            step={100}
            value={latency}
            onChange={(e) => setLatency(Number(e.target.value))}
            onPointerUp={() => update.mutate({ latencyMs: latency })}
            onKeyUp={() => update.mutate({ latencyMs: latency })}
            style={{ ['--fill' as string]: `${(latency / LATENCY_MAX_MS) * 100}%` }}
          />
        </label>
      </fieldset>
    </div>
  );
}
