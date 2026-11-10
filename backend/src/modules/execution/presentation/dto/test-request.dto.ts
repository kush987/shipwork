import { IsString, MaxLength, IsIn, IsObject, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Who the test run pretends the caller is (`request.auth`). */
export class TestCallerDto {
  @IsIn(['api_key', 'jwt']) type: 'api_key' | 'jwt';
  @IsString() @MaxLength(200) id: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
  @IsOptional() @IsObject() claims?: Record<string, unknown>;
  @IsOptional() @IsObject() context?: Record<string, unknown>;
}

export class TestRequestDto {
  @IsOptional() @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) method?: string;
  @IsOptional() @IsString() @MaxLength(300) path?: string;
  @IsOptional() @IsObject() params?: Record<string, string>;
  @IsOptional() @IsObject() query?: Record<string, unknown>;
  @IsOptional() @IsObject() headers?: Record<string, string>;
  @IsOptional() body?: unknown;
  @IsOptional() @ValidateNested() @Type(() => TestCallerDto) auth?: TestCallerDto | null;
}
