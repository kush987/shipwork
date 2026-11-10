import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, IsArray, ValidateIf } from 'class-validator';
import { PROVIDER_TYPES, TOKEN_TTL_MINUTES } from '../../app-auth/domain/app-auth.constants';
import type { AuthProviderType } from '../../app-auth/domain/app-auth.types';

export class AuthProviderDto {
  @IsString() @MaxLength(80) name: string;
  @IsIn(PROVIDER_TYPES) type: AuthProviderType;
  @IsOptional() @IsString() @MaxLength(300) issuer?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(300) audience?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) jwksUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(500) secret?: string;
  @IsOptional() @IsString() @MaxLength(100) rolesClaim?: string;
  @IsOptional() @IsInt() @Min(TOKEN_TTL_MINUTES.min) @Max(TOKEN_TTL_MINUTES.max) tokenTtlMinutes?: number;
}

export class VerifyTokenDto {
  @IsString() @MaxLength(8_000) token: string;
}

export class IssueTestTokenDto {
  @IsString() @MaxLength(200) sub: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
  @IsOptional() @IsObject() claims?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(TOKEN_TTL_MINUTES.min) @Max(TOKEN_TTL_MINUTES.max) expiresInMinutes?: number;
}
