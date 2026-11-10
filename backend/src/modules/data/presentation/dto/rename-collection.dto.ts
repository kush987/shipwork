import { IsString, MaxLength } from 'class-validator';

export class RenameCollectionDto {
  /** The new name; workflows that use the old one must be changed to it. */
  @IsString() @MaxLength(48) name: string;
}
