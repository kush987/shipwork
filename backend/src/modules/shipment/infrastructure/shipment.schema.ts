import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { Cancellation, Dispatch, ShipmentItem } from '../domain/shipment.types';
import type { WarehouseSnapshot } from '../../warehouse/domain/warehouse.types';
import type { Address } from '../../../shared/domain/address.types';

@Schema({ collection: 'shipments', timestamps: true })
export class ShipmentDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) orderId: string;
  @Prop({ required: true }) status: string;
  @Prop({ required: true }) paymentMode: string;
  @Prop({ default: 0 }) codAmount: number;
  @Prop({ default: 0 }) orderValue: number;
  @Prop({ required: true }) weightKg: number;
  @Prop({ required: true }) pickupPincode: string;
  @Prop({ required: true }) deliveryPincode: string;
  @Prop({ type: MongooseSchema.Types.Mixed }) customer: { name: string; phone: string };
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) items: ShipmentItem[];
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) shippingAddress: Address | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) billingAddress: Address | null;
  @Prop({ type: String, default: null }) pickupWarehouseId: string | null;
  @Prop({ type: String, default: null }) rtoWarehouseId: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) pickupAddress: WarehouseSnapshot | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) rtoAddress: WarehouseSnapshot | null;
  @Prop({ type: String, default: null }) courier: string | null;
  @Prop({ type: String, default: null, index: { sparse: true } }) awb: string | null;
  @Prop({ type: String, default: null }) labelUrl: string | null;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) events: unknown[];
  @Prop({ type: MongooseSchema.Types.Mixed, default: { mode: 'auto', courier: null } }) dispatch: Dispatch;
  @Prop({ type: Date, default: null }) triggeredAt: Date | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) cancellation: Cancellation | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ShipmentSchema = SchemaFactory.createForClass(ShipmentDoc);
ShipmentSchema.index({ tenantId: 1, createdAt: -1 });
ShipmentSchema.index({ tenantId: 1, orderId: 1 });
ShipmentSchema.index({ tenantId: 1, 'items.sku': 1 });
ShipmentSchema.index({ tenantId: 1, status: 1, triggeredAt: 1 });
ShipmentSchema.index({ tenantId: 1, pickupWarehouseId: 1, createdAt: -1 });
