import type { Model, Schema } from 'mongoose';

/**
 * Business data (shipments, warehouses, records…) lives in each workspace's own database. Business
 * repositories ask this port for the model of a collection in the workspace's database instead of
 * injecting one global model; where that database is (managed or the workspace's own) is decided
 * by the workspace-db module.
 */
export abstract class TenantModels {
  abstract model<T>(tenantId: string, name: string, schema: Schema<T>): Promise<Model<T>>;
}
