import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { FieldSpecDto } from '../../../shared/schema/field-spec.dto';
import { AUTHORIZER_CACHE_SECONDS, ENDPOINT_AUTH, ENDPOINT_MODES, HTTP_METHODS, RATE_LIMIT_PER_MINUTE, TIMEOUT_MS } from '../domain/api-endpoint.constants';
import { EndpointAuth, EndpointMode, HttpMethod } from '../domain/api-endpoint.types';

export class EndpointDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsIn(HTTP_METHODS) method: HttpMethod;
  @IsString() @MinLength(1) @MaxLength(300) path: string;
  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsIn(ENDPOINT_MODES) mode?: EndpointMode;
  @IsOptional() @IsIn(ENDPOINT_AUTH) auth?: EndpointAuth;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => FieldSpecDto) requestSchema?: FieldSpecDto[];
  @IsOptional() @IsInt() @Min(TIMEOUT_MS.min) @Max(TIMEOUT_MS.max) timeoutMs?: number;
  /** Per-caller calls per minute for this endpoint; null removes the endpoint's own limit. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(RATE_LIMIT_PER_MINUTE.min) @Max(RATE_LIMIT_PER_MINUTE.max) rateLimitPerMinute?: number | null;
  /** auth = 'jwt': the sign-in provider (Settings → App sign-in). */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(64) authProviderId?: string | null;
  /** A published API workflow that allows or denies each call first. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(64) authorizerWorkflowId?: string | null;
  @IsOptional() @IsInt() @Min(AUTHORIZER_CACHE_SECONDS.min) @Max(AUTHORIZER_CACHE_SECONDS.max) authorizerCacheSeconds?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
