import { IsString, MaxLength, MinLength } from 'class-validator';

export class OptionDto {
  @IsString() @MinLength(1) @MaxLength(60) value: string;
  @IsString() @MinLength(1) @MaxLength(60) label: string;
}
