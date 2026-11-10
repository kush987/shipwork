import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

/** Ledger of outbound side-effecting courier calls, keyed by idempotency key. */
@Schema({ collection: 'courier_requests', timestamps: true })
export class CourierRequestDoc {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true, index: true }) tenantId: string;
  @Prop({ required: true }) courierCode: string;
  @Prop({ required: true }) operation: string;
  @Prop({ required: true, enum: ['pending', 'succeeded', 'failed'] }) status: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) response: unknown;
  @Prop({ type: String, default: null }) lastError: string | null;
  @Prop({ default: 0 }) attempts: number;
}

export type CourierRequestDocument = HydratedDocument<CourierRequestDoc>;
export const CourierRequestSchema = SchemaFactory.createForClass(CourierRequestDoc);
