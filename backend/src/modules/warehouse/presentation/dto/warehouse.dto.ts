import { IsString, MaxLength, MinLength, IsDefined, ValidateNested, IsBoolean, Matches, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto } from '../../../../shared/http/address.dto';

export class WarehouseDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsString() @MinLength(1) @MaxLength(80) contactName: string;
  @IsString() @Matches(/^[0-9+\- ]{6,15}$/) phone: string;
  @IsDefined() @ValidateNested() @Type(() => AddressDto) address: AddressDto;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
