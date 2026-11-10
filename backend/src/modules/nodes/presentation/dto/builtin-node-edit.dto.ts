import { IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EDIT_LIMITS } from '../../../builtin-node/domain/builtin-node-edit.constants';
import { MAX_STEP_LOGIC_LENGTH } from '../../domain/step-logic.constants';

class WorkspaceLogicDto {
  @IsOptional() @IsString() @MaxLength(MAX_STEP_LOGIC_LENGTH) before?: string;
  @IsOptional() @IsString() @MaxLength(MAX_STEP_LOGIC_LENGTH) after?: string;
}

/** What a built-in step should look like in this workspace now; blank text means the app's own. */
export class BuiltinNodeEditDto {
  @IsOptional() @IsString() @MaxLength(EDIT_LIMITS.label) label?: string;
  @IsOptional() @IsString() @MaxLength(EDIT_LIMITS.description) description?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  /** Setting key → default for newly added steps. Checked against the step's settings. */
  @IsOptional() @IsObject() defaults?: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => WorkspaceLogicDto) logic?: WorkspaceLogicDto;
}
