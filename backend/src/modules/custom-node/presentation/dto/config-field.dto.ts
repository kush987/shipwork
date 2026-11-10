import { IsArray, IsString, ArrayMaxSize, MaxLength, ValidateNested, IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { OptionDto } from './option.dto';
import { SETTING_KINDS, SETTING_OPTION_SOURCES } from '../../domain/custom-node.constants';

export class ConfigFieldDto {
  @IsString() key: string;
  @IsString() @MaxLength(60) label: string;
  @IsIn(SETTING_KINDS) kind: (typeof SETTING_KINDS)[number];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  /** Load options at runtime instead of listing them: every event, or only custom events. */
  @IsOptional() @IsIn(SETTING_OPTION_SOURCES) optionsSource?: (typeof SETTING_OPTION_SOURCES)[number];
  @IsOptional() default?: unknown;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(120) placeholder?: string;
  @IsOptional() @IsString() @MaxLength(200) help?: string;
}
