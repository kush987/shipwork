import ConnectionString from 'mongodb-connection-string-url';
import { config } from '../../../config/configuration';

/** The platform's own database name (from MONGO_URI); workspaces may never use it. */
export function platformDatabaseName(): string {
  try {
    return new ConnectionString(config.mongoUri).pathname.replace(/^\//, '') || 'test';
  } catch {
    return 'shipflow';
  }
}

/** A connection error as users may see it: no connection string, no credentials. */
export function describeConnectionError(error: unknown): string {
  const message = (error as Error)?.message ?? String(error);
  if (/authentication failed|bad auth/i.test(message)) return 'Authentication failed — check the user name and password';
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return 'Host not found';
  if (/ECONNREFUSED/i.test(message)) return 'Connection refused';
  if (/timed out|Server selection/i.test(message)) return 'Timed out reaching the database';
  if (/not authorized/i.test(message)) return 'The user has no access to this database';
  return message.replace(/mongodb(\+srv)?:\/\/\S+/g, '<connection string>').slice(0, 300);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out reaching the database')), ms).unref())]);
}
