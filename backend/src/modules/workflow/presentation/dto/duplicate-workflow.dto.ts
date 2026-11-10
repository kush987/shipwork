import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class DuplicateWorkflowDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
