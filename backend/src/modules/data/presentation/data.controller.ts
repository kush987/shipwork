import { Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { InvalidOperationError, NotFoundError } from '../../../shared/domain/errors';
import { DataService } from '../application/data.service';
import { DataSourceService } from '../application/data-source.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CollectionDto } from './dto/collection.dto';
import { IndexSpecDto } from './dto/index-spec.dto';
import { RenameCollectionDto } from './dto/rename-collection.dto';
import { parseJsonQueryParam } from '../../../shared/http/query-params';
import { Area, Permission } from '../../../shared/auth/auth.decorators';
import { AggregateDto, ChangeRecordDto, ManyRecordsDto, TransactionDto, UpdateManyDto, UpsertRecordDto } from './dto/record-operations.dto';
import { DataTransactionService } from '../application/data-transaction.service';

@ApiTags('data')
@Area('data')
@Controller('data')
export class DataController {
  constructor(
    private readonly data: DataService,
    private readonly sources: DataSourceService,
    private readonly transactions: DataTransactionService,
  ) {}

  /**
   * Writes across collections that all happen or none does: { committed, results } — or, rolled back,
   * { committed: false, abortedAt, reason: not_found | unmet | duplicate | invalid, message }.
   */
  @Post('transaction')
  @HttpCode(200)
  transaction(@TenantId() tenantId: string, @Body() dto: TransactionDto) {
    return this.transactions.run(tenantId, dto.operations.length, (i) => dto.operations[i]);
  }

  /** Everything workflows can read: the tenant's collections, then built-in data (read-only). */
  @Get('sources')
  listSources(@TenantId() tenantId: string) {
    return this.sources.list(tenantId);
  }

  @Get('sources/:name/records')
  listSourceRecords(
    @TenantId() tenantId: string,
    @Param('name') name: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('filter') filter?: string,
    @Query('sort') sort?: string,
  ) {
    return this.sources.listRecords(tenantId, name, { limit, skip, filter: parseJsonQueryParam(filter, 'Filter'), sort: parseJsonQueryParam(sort, 'Sort') });
  }

  @Get('sources/:name/records/:id')
  getSourceRecord(@TenantId() tenantId: string, @Param('name') name: string, @Param('id') id: string) {
    return this.sources.requireRecord(tenantId, name, id);
  }

  @Get('collections')
  listCollections(@TenantId() tenantId: string) {
    return this.data.listCollections(tenantId);
  }

  @Post('collections')
  createCollection(@TenantId() tenantId: string, @Body() dto: CreateCollectionDto) {
    return this.data.createCollection(tenantId, dto);
  }

  @Post('samples')
  @HttpCode(200)
  samples(@TenantId() tenantId: string) {
    return this.data.seedSamples(tenantId);
  }

  @Put('collections/:name')
  updateCollection(@TenantId() tenantId: string, @Param('name') name: string, @Body() dto: CollectionDto) {
    return this.data.updateCollection(tenantId, name, dto);
  }

  @Delete('collections/:name')
  @HttpCode(204)
  deleteCollection(@TenantId() tenantId: string, @Param('name') name: string) {
    return this.data.deleteCollection(tenantId, name);
  }

  @Post('collections/:name/rename')
  @HttpCode(200)
  renameCollection(@TenantId() tenantId: string, @Param('name') name: string, @Body() dto: RenameCollectionDto) {
    return this.data.renameCollection(tenantId, name, dto.name);
  }

  /** Records, sizes and the MongoDB collection that holds them. */
  @Get('collections/:name/stats')
  collectionStats(@TenantId() tenantId: string, @Param('name') name: string) {
    return this.data.collectionStats(tenantId, name);
  }

  /** Every index of the collection — built-in, unique fields, custom, and any made outside ShipFlow — with size and use. */
  @Get('collections/:name/indexes')
  listIndexes(@TenantId() tenantId: string, @Param('name') name: string) {
    return this.data.listIndexes(tenantId, name);
  }

  @Post('collections/:name/indexes')
  addIndex(@TenantId() tenantId: string, @Param('name') name: string, @Body() dto: IndexSpecDto) {
    return this.data.addIndex(tenantId, name, dto);
  }

  @Delete('collections/:name/indexes/:index')
  @HttpCode(204)
  dropIndex(@TenantId() tenantId: string, @Param('name') name: string, @Param('index') index: string) {
    return this.data.dropIndex(tenantId, name, index);
  }

  /** `filter` may search text ({"$text": "red shirt"}, best matches first); `fields` limits what each record carries. */
  @Get('collections/:name/records')
  listRecords(
    @TenantId() tenantId: string,
    @Param('name') name: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('filter') filter?: string,
    @Query('sort') sort?: string,
    @Query('fields') fields?: string,
  ) {
    return this.data.listRecords(tenantId, name, { limit, skip, filter: parseJsonQueryParam(filter, 'Filter'), sort: parseJsonQueryParam(sort, 'Sort'), fields });
  }

  @Post('collections/:name/records/update-many')
  @HttpCode(200)
  updateMany(@TenantId() tenantId: string, @Param('name') name: string, @Body() dto: UpdateManyDto) {
    return this.data.updateMany(tenantId, name, dto);
  }

  @Post('collections/:name/records/delete-many')
  @HttpCode(200)
  deleteMany(@TenantId() tenantId: string, @Param('name') name: string, @Body() dto: ManyRecordsDto) {
    return this.data.deleteMany(tenantId, name, dto);
  }

  /** Changes the newest record whose field equals the value, or creates it: { outcome: updated | created, record }. */
  @Post('collections/:name/records/upsert')
  @HttpCode(200)
  async upsertRecord(@TenantId() tenantId: string, @Param('name') name: string, @Body() dto: UpsertRecordDto) {
    return this.data.changeRecord(tenantId, name, { field: dto.findBy, value: dto.value }, dto.update, { upsert: true });
  }

  /** The different values of a field among the records matching `filter`. */
  @Get('collections/:name/distinct')
  distinct(@TenantId() tenantId: string, @Param('name') name: string, @Query('field') field: string, @Query('filter') filter?: string) {
    return this.data.distinct(tenantId, name, field, parseJsonQueryParam(filter, 'Filter'));
  }

  /** Runs a MongoDB aggregation pipeline (reading stages only) over the collection: { results, truncated }. */
  @Post('collections/:name/aggregate')
  @HttpCode(200)
  @Permission('data:read')
  aggregate(@TenantId() tenantId: string, @Param('name') name: string, @Body() dto: AggregateDto) {
    return this.data.aggregate(tenantId, name, dto.pipeline);
  }

  // Records are free-form JSON, so the body is taken as-is and validated against the collection's schema.
  @Post('collections/:name/records')
  createRecord(@TenantId() tenantId: string, @Param('name') name: string, @Body() body: Record<string, unknown>) {
    return this.data.createRecord(tenantId, name, body);
  }

  @Get('collections/:name/records/:id')
  getRecord(@TenantId() tenantId: string, @Param('name') name: string, @Param('id') id: string, @Query('fields') fields?: string) {
    return this.data.requireRecord(tenantId, name, id, fields);
  }

  /** Applies MongoDB update operators to one record; 409 when `onlyIf` doesn't hold (nothing changes then). */
  @Post('collections/:name/records/:id/update')
  @HttpCode(200)
  async changeRecord(@TenantId() tenantId: string, @Param('name') name: string, @Param('id') id: string, @Body() dto: ChangeRecordDto) {
    const { outcome, record } = await this.data.changeRecord(tenantId, name, { id }, dto.update, { onlyIf: dto.onlyIf });
    if (outcome === 'not_found') throw new NotFoundError(`Record in ${name}`, id);
    if (outcome === 'unmet') throw new InvalidOperationError(`The record doesn't match onlyIf — nothing was changed`);
    return record;
  }

  @Patch('collections/:name/records/:id')
  async updateRecord(@TenantId() tenantId: string, @Param('name') name: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const record = await this.data.updateRecord(tenantId, name, id, body);
    if (!record) throw new NotFoundError(`Record in ${name}`, id);
    return record;
  }

  @Delete('collections/:name/records/:id')
  @HttpCode(204)
  async deleteRecord(@TenantId() tenantId: string, @Param('name') name: string, @Param('id') id: string) {
    if (!(await this.data.deleteRecord(tenantId, name, id))) throw new NotFoundError(`Record in ${name}`, id);
  }
}
