import type { RecordQuery } from '../../../shared/query/record-query.types';
import type { SourceRecord, SystemSourceInfo } from './data-source.types';

/**
 * A read-only view of data another module owns (Strategy / port). The owning module implements it
 * and registers it under SYSTEM_DATA_SOURCES; the data steps and the Data page read through it
 * without knowing how it is stored. Queries arrive parsed and limited to `info.fields`.
 */
export abstract class SystemDataSource {
  abstract readonly info: SystemSourceInfo;
  abstract get(tenantId: string, id: string): Promise<SourceRecord | null>;
  abstract find(tenantId: string, query: RecordQuery): Promise<{ records: SourceRecord[]; total: number }>;
}
