import { Injectable } from '@nestjs/common';
import { CourierGateway } from '../../courier/application/courier-gateway';
import { CourierRegistry } from '../../courier/application/courier-registry';
import { CircuitOpenError } from '../../courier/domain/circuit-breaker';
import { CourierRejectedError, CourierUnavailableError } from '../../courier/domain/courier-provider';
import { InvalidOperationError, UpstreamError } from '../../../shared/domain/errors';
import { retry } from '../../../shared/util/retry';
import { ShipmentService } from './shipment.service';
import { CANCELLABLE } from '../domain/shipment.constants';
import { Shipment } from '../domain/shipment.types';

/**
 * The single cancellation path, used by the UI/API and by the "Cancel shipment" workflow node.
 * Cancels the courier booking first; only if that succeeds (or there was none) is the shipment
 * marked cancelled and `shipment.cancelled` emitted for workflows to react to.
 */
@Injectable()
export class ShipmentCancellationService {
  constructor(
    private readonly shipments: ShipmentService,
    private readonly gateway: CourierGateway,
    private readonly registry: CourierRegistry,
  ) {}

  async cancel(tenantId: string, id: string, reason: string, source: string): Promise<Shipment> {
    const shipment = await this.shipments.get(tenantId, id);
    if (shipment.status === 'cancelled') throw new InvalidOperationError('Shipment is already cancelled');
    if (!CANCELLABLE.includes(shipment.status)) {
      throw new InvalidOperationError(
        `Shipment is ${shipment.status.replace(/_/g, ' ')} — the courier already has the parcel, so it can't be cancelled. Initiate an RTO instead.`,
      );
    }

    let courierCancelled = false;
    if (shipment.courier && shipment.awb) {
      const courierName = this.registry.has(shipment.courier) ? this.registry.get(shipment.courier).provider.name : shipment.courier;
      try {
        const result = await retry(
          () => this.gateway.cancelShipment(shipment.courier!, shipment.awb!),
          (e) => e instanceof CourierUnavailableError,
        );
        courierCancelled = result.cancelled;
      } catch (error) {
        if (error instanceof CourierRejectedError) {
          throw new InvalidOperationError(`${courierName} refused to cancel ${shipment.awb}: ${error.message}`);
        }
        if (error instanceof CircuitOpenError || error instanceof CourierUnavailableError) {
          throw new UpstreamError(`${courierName} is unavailable, so booking ${shipment.awb} could not be cancelled. Nothing was changed — try again shortly.`);
        }
        throw error;
      }
    }

    return this.shipments.markCancelled(tenantId, id, { reason, source, expectedAwb: shipment.awb, courierCancelled });
  }
}
