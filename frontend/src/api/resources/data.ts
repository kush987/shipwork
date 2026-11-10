import { request } from '../http';
import { qs, seg } from '../http.helpers';
import type {
  CollectionInput,
  CollectionStats,
  IndexInfo,
  IndexSpec,
  CollectionUpdate,
  DataCollection,
  DataRecord,
  RecordsPage,
  RecordsQuery,
  SampleDataResult,
  DataSourceInfo,
  SourceRecord,
  SourceRecordsPage,
} from '../types';

const records = (name: string) => `/data/collections/${seg(name)}/records`;
const sourceRecords = (name: string) => `/data/sources/${seg(name)}/records`;

export const dataApi = {
  listCollections: () => request<DataCollection[]>('GET', '/data/collections'),
  createCollection: (body: CollectionInput) => request<DataCollection>('POST', '/data/collections', body),
  updateCollection: (name: string, body: CollectionUpdate) => request<DataCollection>('PUT', `/data/collections/${seg(name)}`, body),
  deleteCollection: (name: string) => request<void>('DELETE', `/data/collections/${seg(name)}`),
  /** Renames the collection (and its MongoDB collection); workflows that use the old name must be changed. */
  renameCollection: (name: string, to: string) => request<DataCollection>('POST', `/data/collections/${seg(name)}/rename`, { name: to }),
  collectionStats: (name: string) => request<CollectionStats>('GET', `/data/collections/${seg(name)}/stats`),
  /** Every index — built-in, unique fields, custom, external — with size and use count. */
  listIndexes: (name: string) => request<IndexInfo[]>('GET', `/data/collections/${seg(name)}/indexes`),
  addIndex: (name: string, index: IndexSpec) => request<IndexInfo[]>('POST', `/data/collections/${seg(name)}/indexes`, index),
  dropIndex: (name: string, index: string) => request<void>('DELETE', `/data/collections/${seg(name)}/indexes/${seg(index)}`),
  /** Adds sample `products` (with records) and `orders` collections if missing. */
  addSampleData: () => request<SampleDataResult>('POST', '/data/samples'),

  listRecords: (name: string, q: RecordsQuery = {}) => request<RecordsPage>('GET', `${records(name)}${qs({ limit: 50, skip: 0, ...q })}`),
  getRecord: (name: string, id: string) => request<DataRecord>('GET', `${records(name)}/${seg(id)}`),
  createRecord: (name: string, fields: Record<string, unknown>) => request<DataRecord>('POST', records(name), fields),
  /** `null` removes a field. */
  updateRecord: (name: string, id: string, changes: Record<string, unknown>) =>
    request<DataRecord>('PATCH', `${records(name)}/${seg(id)}`, changes),
  deleteRecord: (name: string, id: string) => request<void>('DELETE', `${records(name)}/${seg(id)}`),

  /** Everything data steps can read: your collections, then built-in data (`system.*`, read-only). */
  listDataSources: () => request<DataSourceInfo[]>('GET', '/data/sources'),
  /** Records of any source, with the same filter / sort language as collections. */
  listSourceRecords: (name: string, q: RecordsQuery = {}) =>
    request<SourceRecordsPage>('GET', `${sourceRecords(name)}${qs({ limit: 50, skip: 0, ...q })}`),
  getSourceRecord: (name: string, id: string) => request<SourceRecord>('GET', `${sourceRecords(name)}/${seg(id)}`),
};
