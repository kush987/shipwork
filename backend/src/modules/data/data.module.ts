import { Module } from '@nestjs/common';
import { MongoDataCollectionRepository, MongoDataRecordRepository } from './infrastructure/mongo-data.repository';
import { LegacyRecordsMigrator } from './infrastructure/legacy-records-migrator';
import { RecordChangeFeed } from './domain/record-change-feed.ports';
import { MongoRecordChangeFeed } from './infrastructure/mongo-record-change-feed';
import { DataService } from './application/data.service';
import { DataTransactionService } from './application/data-transaction.service';
import { DataController } from './presentation/data.controller';
import { DataCollectionRepository, DataRecordRepository } from './domain/data-collection.repository';
import { DataSourceService } from './application/data-source.service';
import { SYSTEM_DATA_SOURCES } from './domain/data-source.constants';
import { ShipmentModule } from '../shipment/shipment.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { CourierModule } from '../courier/courier.module';
import { ShipmentsDataSource } from '../shipment/application/shipments.data-source';
import { WarehousesDataSource } from '../warehouse/application/warehouses.data-source';
import { CouriersDataSource } from '../courier/infrastructure/couriers.data-source';

/**
 * Tenant-scoped data store that workflows read and write through the data nodes, plus read access
 * to built-in data other modules contribute (shipments, warehouses, couriers).
 */
@Module({
  imports: [
    ShipmentModule,
    WarehouseModule,
    CourierModule,
  ],
  controllers: [DataController],
  providers: [
    { provide: DataCollectionRepository, useClass: MongoDataCollectionRepository },
    { provide: DataRecordRepository, useClass: MongoDataRecordRepository },
    LegacyRecordsMigrator,
    { provide: RecordChangeFeed, useClass: MongoRecordChangeFeed },
    DataService,
    DataTransactionService,
    DataSourceService,
    // Each built-in source lives in the module that owns the data; adding one is a line here.
    {
      provide: SYSTEM_DATA_SOURCES,
      useFactory: (...sources: unknown[]) => sources,
      inject: [ShipmentsDataSource, WarehousesDataSource, CouriersDataSource],
    },
  ],
  exports: [DataService, DataTransactionService, DataSourceService, RecordChangeFeed],
})
export class DataModule {}
