import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { Address } from '../../../shared/domain/address.types';

@Schema({ collection: 'warehouses', timestamps: true })
export class WarehouseDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) contactName: string;
  @Prop({ required: true }) phone: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) address: Address;
  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: true }) active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const WarehouseSchema = SchemaFactory.createForClass(WarehouseDoc);
WarehouseSchema.index({ tenantId: 1, active: 1, name: 1 });
