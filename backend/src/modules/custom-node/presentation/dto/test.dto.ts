import { IsArray, IsString, IsDefined, ValidateNested, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { TestInputDto } from './test-input.dto';
import { OutputDto } from './output.dto';
import { FieldSpecDto } from '../../../../shared/schema/field-spec.dto';
import { API_VERSIONS } from '../../domain/custom-node.constants';
import type { CustomNodeApiVersion } from '../../domain/custom-node.types';

/** Runs unsaved code: the parts of a spec that affect a run, plus sample input. */
export class TestDto {
  @IsString() code: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OutputDto) outputs: OutputDto[];
  @IsOptional() @IsIn(API_VERSIONS) apiVersion?: CustomNodeApiVersion;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FieldSpecDto) resultSchema?: FieldSpecDto[];
  @IsDefined() @ValidateNested() @Type(() => TestInputDto) input: TestInputDto;
}
