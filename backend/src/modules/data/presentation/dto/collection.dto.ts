import { IsArray, IsString, ArrayMaxSize, MaxLength, ValidateNested, IsOptional } from 'class-validator';
import { FieldSpecDto } from '../../../../shared/schema/field-spec.dto';
import { Type } from 'class-transformer';
import { IndexSpecDto } from './index-spec.dto';
import { MAX_INDEXES_PER_COLLECTION } from '../../domain/data-collection.constants';

export class CollectionDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => FieldSpecDto) fields?: FieldSpecDto[];
  /** Replaces the custom indexes when given (unique fields and the built-in index come on top). */
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_INDEXES_PER_COLLECTION) @ValidateNested({ each: true }) @Type(() => IndexSpecDto) indexes?: IndexSpecDto[];
}
