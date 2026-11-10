import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditEventDoc, AuditEventSchema } from './infrastructure/audit.schema';
import { MongoAuditLog } from './infrastructure/mongo-audit.log';
import { AuditLog } from './domain/audit-log';
import { AuditService } from './application/audit.service';
import { AuditController } from './presentation/audit.controller';
import { AuditInterceptor } from './presentation/audit.interceptor';

/** Workspace audit log. Global: the auth guard records denials through AuditService. */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AuditEventDoc.name, schema: AuditEventSchema }])],
  controllers: [AuditController],
  providers: [{ provide: AuditLog, useClass: MongoAuditLog }, AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
