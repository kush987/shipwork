import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import mongoose, { Connection, Model, Schema } from 'mongoose';
import type Redis from 'ioredis';
import { config as appConfig } from '../../../config/configuration';
import { REDIS } from '../../../shared/redis/redis.constants';
import { decryptSecret } from '../../../shared/security/encryption';
import { TenantModels } from '../../../shared/tenancy/tenant-models.ports';
import { WorkspaceConnections } from '../application/workspace-db.ports';
import { WorkspaceDatabaseRepository } from '../domain/workspace-db.repository';
import { managedDefault } from '../domain/workspace-db';
import { CONFIG_CACHE_MS, DB_CHANGED_CHANNEL, EXTERNAL_CONNECTION_OPTIONS, MANAGED_CONNECTION_OPTIONS, MAX_EXTERNAL_CONNECTIONS } from './tenant-connections.constants';
import type { ExternalDatabase, WorkspaceDatabaseConfig } from '../domain/workspace-db.types';

interface OpenExternal {
  key: string;
  connection: Promise<Connection>;
  usedAt: number;
}

/**
 * Gives every workspace its own database:
 * - managed: one shared pool to BUSINESS_MONGO_URI, switched per workspace with `useDb` (no extra sockets);
 * - external: a small pool per workspace-owned MongoDB, opened on first use, LRU-closed.
 * Business repositories reach it through the TenantModels port.
 */
@Injectable()
export class TenantConnections extends TenantModels implements WorkspaceConnections, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantConnections.name);
  private managed?: Promise<Connection>;
  private readonly external = new Map<string, OpenExternal>();
  private readonly configs = new Map<string, { at: number; config: Promise<WorkspaceDatabaseConfig> }>();
  private subscriber?: Redis;

  constructor(
    private readonly repository: WorkspaceDatabaseRepository,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super();
  }

  onModuleInit() {
    // Another process switched a workspace's database: stop using the old one here too.
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('error', () => undefined);
    this.subscriber.on('ready', () => void this.subscriber!.subscribe(DB_CHANGED_CHANNEL).catch(() => undefined));
    this.subscriber.on('message', (_channel: string, tenantId: string) => void this.forgetLocal(tenantId));
  }

  async onModuleDestroy() {
    this.subscriber?.disconnect();
    const open = [...this.external.values()].map((e) => e.connection);
    this.external.clear();
    await Promise.allSettled([...open, ...(this.managed ? [this.managed] : [])].map(async (c) => (await c).close()));
  }

  async model<T>(tenantId: string, name: string, schema: Schema<T>): Promise<Model<T>> {
    const connection = await this.connect(await this.configOf(tenantId));
    return (connection.models[name] as Model<T> | undefined) ?? connection.model<T>(name, schema);
  }

  configOf(tenantId: string): Promise<WorkspaceDatabaseConfig> {
    const cached = this.configs.get(tenantId);
    if (cached && Date.now() - cached.at < CONFIG_CACHE_MS) return cached.config;
    const config = this.repository.find(tenantId).then((found) => found ?? managedDefault(tenantId));
    config.catch(() => this.configs.delete(tenantId));
    this.configs.set(tenantId, { at: Date.now(), config });
    return config;
  }

  async connect(config: WorkspaceDatabaseConfig): Promise<Connection> {
    if (config.mode === 'managed') return (await this.managedPool()).useDb(config.databaseName, { useCache: true });
    const key = createHash('sha256').update(config.encryptedUri ?? '').digest('hex');
    const open = this.external.get(config.tenantId);
    if (open?.key === key) {
      open.usedAt = Date.now();
      return open.connection;
    }
    if (open) void this.close(config.tenantId);
    const connection = mongoose.createConnection(decryptSecret(config.encryptedUri!), EXTERNAL_CONNECTION_OPTIONS).asPromise();
    connection.catch(() => this.external.get(config.tenantId)?.key === key && this.external.delete(config.tenantId));
    this.external.set(config.tenantId, { key, connection, usedAt: Date.now() });
    this.evictBeyondLimit();
    return connection;
  }

  openExternal(db: ExternalDatabase): Promise<Connection> {
    return mongoose.createConnection(db.uri, EXTERNAL_CONNECTION_OPTIONS).asPromise();
  }

  async forget(tenantId: string) {
    await this.forgetLocal(tenantId);
    await this.redis.publish(DB_CHANGED_CHANNEL, tenantId).catch((error) => this.logger.warn(`Could not notify other processes: ${(error as Error).message}`));
  }

  /** Open workspace-owned connections, for the load report. */
  stats() {
    return { externalConnections: this.external.size };
  }

  private async forgetLocal(tenantId: string) {
    this.configs.delete(tenantId);
    await this.close(tenantId);
  }

  private managedPool(): Promise<Connection> {
    this.managed ??= mongoose.createConnection(appConfig.businessMongoUri, MANAGED_CONNECTION_OPTIONS).asPromise();
    return this.managed;
  }

  private async close(tenantId: string) {
    const open = this.external.get(tenantId);
    if (!open) return;
    this.external.delete(tenantId);
    await open.connection.then((c) => c.close()).catch(() => undefined);
  }

  private evictBeyondLimit() {
    if (this.external.size <= MAX_EXTERNAL_CONNECTIONS) return;
    const [oldest] = [...this.external.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)[0];
    void this.close(oldest);
  }
}
