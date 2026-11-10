import { extname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { SandboxError } from '../application/code-sandbox';
import { TS_WORKER_BOOTSTRAP, WORKER_ENTRY } from './sandbox-worker.constants';
import type { WireError } from './sandbox-worker.types';

/**
 * Starts one sandbox thread. Compiled builds load `sandbox.worker.js`; running from the TypeScript
 * sources (tests) loads `sandbox.worker.ts` through a small transpiling bootstrap.
 */
export function spawnSandboxWorker(): Worker {
  const extension = extname(__filename);
  const entry = join(__dirname, `${WORKER_ENTRY}${extension}`);
  const worker = extension === '.ts' ? new Worker(TS_WORKER_BOOTSTRAP, { eval: true, workerData: { entry } }) : new Worker(entry);
  // An idle sandbox thread must not keep the process alive; in-flight jobs are held by their watchdog timer.
  worker.unref();
  return worker;
}

export function toWireError(error: unknown): WireError {
  if (error instanceof SandboxError) return { kind: 'sandbox', message: error.message, logs: error.logs, durationMs: error.durationMs };
  return { kind: 'internal', message: error instanceof Error ? error.message : String(error) };
}

/** User-code failures become SandboxError again (callers report them); anything else is a plain Error. */
export function fromWireError(error: WireError): Error {
  return error.kind === 'sandbox' ? new SandboxError(error.message, error.logs, error.durationMs) : new Error(`Code sandbox failed: ${error.message}`);
}
