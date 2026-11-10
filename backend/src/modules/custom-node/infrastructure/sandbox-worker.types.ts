import type { SandboxLimits, SandboxResult } from '../application/code-sandbox.types';
import type { CheckResult } from './quickjs-evaluator.types';

/** Work for a sandbox thread. Everything is structured-clone safe (input is JSON data). */
export type SandboxJob = { op: 'run'; code: string; input: unknown; limits: SandboxLimits } | { op: 'check'; code: string };

export type SandboxRequest = SandboxJob & { id: number };

/** A failure crossing the thread boundary: user-code errors keep their logs and duration. */
export type WireError = { kind: 'sandbox'; message: string; logs: string[]; durationMs: number } | { kind: 'internal'; message: string };

export type SandboxResponse = { id: number; ok: true; value: SandboxResult | CheckResult } | { id: number; ok: false; error: WireError };
