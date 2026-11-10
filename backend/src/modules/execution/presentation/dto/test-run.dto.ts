import { ValidateNested, IsInt, Min, IsOptional, IsIn, IsObject, IsArray, IsString } from 'class-validator';
import { TestRequestDto } from './test-request.dto';
import { ShipmentInputDto } from '../../../shipment/presentation/shipment.dto';
import { Type } from 'class-transformer';

/** The record change a record-triggered workflow is tested with. */
export class TestRecordChangeDto {
  @IsOptional() @IsIn(['created', 'updated', 'deleted']) operation?: 'created' | 'updated' | 'deleted';
  @IsOptional() @IsObject() record?: Record<string, unknown>;
  @IsOptional() @IsObject() previous?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsString({ each: true }) changedFields?: string[];
}

/** `payload` for event-triggered workflows, `request` for API-triggered ones, `change` for record-triggered ones, nothing for schedules. */
export class TestRunDto {
  @IsOptional() @ValidateNested() @Type(() => ShipmentInputDto) payload?: ShipmentInputDto;
  @IsOptional() @ValidateNested() @Type(() => TestRequestDto) request?: TestRequestDto;
  @IsOptional() @ValidateNested() @Type(() => TestRecordChangeDto) change?: TestRecordChangeDto;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
