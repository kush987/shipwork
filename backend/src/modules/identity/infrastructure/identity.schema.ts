import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { Policy } from '../../../shared/policy/policy.types';

@Schema({ collection: 'users' })
export class UserDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) email: string;
  @Prop({ required: true }) passwordHash: string;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) updatedAt: Date;
}
export const UserSchema = SchemaFactory.createForClass(UserDoc);
UserSchema.index({ email: 1 }, { unique: true });

/** A workspace; `_id` is the tenant id the rest of the system scopes data by. */
@Schema({ collection: 'tenants' })
export class TenantDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) createdAt: Date;
}
export const TenantSchema = SchemaFactory.createForClass(TenantDoc);

@Schema({ collection: 'memberships' })
export class MembershipDoc {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) role: string;
  @Prop({ required: true }) createdAt: Date;
}
export const MembershipSchema = SchemaFactory.createForClass(MembershipDoc);
MembershipSchema.index({ userId: 1, tenantId: 1 }, { unique: true });
MembershipSchema.index({ tenantId: 1 });

/** A role a workspace made; members reference it by id. */
@Schema({ collection: 'roles' })
export class RoleDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) policy: Policy;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) updatedAt: Date;
}
export const RoleSchema = SchemaFactory.createForClass(RoleDoc);
RoleSchema.index({ tenantId: 1 });

@Schema({ collection: 'sessions' })
export class SessionDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) tokenHash: string;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) expiresAt: Date;
  @Prop({ required: true }) lastUsedAt: Date;
}
export const SessionSchema = SchemaFactory.createForClass(SessionDoc);
SessionSchema.index({ tokenHash: 1 }, { unique: true });
SessionSchema.index({ userId: 1 });
// Expired sessions are deleted by MongoDB.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
