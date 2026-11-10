/**
 * Gives a workspace an owner account — for workspaces whose data predates accounts (e.g. `demo`)
 * or to recover access. Idempotent; never changes an existing password.
 *
 *   node dist/scripts/create-workspace-owner.js --tenant demo --tenant-name "Demo Logistics" \
 *     --email owner@example.com --name "Owner" --password '<at least 10 characters>'
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { parseArgs } from 'node:util';
import { config } from '../config/configuration';
import { RedisModule } from '../shared/redis/redis.module';
import { RateLimitModule } from '../shared/rate-limit/rate-limit.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { MembersService } from '../modules/identity/application/members.service';
import { passwordIssue } from '../modules/identity/domain/identity';

@Module({ imports: [MongooseModule.forRoot(config.mongoUri), RedisModule, RateLimitModule, IdentityModule] })
class OwnerScriptModule {}

async function main() {
  const { values } = parseArgs({
    options: { tenant: { type: 'string' }, 'tenant-name': { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' } },
  });
  const missing = ['tenant', 'email', 'password'].filter((k) => !values[k as keyof typeof values]);
  if (missing.length) throw new Error(`Missing --${missing.join(', --')}`);
  const issue = passwordIssue(values.password!);
  if (issue) throw new Error(issue);

  const app = await NestFactory.createApplicationContext(OwnerScriptModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(MembersService).ensureWorkspaceOwner({
      tenantId: values.tenant!,
      tenantName: values['tenant-name'] ?? values.tenant!,
      email: values.email!,
      name: values.name ?? values.email!.split('@')[0],
      password: values.password!,
    });
    console.log(result.created.length ? `Created: ${result.created.join(', ')}` : 'Nothing to do — already set up');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
