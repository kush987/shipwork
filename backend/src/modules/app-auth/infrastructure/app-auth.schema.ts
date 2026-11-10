import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Platform database: sign-in providers of each workspace's apps. */
@Schema({ collection: 'auth_providers' })
export class AuthProviderDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) issuer: string;
  @Prop({ type: String, default: null }) audience: string | null;
  @Prop({ type: String, default: null }) jwksUrl: string | null;
  @Prop({ type: String, default: null }) encryptedSecret: string | null;
  @Prop({ required: true }) rolesClaim: string;
  @Prop({ required: true }) tokenTtlMinutes: number;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) updatedAt: Date;
}
export const AuthProviderSchema = SchemaFactory.createForClass(AuthProviderDoc);
AuthProviderSchema.index({ tenantId: 1 });
