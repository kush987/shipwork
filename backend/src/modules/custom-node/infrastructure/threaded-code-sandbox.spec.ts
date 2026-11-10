import { Worker } from 'node:worker_threads';
import { ThreadedCodeSandbox } from './threaded-code-sandbox';
import { QuickJsSandbox } from './quickjs-sandbox';
import { spawnSandboxWorker } from './sandbox-worker.helpers';
import { SandboxUnavailableError } from './sandbox-worker-pool.errors';
import { SandboxError } from '../application/code-sandbox';
import { MAX_RESULT_BYTES } from './quickjs-sandbox.constants';

/** Runs the same call on both adapters; everything but the duration must match. */
type Call = (s: QuickJsSandbox | ThreadedCodeSandbox) => Promise<unknown>;
const both = async (call: Call, threaded: ThreadedCodeSandbox) => {
  const settle = (p: Promise<unknown>) => p.then((value) => ({ value }), (error: Error) => ({ error }));
  return [await settle(call(new QuickJsSandbox())), await settle(call(threaded))] as const;
};
const withoutDuration = (outcome: { value?: unknown; error?: Error }) =>
  outcome.error
    ? { error: outcome.error.constructor.name, message: outcome.error.message, logs: (outcome.error as SandboxError).logs }
    : { value: { ...(outcome.value as object), durationMs: undefined } };

describe('ThreadedCodeSandbox', () => {
  const spawned: Worker[] = [];
  const sandbox = new ThreadedCodeSandbox(2, {
    spawn: () => {
      const worker = spawnSandboxWorker();
      spawned.push(worker);
      return worker;
    },
  });
  afterAll(() => sandbox.onModuleDestroy());

  it.each<[string, Call]>([
    ['a normal run with logs', (s) => s.run('function run(i) { console.log("x is", i.x, { a: 1 }); return { doubled: i.x * 2 }; }', { x: 21 })],
    ['a thrown error, with the logs so far', (s) => s.run('function run() { console.log("before"); throw new TypeError("bad input"); }', {})],
    ['a result that is too large', (s) => s.run(`function run() { return "x".repeat(${MAX_RESULT_BYTES + 10}); }`, {})],
    ['check() of valid code', (s) => s.check('function run() {}')],
    ['check() of code without run()', (s) => s.check('const x = 1;')],
    ['check() of a syntax error', (s) => s.check('function run( {')],
  ])('matches the in-process sandbox for %s', async (_, call) => {
    const [inProcess, threaded] = await both(call, sandbox);
    expect(withoutDuration(threaded)).toEqual(withoutDuration(inProcess));
  });

  it('keeps errors from user code as SandboxError with logs and duration', async () => {
    const error = await sandbox.run('function run() { console.log("before"); throw new TypeError("bad input"); }', {}).catch((e) => e);
    expect(error).toBeInstanceOf(SandboxError);
    expect(error).toMatchObject({ message: 'TypeError: bad input', logs: ['before'] });
    expect(typeof error.durationMs).toBe('number');
  });

  it('times out runaway code without blocking the calling thread', async () => {
    let ticks = 0;
    const ticker = setInterval(() => ticks++, 10);
    const error = await sandbox.run('function run() { while (true) {} }', {}, { timeoutMs: 300 }).catch((e) => e);
    clearInterval(ticker);
    expect(error).toBeInstanceOf(SandboxError);
    expect(error.message).toBe('Timed out — the code ran longer than allowed');
    // On the main thread the loop would have frozen the timer; here it kept running.
    expect(ticks).toBeGreaterThan(10);
  });

  it('runs more jobs than threads by queueing them', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => sandbox.run('function run(i) { return i.n * i.n; }', { n: i })));
    expect(results.map((r) => r.value)).toEqual(Array.from({ length: 12 }, (_, i) => i * i));
    expect(sandbox.stats()).toMatchObject({ threads: 2, busy: 0, queued: 0 });
  });

  it('rejects the job of a thread that dies, replaces the thread and keeps serving', async () => {
    const pending = sandbox.run('function run() { while (true) {} }', {}, { timeoutMs: 5_000 });
    // Attach the expectation before the thread dies: the rejection can land before `terminate()` resolves.
    const rejected = expect(pending).rejects.toBeInstanceOf(SandboxUnavailableError);
    await new Promise((r) => setTimeout(r, 200));
    const busy = spawned.filter((w) => w.threadId > 0);
    await Promise.all(busy.map((w) => w.terminate()));
    await rejected;
    expect((await sandbox.run('function run() { return "still here"; }', {})).value).toBe('still here');
  });

  it('gives up on a thread that never answers (watchdog) and retires it', async () => {
    // A thread that ignores its jobs: only the pool's watchdog can end them.
    const silent = () => new Worker('setInterval(() => {}, 1000)', { eval: true });
    const stuck = new ThreadedCodeSandbox(1, { watchdogGraceMs: 50, spawn: silent });
    try {
      const started = Date.now();
      const error = await stuck.run('function run() { return 1; }', {}, { timeoutMs: 100 }).catch((e) => e);
      expect(error).toBeInstanceOf(SandboxError);
      expect(error.message).toBe('Timed out — the code ran longer than allowed');
      expect(Date.now() - started).toBeGreaterThanOrEqual(140);
      expect(stuck.stats()).toEqual({ threads: 0, busy: 0, queued: 0 });
    } finally {
      await stuck.onModuleDestroy();
    }
  });

  it('refuses work beyond the queue limit and serves the queued job once a thread frees up', async () => {
    const tiny = new ThreadedCodeSandbox(1, { maxQueued: 1 });
    try {
      const slow = tiny.run('function run() { while (true) {} }', {}, { timeoutMs: 300 });
      const queued = tiny.run('function run() { return 1; }', {});
      const refused = await tiny.run('function run() { return 2; }', {}).catch((e) => e);
      expect(refused).toBeInstanceOf(SandboxUnavailableError);
      expect(refused.message).toBe('The code sandbox is busy — try again');
      await expect(slow).rejects.toThrow('Timed out');
      expect((await queued).value).toBe(1);
    } finally {
      await tiny.onModuleDestroy();
    }
  });

  it('refuses work after shutdown', async () => {
    const closed = new ThreadedCodeSandbox(1);
    await closed.onModuleDestroy();
    await expect(closed.run('function run() {}', {})).rejects.toBeInstanceOf(SandboxUnavailableError);
  });
});
