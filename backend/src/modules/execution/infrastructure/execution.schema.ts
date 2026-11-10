import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ collection: 'executions', minimize: false })
export class ExecutionDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) workflowId: string;
  @Prop({ required: true }) workflowName: string;
  @Prop({ required: true }) workflowVersion: number;
  @Prop({ required: true }) mode: string;
  @Prop({ required: true }) status: string;
  @Prop({ type: MongooseSchema.Types.Mixed }) trigger: { event: string; data: unknown };
  @Prop({ type: String, default: null }) shipmentId: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed }) definition: unknown;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) context: Record<string, unknown>;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) response: unknown;
  @Prop({ type: String, default: null }) error: string | null;
  @Prop({ required: true }) traceId: string;
  @Prop({ default: 0 }) pendingSteps: number;
  @Prop({ type: [String], default: [] }) scheduledNodes: string[];
  @Prop({ required: true }) startedAt: Date;
  @Prop({ type: Date, default: null }) completedAt: Date | null;
  @Prop({ type: Number, default: null }) durationMs: number | null;
  /** Set when the run finishes; MongoDB deletes the run after it (TTL index). Null while running. */
  @Prop({ type: Date, default: null }) expiresAt: Date | null;
}
export const ExecutionSchema = SchemaFactory.createForClass(ExecutionDoc);
ExecutionSchema.index({ tenantId: 1, startedAt: -1 });
ExecutionSchema.index({ tenantId: 1, workflowId: 1, status: 1 });
ExecutionSchema.index({ tenantId: 1, shipmentId: 1, startedAt: -1 });
ExecutionSchema.index({ tenantId: 1, mode: 1, startedAt: -1 });
// Retention: documents are deleted once `expiresAt` has passed (null = never, i.e. still running).
ExecutionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'node_executions', minimize: false })
export class NodeExecutionDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) executionId: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) nodeId: string;
  @Prop({ required: true }) nodeType: string;
  @Prop({ required: true }) nodeName: string;
  @Prop({ required: true }) status: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) input: unknown;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) output: unknown;
  @Prop({ type: String, default: null }) error: string | null;
  @Prop({ type: String, default: null }) outputHandle: string | null;
  @Prop({ default: 1 }) attempt: number;
  @Prop({ required: true }) startedAt: Date;
  @Prop({ type: Date, default: null }) completedAt: Date | null;
  @Prop({ type: Number, default: null }) durationMs: number | null;
  @Prop({ type: Date, default: null }) expiresAt: Date | null;
}
export const NodeExecutionSchema = SchemaFactory.createForClass(NodeExecutionDoc);
NodeExecutionSchema.index({ executionId: 1, nodeId: 1 });
NodeExecutionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
