import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'audit_events' })
export class AuditEventDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) at: Date;
  @Prop() actorUserId?: string;
  @Prop() actorEmail?: string;
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) resource: string;
  @Prop({ required: true }) method: string;
  @Prop({ required: true }) path: string;
  @Prop({ required: true }) decision: string;
  @Prop({ required: true }) status: number;
  @Prop() reason?: string;
  @Prop({ default: '' }) ip: string;
  @Prop({ required: true }) expiresAt: Date;
}
export const AuditEventSchema = SchemaFactory.createForClass(AuditEventDoc);
AuditEventSchema.index({ tenantId: 1, at: -1 });
AuditEventSchema.index({ tenantId: 1, actorUserId: 1, at: -1 });
// MongoDB deletes entries once they are older than the retention period.
AuditEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
