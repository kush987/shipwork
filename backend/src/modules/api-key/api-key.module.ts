import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiKeyDoc, ApiKeySchema } from './infrastructure/api-key.schema';
import { MongoApiKeyRepository } from './infrastructure/mongo-api-key.repository';
import { ApiKeyService } from './application/api-key.service';
import { ApiKeyController } from './presentation/api-key.controller';
import { ApiKeyRepository } from './domain/api-key.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: ApiKeyDoc.name, schema: ApiKeySchema }])],
  controllers: [ApiKeyController],
  providers: [{ provide: ApiKeyRepository, useClass: MongoApiKeyRepository }, ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
