import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Address } from '../domain/address.types';
import { PINCODE_PATTERN } from '../domain/address.constants';

export class AddressDto implements Address {
  @IsString() @MinLength(3) @MaxLength(200) line1: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsOptional() @IsString() @MaxLength(120) landmark?: string;
  @IsString() @MinLength(2) @MaxLength(80) city: string;
  @IsString() @MinLength(2) @MaxLength(80) state: string;
  @Matches(PINCODE_PATTERN, { message: 'pincode must be a 6-digit Indian pincode' }) pincode: string;
}
