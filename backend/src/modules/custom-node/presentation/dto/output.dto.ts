import { IsString, MaxLength } from 'class-validator';

export class OutputDto {
  @IsString() id: string;
  @IsString() @MaxLength(32) label: string;
}
