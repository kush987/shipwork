import { IsBoolean, IsString, MaxLength, IsIn, IsOptional } from 'class-validator';

export class PayloadFieldDto {
  @IsString() key: string;
  @IsString() @MaxLength(60) label: string;
  @IsIn(['text', 'number', 'boolean']) kind: 'text' | 'number' | 'boolean';
  @IsOptional() @IsBoolean() required?: boolean;
}
