import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { IntegrationMode } from '../../domain/courier-integration.types';

/** A courier's API connection, shared by every workspace (platform admins set it). Secrets are encrypted. */
@Schema({ collection: 'courier_integrations', minimize: false })
export class CourierIntegrationDoc {
  /** The courier code (delhivery, xpressbees…). */
  @Prop({ type: String }) _id: string;
  @Prop({ type: String, required: true }) mode: IntegrationMode;
  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({ sandbox: {}, live: {} }) }) settings: Record<string, Record<string, string>>;
  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) }) lastTest: Record<string, unknown>;
  @Prop({ required: true }) updatedAt: Date;
  @Prop({ type: String, default: null }) updatedBy: string | null;
}
export const CourierIntegrationSchema = SchemaFactory.createForClass(CourierIntegrationDoc);
