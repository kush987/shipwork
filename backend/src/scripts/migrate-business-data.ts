/**
 * Moves business data (shipments, warehouses, courier requests, data collections/records) from the
 * platform database — where it lived before workspaces had their own databases — into each
 * workspace's own database, and builds the AWB routes courier webhooks use.
 *
 *   node dist/scripts/migrate-business-data.js              # copy + verify (safe to repeat)
 *   node dist/scripts/migrate-business-data.js --delete     # …then remove the copied data from the platform database
 *   node dist/scripts/migrate-business-data.js --tenant demo
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { parseArgs } from 'node:util';
import type { Connection } from 'mongoose';
import { config } from '../config/configuration';
import { RedisModule } from '../shared/redis/redis.module';
import { WorkspaceDbModule } from '../modules/workspace-db/workspace-db.module';
import { BusinessDataCopier, WorkspaceConnections } from '../modules/workspace-db/application/workspace-db.ports';
import { BUSINESS_COLLECTIONS } from '../modules/workspace-db/domain/workspace-db.constants';

@Module({ imports: [MongooseModule.forRoot(config.mongoUri), RedisModule, WorkspaceDbModule] })
class MigrationModule {}

const summary = (counts: { name: string; documents: number }[]) => counts.map((c) => `${c.documents} ${c.name}`).join(', ');

async function main() {
  const { values } = parseArgs({ options: { delete: { type: 'boolean', default: false }, tenant: { type: 'string' } } });
  const app = await NestFactory.createApplicationContext(MigrationModule, { logger: ['error', 'warn'] });
  try {
    const platform = app.get<Connection>(getConnectionToken());
    const connections = app.get(WorkspaceConnections);
    const copier = app.get(BusinessDataCopier);
    const db = platform.db!;

    const tenants = new Set<string>();
    for (const { name } of BUSINESS_COLLECTIONS) {
      for (const t of await db.collection(name).distinct('tenantId')) tenants.add(String(t));
    }
    const selected = [...tenants].filter((t) => !values.tenant || t === values.tenant).sort();
    if (!selected.length) console.log('No business data left in the platform database — nothing to move.');

    for (const tenantId of selected) {
      const target = await connections.connect(await connections.configOf(tenantId));
      if (target.db!.databaseName === db.databaseName) throw new Error(`${tenantId}: its database is the platform database — refusing`);
      const before = await copier.counts(platform, tenantId);
      const copied = await copier.copy(tenantId, platform, target);
      const routes = target.db!.collection('shipments').find({ tenantId, awb: { $type: 'string' } }, { projection: { awb: 1 } });
      let routed = 0;
      for await (const s of routes) {
        await db.collection('awb_routes').updateOne({ _id: s.awb }, { $set: { tenantId, shipmentId: s._id, updatedAt: new Date() } }, { upsert: true });
        routed++;
      }
      console.log(`${tenantId} → ${target.db!.databaseName}: platform had ${summary(before)}; workspace now has ${summary(copied)}; ${routed} AWB routes`);
      if (values.delete) console.log(`  removed ${await copier.remove(platform, tenantId)} documents from the platform database`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
