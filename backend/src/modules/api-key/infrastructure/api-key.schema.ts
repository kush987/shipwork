import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'api_keys' })
export class ApiKeyDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) prefix: string;
  @Prop({ required: true }) hash: string;
  @Prop({ type: [String], default: null }) endpointIds: string[] | null;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ type: Date, default: null }) lastUsedAt: Date | null;
  @Prop({ type: Date, default: null }) revokedAt: Date | null;
}
export const ApiKeySchema = SchemaFactory.createForClass(ApiKeyDoc);
ApiKeySchema.index({ hash: 1 }, { unique: true });
ApiKeySchema.index({ tenantId: 1, createdAt: -1 });
