import type { CircuitState, IntegrationEnv, IntegrationMode } from '../api/types';
import type { Tone } from '../components/ui.types';

export const CIRCUIT_COPY: Record<CircuitState, { label: string; desc: string }> = {
  closed: { label: 'Closed', desc: 'Healthy. Requests flow normally.' },
  half_open: { label: 'Half-open', desc: 'Probing with a trial request.' },
  open: { label: 'Open', desc: 'Tripped. Requests short-circuit until cooldown.' },
};

/** The circuit breaker's states, left to right on the card. */
export const CIRCUIT_STEPS: CircuitState[] = ['closed', 'half_open', 'open'];

/** Courier health is polled so circuit changes show up live. */
export const COURIERS_REFETCH_MS = 3000;

/** Upper end of the simulated latency slider. */
/** Shown to everyone who can't change courier settings (the server answers 403 for them). */
export const PLATFORM_ONLY_NOTE =
  'Couriers are shared by every workspace, so only platform administrators can connect their APIs, turn them on or off or change the simulation. You can see how each is connected, its health and rate card here.';

export const LATENCY_MAX_MS = 5000;


/** The three ways a courier is reached, left to right on its card. */
export const MODE_OPTIONS: { value: IntegrationMode; label: string }[] = [
  { value: 'simulated', label: 'Simulated' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'live', label: 'Live' },
];

export const MODE_TONE: Record<IntegrationMode, Tone> = { simulated: 'neutral', sandbox: 'info', live: 'success' };

export const ENV_OPTIONS: { value: IntegrationEnv; label: string }[] = [
  { value: 'sandbox', label: 'Sandbox account' },
  { value: 'live', label: 'Live account' },
];

export const MODE_COPY: Record<IntegrationMode, string> = {
  simulated: 'Prices, bookings and tracking come from the simulation below — nothing reaches the courier.',
  sandbox: 'Calls go to the courier’s sandbox with your test account: real API, no real pickups.',
  live: 'Calls go to the courier’s live API: bookings create real AWBs and pickups.',
};
