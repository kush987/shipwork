import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { INDEX_ORDERS, MAX_INDEX_KEYS } from '../../domain/data-collection.constants';
import type { IndexOrder } from '../../domain/data-collection.types';

export class IndexKeyDto {
  @IsString() @MaxLength(200) field: string;
  @IsIn(INDEX_ORDERS as unknown as unknown[], { message: 'order must be 1, -1 or "text"' }) order: IndexOrder;
}

export class IndexSpecDto {
  @IsString() @MaxLength(48) name: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_INDEX_KEYS) @ValidateNested({ each: true }) @Type(() => IndexKeyDto) keys: IndexKeyDto[];
  @IsOptional() @IsBoolean() unique?: boolean;
  @IsOptional() @IsBoolean() sparse?: boolean;
  @IsOptional() @IsObject() partialFilter?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(0) expireAfterSeconds?: number;
}
