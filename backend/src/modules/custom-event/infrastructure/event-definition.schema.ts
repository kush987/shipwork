import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { EventPayloadField } from '../domain/event-definition.types';

@Schema({ collection: 'event_definitions', minimize: false })
export class EventDefinitionDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) tenantId: string;
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ default: '' }) description: string;
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) payloadSchema: EventPayloadField[];
  @Prop({ default: false }) archived: boolean;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ required: true }) updatedAt: Date;
}
export const EventDefinitionSchema = SchemaFactory.createForClass(EventDefinitionDoc);
EventDefinitionSchema.index({ tenantId: 1, key: 1 }, { unique: true });
