import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { StepLogic } from '../../workflow/domain/workflow-definition.types';

/** Immutable history of a workspace's changes to a built-in step; the newest version is the one in use. */
@Schema({ collection: 'builtin_node_edits', minimize: false })
export class BuiltinNodeEditDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) version: number;
  @Prop({ type: String }) label?: string;
  @Prop({ type: String }) description?: string;
  @Prop({ type: String }) icon?: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) defaults: Record<string, unknown>;
  @Prop({ type: MongooseSchema.Types.Mixed }) logic?: StepLogic;
  @Prop({ default: false }) reset: boolean;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ type: String, default: null }) createdBy: string | null;
}
export const BuiltinNodeEditSchema = SchemaFactory.createForClass(BuiltinNodeEditDoc);
BuiltinNodeEditSchema.index({ tenantId: 1, type: 1, version: 1 }, { unique: true });
