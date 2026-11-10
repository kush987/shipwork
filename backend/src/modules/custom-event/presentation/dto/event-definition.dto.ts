import { IsArray, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PayloadFieldDto } from './payload-field.dto';
import { Type } from 'class-transformer';

export class EventDefinitionDto {
  @IsString() @MinLength(2) @MaxLength(60) label: string;
  @IsString() @MaxLength(300) description: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PayloadFieldDto) payloadSchema: PayloadFieldDto[];
}
