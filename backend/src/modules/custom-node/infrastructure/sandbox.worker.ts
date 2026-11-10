import { parentPort } from 'node:worker_threads';
import { QuickJsEvaluator } from './quickjs-evaluator';
import { toWireError } from './sandbox-worker.helpers';
import type { SandboxRequest, SandboxResponse } from './sandbox-worker.types';

/**
 * Entry point of one sandbox thread: evaluates jobs from the pool one at a time with the same
 * QuickJS evaluator the in-process sandbox uses, and posts each outcome back.
 */
const evaluator = new QuickJsEvaluator();

async function handle(request: SandboxRequest): Promise<SandboxResponse> {
  try {
    const value = request.op === 'check' ? await evaluator.check(request.code) : await evaluator.run(request.code, request.input, request.limits);
    return { id: request.id, ok: true, value };
  } catch (error) {
    return { id: request.id, ok: false, error: toWireError(error) };
  }
}

parentPort?.on('message', (request: SandboxRequest) => {
  void handle(request).then((response) => parentPort!.postMessage(response));
});
