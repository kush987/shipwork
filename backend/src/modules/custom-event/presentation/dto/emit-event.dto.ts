import { IsString, IsObject, IsOptional } from 'class-validator';

export class EmitEventDto {
  @IsString() event: string;
  @IsOptional() @IsString() shipmentId?: string;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}
