import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BuiltinNodeEditDoc, BuiltinNodeEditSchema } from './infrastructure/builtin-node-edit.schema';
import { MongoBuiltinNodeEditRepository } from './infrastructure/mongo-builtin-node-edit.repository';
import { BuiltinNodeEditRepository } from './domain/builtin-node-edit.repository';

/**
 * Storage for workspaces' changes to built-in steps. The steps themselves live in the nodes module,
 * which reads these to show them (catalog) and run them (workspace logic).
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: BuiltinNodeEditDoc.name, schema: BuiltinNodeEditSchema }])],
  providers: [{ provide: BuiltinNodeEditRepository, useClass: MongoBuiltinNodeEditRepository }],
  exports: [BuiltinNodeEditRepository],
})
export class BuiltinNodeModule {}
