import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Platform database: where each workspace keeps its business data. */
@Schema({ collection: 'workspace_databases' })
export class WorkspaceDatabaseDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) mode: string;
  @Prop({ required: true }) databaseName: string;
  @Prop({ type: String, default: null }) encryptedUri: string | null;
  @Prop({ type: String, default: null }) hosts: string | null;
  @Prop({ type: Date, default: null }) connectedAt: Date | null;
  @Prop({ required: true }) updatedAt: Date;
}
export const WorkspaceDatabaseSchema = SchemaFactory.createForClass(WorkspaceDatabaseDoc);
