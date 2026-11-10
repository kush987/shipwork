import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../domain/identity.constants';

export class SignupDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsEmail() @MaxLength(200) email: string;
  // Length rules live in the domain (passwordIssue) so the message is the same everywhere.
  @IsString() @MaxLength(MAX_PASSWORD_LENGTH) password: string;
  @IsString() @MinLength(1) @MaxLength(120) workspaceName: string;
}

export class LoginDto {
  @IsString() @MaxLength(200) email: string;
  @IsString() @MaxLength(MAX_PASSWORD_LENGTH) password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(MAX_PASSWORD_LENGTH) currentPassword: string;
  @IsString() @MaxLength(MAX_PASSWORD_LENGTH) newPassword: string;
}

export class AddMemberDto {
  @IsEmail() @MaxLength(200) email: string;
  /** owner, editor, viewer or a custom role id (role_…). */
  @IsString() @MaxLength(64) role: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

export class ChangeRoleDto {
  @IsString() @MaxLength(64) role: string;
}
