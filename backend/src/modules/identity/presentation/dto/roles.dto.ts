import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_ROLE_DESCRIPTION_LENGTH, MAX_ROLE_NAME_LENGTH } from '../../domain/access.constants';

export class RoleDto {
  @IsOptional() @IsString() @MaxLength(MAX_ROLE_NAME_LENGTH) name?: string;
  @IsOptional() @IsString() @MaxLength(MAX_ROLE_DESCRIPTION_LENGTH) description?: string;
  /** { statements: [{ effect, actions, resources, description? }] } — checked in the domain for clear messages. */
  @IsOptional() @IsObject() policy?: Record<string, unknown>;
}

export class SimulateDto {
  @IsString() @MaxLength(80) action: string;
  @IsOptional() @IsString() @MaxLength(300) resource?: string;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsOptional() @IsString() @MaxLength(64) roleId?: string;
}
