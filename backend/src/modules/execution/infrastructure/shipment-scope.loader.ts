import { Injectable } from '@nestjs/common';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { Execution } from '../domain/execution.types';
import { ExecutionScopeLoader } from '../domain/execution.ports';

/** Adapter that gives logistics runs their shipment; runs without one (API, schedule) get null. */
@Injectable()
export class ShipmentScopeLoader extends ExecutionScopeLoader {
  constructor(private readonly shipments: ShipmentService) {
    super();
  }

  async load(execution: Execution) {
    const shipment = execution.shipmentId ? await this.shipments.get(execution.tenantId, execution.shipmentId).catch(() => null) : null;
    return { shipment };
  }
}
