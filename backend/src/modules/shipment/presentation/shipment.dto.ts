import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsDefined, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { AddressDto } from '../../../shared/http/address.dto';
import { SHIPMENT_STATUSES } from '../domain/shipment.constants';
import { ShipmentInput, ShipmentStatus } from '../domain/shipment.types';

class CustomerDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @Matches(/^[0-9+\- ]{6,15}$/) phone: string;
}

class ShipmentItemDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsString() @MinLength(1) @MaxLength(64) sku: string;
  @IsInt() @Min(1) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
}

export class ShipmentInputDto implements Omit<ShipmentInput, 'items' | 'billingAddress' | 'rtoWarehouseId'> {
  @IsString() @MinLength(1) orderId: string;
  @IsIn(['COD', 'PREPAID']) paymentMode: 'COD' | 'PREPAID';
  @IsNumber() @Min(0) codAmount: number;
  @IsNumber() @Min(0) orderValue: number;
  @IsNumber() @Min(0.01) weightKg: number;
  @IsDefined() @ValidateNested() @Type(() => CustomerDto) customer: CustomerDto;
  @IsDefined() @ValidateNested() @Type(() => AddressDto) shippingAddress: AddressDto;
  /** Defaults to the shipping address. */
  @IsOptional() @ValidateNested() @Type(() => AddressDto) billingAddress?: AddressDto;
  @IsString() @MinLength(1) pickupWarehouseId: string;
  /** Defaults to the pickup warehouse. */
  @IsOptional() @IsString() @MinLength(1) rtoWarehouseId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShipmentItemDto)
  items?: ShipmentItemDto[];
}

/** Every field optional; the service decides which ones may change in the current status. */
export class UpdateShipmentDto extends PartialType(ShipmentInputDto) {}

/** Only what affects price and serviceability, so the create form can quote while it's half filled. */
export class QuoteDto {
  @IsString() @MinLength(1) pickupWarehouseId: string;
  @Matches(/^[1-9][0-9]{5}$/, { message: 'deliveryPincode must be a 6-digit Indian pincode' }) deliveryPincode: string;
  @IsIn(['COD', 'PREPAID']) paymentMode: 'COD' | 'PREPAID';
  @IsNumber() @Min(0) codAmount: number;
  @IsNumber() @Min(0) orderValue: number;
  @IsNumber() @Min(0.01) weightKg: number;
}

export class AssignCourierDto {
  @IsString() @MinLength(1) courier: string;
}

class DispatchDto {
  @IsIn(['auto', 'manual']) mode: 'auto' | 'manual';
  @IsOptional() @IsString() @MinLength(1) courier?: string;
}

export class CreateShipmentDto extends ShipmentInputDto {
  @IsOptional() @ValidateNested() @Type(() => DispatchDto) dispatch?: DispatchDto;
}

export class CancelShipmentDto {
  @IsString() @MinLength(3) @MaxLength(200) reason: string;
}

export class BulkTriggerDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) ids: string[];
  /** Assign this courier to every shipment before triggering it. */
  @IsOptional() @IsString() @MinLength(1) courier?: string;
}

export class BulkIdsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) ids: string[];
}

export class ShipmentStatusDto {
  @IsIn(SHIPMENT_STATUSES.filter((s) => s !== 'new')) status: ShipmentStatus;
}
