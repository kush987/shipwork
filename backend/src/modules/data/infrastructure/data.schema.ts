import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { FieldSpec } from '../../../shared/schema/field-schema.types';
import type { IndexSpec } from '../domain/data-collection.types';

/**
 * Collection definitions. Each collection's records live in a MongoDB collection of their own,
 * `data.<name>`, in the same workspace database (see MongoDataRecordRepository).
 */
@Schema({ collection: 'data_collections', minimize: false })
export class DataCollectionDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) label: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] }) fields: FieldSpec[];
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] }) indexes: IndexSpec[];
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) updatedAt: Date;
}
export const DataCollectionSchema = SchemaFactory.createForClass(DataCollectionDoc);
DataCollectionSchema.index({ tenantId: 1, name: 1 }, { unique: true });
