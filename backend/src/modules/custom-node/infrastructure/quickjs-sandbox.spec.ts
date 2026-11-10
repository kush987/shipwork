import { QuickJsSandbox } from './quickjs-sandbox';
import { SandboxError } from '../application/code-sandbox';

describe('QuickJsSandbox', () => {
  const sandbox = new QuickJsSandbox();

  it('runs run(input) and captures console output', async () => {
    const result = await sandbox.run('function run(i) { console.log("x is", i.x, { a: 1 }); return { doubled: i.x * 2 }; }', { x: 21 });
    expect(result.value).toEqual({ doubled: 42 });
    expect(result.logs).toEqual(['x is 21 {"a":1}']);
  });

  it('exposes no host capabilities', async () => {
    const { value } = await sandbox.run(
      'function run() { return [typeof require, typeof process, typeof fetch, typeof setTimeout, typeof globalThis.__dirname]; }',
      {},
    );
    expect(value).toEqual(['undefined', 'undefined', 'undefined', 'undefined', 'undefined']);
  });

  it('does not leak state between runs', async () => {
    await sandbox.run('globalThis.leak = 1; function run() { return null; }', {});
    expect((await sandbox.run('function run() { return typeof leak; }', {})).value).toBe('undefined');
  });

  it('stops infinite loops at the time limit', async () => {
    await expect(sandbox.run('function run() { while (true) {} }', {}, { timeoutMs: 100 })).rejects.toThrow('Timed out');
  });

  it('stops runaway memory', async () => {
    await expect(
      sandbox.run('function run() { const a = []; while (true) a.push("x".repeat(10000)); }', {}, { memoryBytes: 4 * 1024 * 1024, timeoutMs: 5000 }),
    ).rejects.toBeInstanceOf(SandboxError);
  });

  it('reports thrown errors with logs collected so far', async () => {
    const error = await sandbox.run('function run() { console.log("before"); throw new TypeError("bad input"); }', {}).catch((e) => e);
    expect(error).toBeInstanceOf(SandboxError);
    expect(error.message).toBe('TypeError: bad input');
    expect(error.logs).toEqual(['before']);
  });

  it('checks that code defines run()', async () => {
    expect(await sandbox.check('function run() {}')).toEqual({ ok: true });
    expect(await sandbox.check('const x = 1;')).toMatchObject({ ok: false });
    expect(await sandbox.check('function run( {')).toMatchObject({ ok: false, error: expect.stringContaining('SyntaxError') });
  });
});
