import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import type { DatabaseMode } from '../domain/workspace-db.types';

export class TestDatabaseDto {
  @IsString() @MaxLength(2_000) uri: string;
}

export class SwitchDatabaseDto {
  @IsIn(['managed', 'external']) mode: DatabaseMode;
  @ValidateIf((dto: SwitchDatabaseDto) => dto.mode === 'external') @IsString() @MaxLength(2_000) uri?: string;
  @IsOptional() @IsBoolean() copyData?: boolean;
}
