import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { WorkflowDefinition } from '../domain/workflow-definition.types';

@Schema({ collection: 'workflows' })
export class WorkflowDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) status: string;
  @Prop({ type: String, default: null }) triggerEvent: string | null;
  @Prop({ type: Number, default: null }) publishedVersion: number | null;
  @Prop({ required: true }) latestVersion: number;
  @Prop({ default: false }) paused: boolean;
  @Prop({ type: Date, default: null }) pausedAt: Date | null;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) updatedAt: Date;
}
export const WorkflowSchema = SchemaFactory.createForClass(WorkflowDoc);
WorkflowSchema.index({ tenantId: 1, status: 1 });
WorkflowSchema.index({ tenantId: 1, status: 1, triggerEvent: 1 });

@Schema({ collection: 'workflow_versions', minimize: false })
export class WorkflowVersionDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) workflowId: string;
  @Prop({ required: true }) version: number;
  @Prop({ required: true }) status: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) definition: WorkflowDefinition;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
}
export const WorkflowVersionSchema = SchemaFactory.createForClass(WorkflowVersionDoc);
WorkflowVersionSchema.index({ workflowId: 1, version: 1 }, { unique: true });
// At most one draft per workflow, enforced by the database rather than application code.
WorkflowVersionSchema.index({ workflowId: 1 }, { unique: true, partialFilterExpression: { status: 'draft' } });
