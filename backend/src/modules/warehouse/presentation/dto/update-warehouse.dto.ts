import { WarehouseDto } from './warehouse.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateWarehouseDto extends PartialType(WarehouseDto) {}
