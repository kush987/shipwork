import { IsArray, IsString, MaxLength, MinLength, ValidateNested, Matches, IsOptional, IsIn, IsBoolean, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { OutputDto } from './output.dto';
import { ConfigFieldDto } from './config-field.dto';
import { FieldSpecDto } from '../../../../shared/schema/field-spec.dto';
import { API_VERSIONS, MAX_RESULT_FIELDS } from '../../domain/custom-node.constants';
import type { CustomNodeApiVersion } from '../../domain/custom-node.types';

export class CustomNodeSpecDto {
  @IsString() @MinLength(2) @MaxLength(60) label: string;
  @IsString() @MaxLength(300) description: string;
  @Matches(/^[a-z0-9-]{1,40}$/) icon: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ConfigFieldDto) configSchema: ConfigFieldDto[];
  /** Branches. */
  @IsArray() @ValidateNested({ each: true }) @Type(() => OutputDto) outputs: OutputDto[];
  @IsString() code: string;
  /** 1 (or absent) = classic return format, 2 = simple format. */
  @IsOptional() @IsIn(API_VERSIONS) apiVersion?: CustomNodeApiVersion;
  @IsOptional() @IsString() @MaxLength(40) resultName?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_RESULT_FIELDS) @ValidateNested({ each: true }) @Type(() => FieldSpecDto) resultSchema?: FieldSpecDto[];
  @IsOptional() @IsBoolean() errorBranch?: boolean;
}
