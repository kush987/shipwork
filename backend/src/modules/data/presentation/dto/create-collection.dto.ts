import { IsString, MaxLength } from 'class-validator';
import { CollectionDto } from './collection.dto';

export class CreateCollectionDto extends CollectionDto {
  @IsString() @MaxLength(48) name: string;
}
