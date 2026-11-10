import { isIP } from 'net';
import { lookup, resolveSrv } from 'dns/promises';
import ConnectionString from 'mongodb-connection-string-url';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { classify } from '../../../shared/http/outbound-http';
import { MANAGED_DB_PREFIX, MAX_DB_NAME_LENGTH, RESERVED_DB_NAMES } from '../domain/workspace-db.constants';
import { INVALID_DB_NAME_CHARS } from './external-uri.constants';
import type { ExternalDatabase } from '../domain/workspace-db.types';

const fail = (message: string): never => {
  throw new ValidationFailedError([{ message }]);
};

const hostName = (hostPort: string) => hostPort.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');

/** Every address a connection could reach: SRV targets for mongodb+srv, then DNS for each host. */
async function addressesOf(cs: ConnectionString): Promise<{ host: string; addresses: string[] }[]> {
  const hosts = cs.isSRV
    ? (await resolveSrv(`_mongodb._tcp.${hostName(cs.hosts[0])}`).catch(() => fail(`Could not find the cluster ${cs.hosts[0]} (no SRV record)`))).map((r) => r.name)
    : cs.hosts.map(hostName);
  return Promise.all(
    hosts.map(async (host) => ({
      host,
      addresses: isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => fail(`Could not resolve ${host}`))).map((a) => a.address),
    })),
  );
}

/**
 * Checks a connection string a workspace wants to use for its business data: a MongoDB URI with
 * a database name that is neither reserved nor a ShipFlow database, on hosts that resolve to
 * public addresses (private and loopback only when the server allows it — otherwise a workspace
 * could point ShipFlow at internal services).
 */
export async function validateExternalUri(raw: string, { allowPrivate, platformDbName }: { allowPrivate: boolean; platformDbName: string }): Promise<ExternalDatabase> {
  const uri = (raw ?? '').trim();
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) fail('Use a mongodb:// or mongodb+srv:// connection string');
  let cs: ConnectionString;
  try {
    cs = new ConnectionString(uri);
  } catch (error) {
    return fail(`Not a valid MongoDB connection string: ${(error as Error).message}`);
  }

  const databaseName = decodeURIComponent(cs.pathname.replace(/^\//, ''));
  if (!databaseName) fail('Add the database name to the connection string, e.g. mongodb+srv://user:pass@cluster0.example.net/acme');
  if (databaseName.length > MAX_DB_NAME_LENGTH || INVALID_DB_NAME_CHARS.test(databaseName)) fail(`“${databaseName}” is not a valid database name`);
  if (RESERVED_DB_NAMES.includes(databaseName) || databaseName === platformDbName || databaseName.startsWith(MANAGED_DB_PREFIX)) {
    fail(`“${databaseName}” is reserved — use a database of your own`);
  }

  for (const { host, addresses } of await addressesOf(cs)) {
    for (const address of addresses) {
      const range = classify(address);
      if (range === 'link-local' || range === 'unspecified') fail(`${host} resolves to ${address} (${range}), which can't be used`);
      if ((range === 'loopback' || range === 'private') && !allowPrivate) {
        fail(`${host} resolves to a ${range} address (${address}). Use a publicly reachable database (the server can allow private ones with ALLOW_PRIVATE_DB_HOSTS=true).`);
      }
    }
  }
  return { uri, databaseName, hosts: cs.hosts.map(hostName).join(', ') };
}
