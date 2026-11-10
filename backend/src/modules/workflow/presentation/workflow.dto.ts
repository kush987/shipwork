import { Type } from 'class-transformer';
import { MAX_STEP_LOGIC_LENGTH } from '../../nodes/domain/step-logic.constants';
import {
  IsArray,
  IsDefined,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class PositionDto {
  @IsNumber() x: number;
  @IsNumber() y: number;
}

class StepLogicDto {
  @IsOptional() @IsString() @MaxLength(MAX_STEP_LOGIC_LENGTH) before?: string;
  @IsOptional() @IsString() @MaxLength(MAX_STEP_LOGIC_LENGTH) after?: string;
}

class NodeDto {
  @IsString() @MinLength(1) id: string;
  @IsString() type: string;
  @IsString() @MaxLength(120) name: string;
  @ValidateNested() @Type(() => PositionDto) position: PositionDto;
  @IsOptional() @IsObject() config: Record<string, unknown> = {};
  @IsOptional() @IsInt() @Min(1) typeVersion?: number;
  @IsOptional() @ValidateNested() @Type(() => StepLogicDto) logic?: StepLogicDto;
}

class EdgeDto {
  @IsString() id: string;
  @IsString() source: string;
  @IsString() sourceHandle: string;
  @IsString() target: string;
}

export class DefinitionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => NodeDto) nodes: NodeDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => EdgeDto) edges: EdgeDto[];
}

export class DefinitionBodyDto {
  @IsDefined({ message: 'definition is required: { "definition": { "nodes": […], "edges": […] } }' })
  @ValidateNested()
  @Type(() => DefinitionDto)
  definition: DefinitionDto;
}

export class CreateWorkflowDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() templateId?: string;
}
