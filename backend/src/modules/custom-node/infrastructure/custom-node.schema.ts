import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { ConfigField } from '../../nodes/domain/workflow-node.types';
import type { CustomNodeApiVersion } from '../domain/custom-node.types';
import type { FieldSpec } from '../../../shared/schema/field-schema.types';

class SpecProps {
  @Prop({ required: true }) label: string;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) icon: string;
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) configSchema: ConfigField[];
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) outputs: { id: string; label: string }[];
  @Prop({ required: true }) code: string;
  // Simple format only; absent on classic nodes (and on everything saved before the format existed).
  @Prop({ type: Number }) apiVersion?: CustomNodeApiVersion;
  @Prop({ type: String }) resultName?: string;
  @Prop({ type: [MongooseSchema.Types.Mixed], default: undefined }) resultSchema?: FieldSpec[];
  @Prop({ type: Boolean }) errorBranch?: boolean;
}

@Schema({ collection: 'custom_nodes', minimize: false })
export class CustomNodeDoc extends SpecProps {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) latestVersion: number;
  @Prop({ default: false }) archived: boolean;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) updatedAt: Date;
}
export const CustomNodeSchema = SchemaFactory.createForClass(CustomNodeDoc);
CustomNodeSchema.index({ tenantId: 1, type: 1 }, { unique: true });

/** Immutable history; published workflows execute a pinned version from here. */
@Schema({ collection: 'custom_node_versions', minimize: false })
export class CustomNodeVersionDoc extends SpecProps {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) customNodeId: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) version: number;
  @Prop({ required: true }) createdAt: Date;
}
export const CustomNodeVersionSchema = SchemaFactory.createForClass(CustomNodeVersionDoc);
CustomNodeVersionSchema.index({ tenantId: 1, type: 1, version: 1 }, { unique: true });
CustomNodeVersionSchema.index({ customNodeId: 1, version: -1 });
