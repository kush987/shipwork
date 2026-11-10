import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateApiKeyDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  /** Endpoints this key may call; omit or null for every API-key endpoint. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) endpointIds?: string[] | null;
}

export class ApiKeyScopeDto {
  @ValidateIf((_, v) => v !== null) @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) endpointIds: string[] | null;
}
