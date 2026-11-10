import { Inject, Injectable } from '@nestjs/common';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { requireFound } from '../../../shared/domain/guards';
import { buildQuery, parseFields } from '../../../shared/query/record-query';
import { pick } from 'lodash';
import { coerceText } from '../../../shared/schema/field-schema';
import { DataService } from './data.service';
import { RecordListInput } from './data.service.types';
import { RECORD_SYSTEM_FIELDS, SYSTEM_DATA_SOURCES } from '../domain/data-source.constants';
import { isSystemSource, unknownFieldIssues } from '../domain/data-source';
import { SystemDataSource } from '../domain/data-source.ports';
import type { DataCollection } from '../domain/data-collection.types';
import type { DataSourceField, DataSourceInfo, SourceRecord, SystemSourceInfo } from '../domain/data-source.types';

const collectionInfo = (c: DataCollection): DataSourceInfo => ({
  name: c.name,
  label: c.label,
  kind: 'collection',
  description: c.description,
  writable: true,
  fields: [
    ...RECORD_SYSTEM_FIELDS,
    ...c.fields.map(({ key, type, description, unique }) => ({ key, type, ...(description ? { description } : {}), ...(unique ? { unique } : {}) })),
  ],
});

const systemInfo = ({ info }: SystemDataSource): DataSourceInfo => ({
  name: info.name,
  label: info.label,
  kind: 'system',
  description: info.description,
  writable: false,
  fields: info.fields,
});

const noSort = (sort: unknown) => sort === undefined || sort === null || sort === '';

/** Built-in records hold the asked-for fields only (plus id and the timestamps), like collection records. */
const onlyFields = (record: SourceRecord, fields: string[] | undefined): SourceRecord =>
  fields?.length ? (pick(record, [...fields, 'id', 'createdAt', 'updatedAt']) as SourceRecord) : record;

/**
 * One way to read records, whatever holds them: the tenant's collections (through DataService)
 * or built-in data other modules contribute as SystemDataSources. The data steps and the Data
 * page depend on this, so a new built-in source needs no change here or in them (Open/Closed).
 */
@Injectable()
export class DataSourceService {
  private readonly systems: Map<string, SystemDataSource>;

  constructor(
    private readonly data: DataService,
    @Inject(SYSTEM_DATA_SOURCES) systems: SystemDataSource[],
  ) {
    this.systems = new Map(systems.map((s) => [s.info.name, s]));
  }

  async list(tenantId: string): Promise<DataSourceInfo[]> {
    const collections = await this.data.listCollections(tenantId);
    return [...collections.map(collectionInfo), ...[...this.systems.values()].map(systemInfo)];
  }

  hasSystemSource(name: string) {
    return this.systems.has(name);
  }

  /** What a built-in source declares (its fields are fixed); undefined for collections and unknown names. */
  systemSourceInfo(name: string): SystemSourceInfo | undefined {
    return this.systems.get(name)?.info;
  }

  /** True when `name` is a collection of the tenant or a built-in source. */
  async exists(tenantId: string, name: string) {
    return isSystemSource(name) ? this.systems.has(name) : this.data.collectionExists(tenantId, name);
  }

  async listRecords(tenantId: string, name: string, input: RecordListInput): Promise<{ total: number; records: SourceRecord[] }> {
    if (!isSystemSource(name)) return this.data.listRecords(tenantId, name, input);
    const source = this.system(name);
    const query = this.queryFor(source, input);
    const page = await source.find(tenantId, query);
    return { ...page, records: page.records.map((r) => onlyFields(r, query.fields)) };
  }

  async findRecords(tenantId: string, name: string, input: RecordListInput): Promise<SourceRecord[]> {
    if (!isSystemSource(name)) return this.data.findRecords(tenantId, name, input);
    return (await this.listRecords(tenantId, name, input)).records;
  }

  /** One record; `fields` (a list or "a,b") limits what it carries. */
  async getRecord(tenantId: string, name: string, id: string, fields?: unknown): Promise<SourceRecord | null> {
    if (!isSystemSource(name)) return this.data.getRecord(tenantId, name, id, fields);
    const record = await this.system(name).get(tenantId, id);
    return record ? onlyFields(record, parseFields(fields)) : null;
  }

  async requireRecord(tenantId: string, name: string, id: string, fields?: unknown): Promise<SourceRecord> {
    return requireFound(await this.getRecord(tenantId, name, id, fields), `Record in ${name}`, id);
  }

  /**
   * Records whose `field` equals `value`, in the source's default order (newest first). Text is read
   * as the field's declared type, so "42" from a URL matches a number field. The match is always
   * `$eq`: a value can't turn into an operator, and anything but a plain value is rejected.
   */
  async findBy(tenantId: string, name: string, field: string, value: unknown, limit: number, fields?: unknown): Promise<SourceRecord[]> {
    const asStored = await this.coercerFor(tenantId, name, field);
    return this.findRecords(tenantId, name, { filter: { [field]: { $eq: asStored(value) } }, limit, fields });
  }

  /** Records whose `field` is one of `values` (each read as the field's declared type), in the source's default order. */
  async findIn(tenantId: string, name: string, field: string, values: unknown[], limit: number): Promise<SourceRecord[]> {
    const asStored = await this.coercerFor(tenantId, name, field);
    return this.findRecords(tenantId, name, { filter: { [field]: { $in: values.map(asStored) } }, limit });
  }

  /** Built-in sources accept only their declared fields and fall back to their own default order. */
  private queryFor(source: SystemDataSource, input: RecordListInput) {
    const query = buildQuery(input);
    if (noSort(input.sort)) query.sort = source.info.defaultSort;
    const issues = unknownFieldIssues(query, source.info.fields, source.info.label);
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
    return query;
  }

  private async fieldsOf(tenantId: string, name: string): Promise<DataSourceField[]> {
    return isSystemSource(name) ? this.system(name).info.fields : collectionInfo(await this.data.getCollection(tenantId, name)).fields;
  }

  /** Reads a value as `field`'s declared type ("42" → 42 for a number field); undeclared fields keep values as they are. */
  private async coercerFor(tenantId: string, name: string, field: string): Promise<(value: unknown) => unknown> {
    const type = (await this.fieldsOf(tenantId, name)).find((f) => f.key === field)?.type;
    return type ? (value) => coerceText(value, type) : (value) => value;
  }

  private system(name: string) {
    return requireFound(this.systems.get(name), 'Data source', name);
  }
}
