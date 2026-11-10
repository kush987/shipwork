import { Module } from '@nestjs/common';
import { MongoWarehouseRepository } from './infrastructure/mongo-warehouse.repository';
import { WarehouseService } from './application/warehouse.service';
import { WarehouseController } from './presentation/warehouse.controller';
import { WarehouseRepository } from './domain/warehouse.repository';

import { WarehousesDataSource } from './application/warehouses.data-source';

@Module({
  controllers: [WarehouseController],
  providers: [{ provide: WarehouseRepository, useClass: MongoWarehouseRepository }, WarehouseService, WarehousesDataSource],
  exports: [WarehouseService, WarehousesDataSource],
})
export class WarehouseModule {}
