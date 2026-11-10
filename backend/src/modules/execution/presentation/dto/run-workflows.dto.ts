import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class RunWorkflowsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true }) workflowIds: string[];
}
