import { newQuickJSWASMModuleFromVariant, QuickJSContext, QuickJSSyncVariant, QuickJSWASMModule, shouldInterruptAfterDeadline } from 'quickjs-emscripten-core';
import releaseSyncVariant from '@jitl/quickjs-wasmfile-release-sync';
import { SandboxError } from '../application/code-sandbox';
import { SandboxLimits, SandboxResult } from '../application/code-sandbox.types';
import { CHECK_TIMEOUT_MS, DEFAULT_MEMORY_BYTES, DEFAULT_TIMEOUT_MS, MAX_LOG_LINE, MAX_LOG_LINES, MAX_RESULT_BYTES, MAX_STACK_BYTES, MISSING_RUN_MESSAGE } from './quickjs-sandbox.constants';
import { describeError } from './quickjs-evaluator.helpers';
import type { CheckResult } from './quickjs-evaluator.types';

// One WASM module per thread (the main thread, or each sandbox worker); runtimes are per run.
let quickjsModule: Promise<QuickJSWASMModule> | undefined;

function quickjs(): Promise<QuickJSWASMModule> {
  // The packaged variant loads its WASM glue through dynamic import(), which CommonJS test
  // runners (and the worker's TypeScript loader) can't do; requiring it directly works everywhere.
  quickjsModule ??= newQuickJSWASMModuleFromVariant({
    ...(releaseSyncVariant as QuickJSSyncVariant),
    importModuleLoader: async () => {
      const loader = require('@jitl/quickjs-wasmfile-release-sync/emscripten-module');
      return loader.default ?? loader;
    },
  });
  return quickjsModule;
}

/**
 * Evaluates untrusted code in QuickJS compiled to WebAssembly. Each run gets a fresh runtime: no
 * `require`, `process`, filesystem, network or timers exist inside it, and nothing leaks between
 * runs. The only host function exposed is `console.log`, which is captured.
 *
 * Shared by the in-process sandbox and the sandbox worker threads, so both behave identically.
 * It is synchronous WASM: whichever thread calls it is busy until the run ends.
 */
export class QuickJsEvaluator {
  async check(code: string): Promise<CheckResult> {
    try {
      const { value } = await this.evaluate(code, `typeof run`, undefined, { timeoutMs: CHECK_TIMEOUT_MS });
      return value === 'function' ? { ok: true } : { ok: false, error: MISSING_RUN_MESSAGE };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  run(code: string, input: unknown, limits: SandboxLimits = {}): Promise<SandboxResult> {
    return this.evaluate(code, `JSON.stringify(run(JSON.parse(__input)) ?? null)`, input, limits, true);
  }

  private async evaluate(code: string, tail: string, input: unknown, limits: SandboxLimits, parse = false): Promise<SandboxResult> {
    const QuickJS = await quickjs();
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(limits.memoryBytes ?? DEFAULT_MEMORY_BYTES);
    runtime.setMaxStackSize(MAX_STACK_BYTES);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + (limits.timeoutMs ?? DEFAULT_TIMEOUT_MS)));
    const vm = runtime.newContext();
    const logs: string[] = [];
    const started = Date.now();
    try {
      this.installConsole(vm, logs);
      vm.newString(JSON.stringify(input ?? null)).consume((h) => vm.setProp(vm.global, '__input', h));

      // The trailing expression runs after the user's code has defined `run`.
      const result = vm.evalCode(`${code}\n;${tail}`, 'custom-node.js');
      if (result.error) {
        const err = result.error.consume((h) => vm.dump(h));
        throw new SandboxError(describeError(err), logs, Date.now() - started);
      }
      const raw = result.value.consume((h) => vm.dump(h));
      if (!parse) return { value: raw, logs, durationMs: Date.now() - started };
      if (typeof raw === 'string' && raw.length > MAX_RESULT_BYTES) {
        throw new SandboxError(`Result is larger than ${MAX_RESULT_BYTES / 1024} KB`, logs, Date.now() - started);
      }
      return { value: typeof raw === 'string' ? JSON.parse(raw) : null, logs, durationMs: Date.now() - started };
    } finally {
      vm.dispose();
      runtime.dispose();
    }
  }

  private installConsole(vm: QuickJSContext, logs: string[]) {
    const log = vm.newFunction('log', (...args) => {
      if (logs.length >= MAX_LOG_LINES) return;
      const line = args
        .map((a) => {
          const v = vm.dump(a);
          return typeof v === 'string' ? v : JSON.stringify(v);
        })
        .join(' ');
      logs.push(line.length > MAX_LOG_LINE ? `${line.slice(0, MAX_LOG_LINE)}…` : line);
    });
    const consoleObj = vm.newObject();
    for (const method of ['log', 'info', 'warn', 'error']) vm.setProp(consoleObj, method, log);
    vm.setProp(vm.global, 'console', consoleObj);
    log.dispose();
    consoleObj.dispose();
  }
}
