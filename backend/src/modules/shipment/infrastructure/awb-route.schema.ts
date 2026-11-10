import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Platform database: which workspace a courier tracking number (AWB) belongs to. Courier webhooks
 * only carry the AWB, while shipments live in each workspace's own database.
 */
@Schema({ collection: 'awb_routes' })
export class AwbRouteDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) shipmentId: string;
  @Prop({ required: true }) updatedAt: Date;
}
export const AwbRouteSchema = SchemaFactory.createForClass(AwbRouteDoc);
