import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomNodeDoc, CustomNodeSchema, CustomNodeVersionDoc, CustomNodeVersionSchema } from './infrastructure/custom-node.schema';
import { MongoCustomNodeRepository } from './infrastructure/mongo-custom-node.repository';
import { QuickJsSandbox } from './infrastructure/quickjs-sandbox';
import { ThreadedCodeSandbox } from './infrastructure/threaded-code-sandbox';
import { config } from '../../config/configuration';
import { CustomNodeService } from './application/custom-node.service';
import { CustomNodeController } from './presentation/custom-node.controller';
import { CodeSandbox } from './application/code-sandbox.ports';
import { CustomNodeRepository } from './domain/custom-node.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomNodeDoc.name, schema: CustomNodeSchema },
      { name: CustomNodeVersionDoc.name, schema: CustomNodeVersionSchema },
    ]),
  ],
  controllers: [CustomNodeController],
  providers: [
    { provide: CustomNodeRepository, useClass: MongoCustomNodeRepository },
    // User code runs on SANDBOX_THREADS worker threads so it never blocks request handling; 0 keeps it in-process.
    { provide: CodeSandbox, useFactory: () => (config.sandboxThreads > 0 ? new ThreadedCodeSandbox(config.sandboxThreads) : new QuickJsSandbox()) },
    CustomNodeService,
  ],
  exports: [CustomNodeService, CodeSandbox],
})
export class CustomNodeModule {}
