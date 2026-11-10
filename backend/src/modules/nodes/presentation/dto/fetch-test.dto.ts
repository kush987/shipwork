import { IsString, IsObject, IsOptional } from 'class-validator';

export class FetchTestDto {
  @IsObject() config: Record<string, unknown>;
  /** Shipment to fill placeholders from; defaults to the most recent one. */
  @IsOptional() @IsString() shipmentId?: string;
  @IsOptional() @IsObject() context?: Record<string, unknown>;
}
