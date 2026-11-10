import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { FIELD_TYPES } from './field-schema.constants';
import { FieldType } from './field-schema.types';

/** HTTP shape of a FieldSpec, shared by endpoint request schemas and data collections. */
export class FieldSpecDto {
  @IsString() @MaxLength(64) key: string;
  @IsIn(FIELD_TYPES) type: FieldType;
  @IsBoolean() required: boolean;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  /** Collections only. */
  @IsOptional() @IsBoolean() unique?: boolean;
}
