import { randomBytes } from 'crypto';
import { encryptSecret, decryptSecret } from '../../shared/security/encryption';
import { validateExternalUri } from './infrastructure/external-uri';
import { managedDatabaseName, managedDefault } from './domain/workspace-db';
import { describeConnectionError } from './application/workspace-db.helpers';
import { WorkspaceDatabaseService } from './application/workspace-db.service';
import { ValidationFailedError } from '../../shared/domain/errors';

const validate = (uri: string, allowPrivate = false) => validateExternalUri(uri, { allowPrivate, platformDbName: 'shipflow' });
const issue = (promise: Promise<unknown>) =>
  promise.then(
    () => 'accepted',
    (e) => (e instanceof ValidationFailedError ? e.message : `unexpected: ${(e as Error).message}`),
  );

describe('workspace databases', () => {
  it('encrypts connection strings at rest; tampering is detected', () => {
    const key = randomBytes(32);
    const uri = 'mongodb+srv://shop:s3cret@cluster0.example.net/acme';
    const token = encryptSecret(uri, key);
    expect(token).toMatch(/^v1\./);
    expect(token).not.toContain('s3cret');
    expect(decryptSecret(token, key)).toBe(uri);
    expect(encryptSecret(uri, key)).not.toBe(token);
    const [v, iv, tag, data] = token.split('.');
    const tampered = `${data[0] === 'A' ? 'B' : 'A'}${data.slice(1)}`; // always a different first character
    expect(() => decryptSecret([v, iv, tag, tampered].join('.'), key)).toThrow();
    expect(() => decryptSecret(token, randomBytes(32))).toThrow();
  });

  it('names managed databases after the workspace, within MongoDB limits', () => {
    expect(managedDatabaseName('demo')).toBe('sfb_demo');
    const long = managedDatabaseName('x'.repeat(64));
    expect(long.length).toBeLessThanOrEqual(63);
    expect(long).toMatch(/^sfb_x{30}_[0-9a-f]{16}$/);
    expect(managedDefault('acme-1a2b3c')).toMatchObject({ mode: 'managed', databaseName: 'sfb_acme-1a2b3c', encryptedUri: null });
  });

  it('accepts a MongoDB URI with a database of its own on a public host', async () => {
    await expect(validate('mongodb://shop:pw@8.8.8.8:27017/acme?authSource=admin')).resolves.toEqual({
      uri: 'mongodb://shop:pw@8.8.8.8:27017/acme?authSource=admin',
      databaseName: 'acme',
      hosts: '8.8.8.8',
    });
  });

  it('rejects other schemes, missing or reserved database names', async () => {
    expect(await issue(validate('postgres://u:p@8.8.8.8/acme'))).toContain('mongodb:// or mongodb+srv://');
    expect(await issue(validate('mongodb://8.8.8.8:27017'))).toContain('Add the database name');
    expect(await issue(validate('mongodb://8.8.8.8/admin'))).toContain('reserved');
    expect(await issue(validate('mongodb://8.8.8.8/shipflow'))).toContain('reserved');
    expect(await issue(validate('mongodb://8.8.8.8/sfb_other-workspace'))).toContain('reserved');
    expect(await issue(validate('mongodb://8.8.8.8/bad$name'))).toContain('not a valid database name');
  });

  it('blocks private and loopback hosts unless the server allows them; never link-local', async () => {
    expect(await issue(validate('mongodb://127.0.0.1:27017/acme'))).toContain('loopback address');
    expect(await issue(validate('mongodb://10.1.2.3:27017,8.8.8.8:27017/acme'))).toContain('private address');
    await expect(validate('mongodb://127.0.0.1:27017/acme', true)).resolves.toMatchObject({ databaseName: 'acme' });
    expect(await issue(validate('mongodb://169.254.169.254/acme', true))).toContain('link-local');
  });

  it('describes connection failures without leaking the connection string', () => {
    expect(describeConnectionError(new Error('bad auth : authentication failed'))).toBe('Authentication failed — check the user name and password');
    expect(describeConnectionError(new Error('connect ECONNREFUSED 1.2.3.4:27017'))).toBe('Connection refused');
    expect(describeConnectionError(new Error('weird failure for mongodb://u:secret@host/db'))).toBe('weird failure for <connection string>');
  });
});

describe('a workspace’s database is its own', () => {
  const connection = { db: { command: async () => ({ ok: 1 }) } };
  const external = { ...managedDefault('t'), mode: 'external' as const, databaseName: 'shop', hosts: 'db.example.net' };
  const service = (others: string[]) => {
    const saved: unknown[] = [];
    const copied: unknown[] = [];
    const connections = { configOf: async () => external, connect: async () => connection, openExternal: async () => connection, forget: async () => undefined };
    const copier = {
      counts: async () => [],
      copy: async (...args: unknown[]) => (copied.push(args), []),
      remove: async () => 0,
      otherWorkspaces: async () => others,
    };
    const repository = { save: async (config: unknown) => saved.push(config), find: async () => null };
    return { saved, copied, svc: new WorkspaceDatabaseService(repository as never, connections as never, copier as never) };
  };

  it('refuses to switch to a database that holds another workspace’s data, and changes nothing', async () => {
    const { svc, saved, copied } = service(['someone-else']);
    await expect(svc.switch('t', { mode: 'managed', copyData: true })).rejects.toThrow('another workspace’s data');
    expect(saved).toEqual([]);
    expect(copied).toEqual([]);
  });

  it('switches (copying the data) when the database is free', async () => {
    const { svc, saved, copied } = service([]);
    await svc.switch('t', { mode: 'managed', copyData: true });
    expect(copied).toHaveLength(1);
    expect(saved).toHaveLength(1);
  });
});
