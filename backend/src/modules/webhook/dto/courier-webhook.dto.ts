import { ShipmentStatus } from '../../shipment/domain/shipment.types';
import { IsString, IsIn } from 'class-validator';
import { SHIPMENT_STATUSES } from '../../shipment/domain/shipment.constants';

export class CourierWebhookDto {
  @IsString() awb: string;
  @IsIn(SHIPMENT_STATUSES.filter((s) => s !== 'new')) status: ShipmentStatus;
}
