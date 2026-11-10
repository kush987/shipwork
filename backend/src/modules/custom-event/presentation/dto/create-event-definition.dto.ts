import { IsOptional, IsString, MaxLength } from 'class-validator';
import { EventDefinitionDto } from './event-definition.dto';

export class CreateEventDefinitionDto extends EventDefinitionDto {
  /** Optional; derived from the name when omitted. The event key becomes `custom.<slug>`. */
  @IsOptional() @IsString() @MaxLength(48) slug?: string;
}
