import { Injectable, Logger } from '@nestjs/common';
import type { Connection } from 'mongoose';
import { InvalidOperationError, UpstreamError } from '../../../shared/domain/errors';
import { encryptSecret } from '../../../shared/security/encryption';
import { config as appConfig } from '../../../config/configuration';
import { BusinessDataCopier, WorkspaceConnections } from './workspace-db.ports';
import { WorkspaceDatabaseRepository } from '../domain/workspace-db.repository';
import { managedDefault } from '../domain/workspace-db';
import { validateExternalUri } from '../infrastructure/external-uri';
import { MANAGED_HOST_LABEL, OWNED_BY_ANOTHER, PING_TIMEOUT_MS } from './workspace-db.service.constants';
import { describeConnectionError, platformDatabaseName, withTimeout } from './workspace-db.helpers';
import type { DatabaseTestResult, SwitchDatabaseInput, WorkspaceDatabaseConfig, WorkspaceDatabaseView } from '../domain/workspace-db.types';

/** A workspace's business database: show it, test another one, switch (optionally copying data). */
@Injectable()
export class WorkspaceDatabaseService {
  private readonly logger = new Logger(WorkspaceDatabaseService.name);

  constructor(
    private readonly repository: WorkspaceDatabaseRepository,
    private readonly connections: WorkspaceConnections,
    private readonly copier: BusinessDataCopier,
  ) {}

  async view(tenantId: string): Promise<WorkspaceDatabaseView> {
    const config = await this.connections.configOf(tenantId);
    const base = { mode: config.mode, databaseName: config.databaseName, host: config.mode === 'managed' ? MANAGED_HOST_LABEL : (config.hosts ?? ''), connectedAt: config.connectedAt };
    try {
      const connection = await withTimeout(this.connections.connect(config), PING_TIMEOUT_MS);
      return { ...base, status: 'ok', collections: await withTimeout(this.copier.counts(connection, tenantId), PING_TIMEOUT_MS) };
    } catch (error) {
      return { ...base, status: 'unreachable', error: describeConnectionError(error), collections: [] };
    }
  }

  /** Can ShipFlow use this database? Nothing is saved. */
  async test(tenantId: string, uri: string): Promise<DatabaseTestResult> {
    const db = await this.validate(uri);
    const started = Date.now();
    let connection: Connection | undefined;
    try {
      connection = await this.connections.openExternal(db);
      await connection.db!.command({ ping: 1 });
      const latencyMs = Date.now() - started;
      const others = await this.copier.otherWorkspaces(connection, tenantId);
      if (others.length) return { ok: false, error: OWNED_BY_ANOTHER };
      const hasWorkspaceData = (await this.copier.counts(connection, tenantId)).some((c) => c.documents > 0);
      return { ok: true, databaseName: db.databaseName, host: db.hosts, latencyMs, hasWorkspaceData };
    } catch (error) {
      return { ok: false, error: describeConnectionError(error) };
    } finally {
      await connection?.close().catch(() => undefined);
    }
  }

  /**
   * Points the workspace at another database. With copyData, its business documents are copied
   * first (and verified); the old database keeps its copy until someone removes it.
   */
  async switch(tenantId: string, input: SwitchDatabaseInput): Promise<WorkspaceDatabaseView> {
    const current = await this.connections.configOf(tenantId);
    if (input.mode === 'managed' && current.mode === 'managed') return this.view(tenantId);
    const external = input.mode === 'external' ? await this.validate(input.uri) : null;
    const now = new Date().toISOString();
    const target: WorkspaceDatabaseConfig = external
      ? { tenantId, mode: 'external', databaseName: external.databaseName, encryptedUri: encryptSecret(external.uri), hosts: external.hosts, connectedAt: now, updatedAt: now }
      : { ...managedDefault(tenantId), updatedAt: now };

    // A workspace-owned database gets a temporary connection here; the cached one opens on next use.
    let targetConnection: Connection;
    try {
      targetConnection = external ? await this.connections.openExternal(external) : await this.connections.connect(target);
      await targetConnection.db!.command({ ping: 1 });
    } catch (error) {
      throw new UpstreamError(`Could not connect to the new database: ${describeConnectionError(error)}`);
    }
    try {
      if ((await this.copier.otherWorkspaces(targetConnection, tenantId)).length) throw new InvalidOperationError(OWNED_BY_ANOTHER);
      if (input.copyData) {
        if ((await this.copier.counts(targetConnection, tenantId)).some((c) => c.documents > 0)) {
          throw new InvalidOperationError('The new database already holds this workspace’s data — switch without copying, or empty it first');
        }
        const copied = await this.copier.copy(tenantId, await this.connections.connect(current), targetConnection);
        this.logger.log(`Workspace ${tenantId}: copied ${copied.map((c) => `${c.documents} ${c.name}`).join(', ')} to ${target.databaseName}`);
      }
      await this.repository.save(target);
      await this.connections.forget(tenantId);
    } finally {
      if (external) await targetConnection.close().catch(() => undefined);
    }
    return this.view(tenantId);
  }

  private validate(uri: string) {
    return validateExternalUri(uri, { allowPrivate: appConfig.allowPrivateDbHosts, platformDbName: platformDatabaseName() });
  }
}
