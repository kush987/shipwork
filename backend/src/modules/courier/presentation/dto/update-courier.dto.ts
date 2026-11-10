import { Max, IsBoolean, IsNumber, Min, IsOptional } from 'class-validator';

export class UpdateCourierDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(1) failureRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10_000) latencyMs?: number;
}
