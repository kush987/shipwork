import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { FieldSpec } from '../../../shared/schema/field-schema.types';

@Schema({ collection: 'api_endpoints', minimize: false })
export class EndpointDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) method: string;
  @Prop({ required: true }) path: string;
  @Prop({ required: true }) workflowId: string;
  @Prop({ required: true }) mode: string;
  @Prop({ required: true }) auth: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] }) requestSchema: FieldSpec[];
  @Prop({ required: true }) timeoutMs: number;
  @Prop({ type: Number, default: null }) rateLimitPerMinute: number | null;
  @Prop({ type: String, default: null }) authProviderId: string | null;
  @Prop({ type: String, default: null }) authorizerWorkflowId: string | null;
  @Prop({ type: Number, default: 0 }) authorizerCacheSeconds: number;
  @Prop({ required: true }) enabled: boolean;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) updatedAt: Date;
}
export const EndpointSchema = SchemaFactory.createForClass(EndpointDoc);
EndpointSchema.index({ tenantId: 1, path: 1 });
