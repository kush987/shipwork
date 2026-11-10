import { Injectable } from '@nestjs/common';
import { CourierGateway, isUnknownOutcome } from '../../../courier/application/courier-gateway';
import { CourierRegistry } from '../../../courier/application/courier-registry';
import { ShipmentService } from '../../../shipment/application/shipment.service';
import { CircuitOpenError } from '../../../courier/domain/circuit-breaker';
import { CourierRejectedError, CourierUnavailableError } from '../../../courier/domain/courier-provider';
import { NonRetryableError, RetryableError } from '../../../../shared/domain/errors';
import { requireShipment, toParcel, courierCandidates } from './logistics-helpers';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

@Injectable()
export class ShipmentCreateNode implements WorkflowNode {
  constructor(
    private readonly gateway: CourierGateway,
    private readonly registry: CourierRegistry,
    private readonly shipments: ShipmentService,
  ) {}

  get definition() {
    return {
      type: 'shipment.create',
      category: 'shipment' as const,
      label: 'Create shipment',
      description: 'Books the shipment with the selected courier and assigns the AWB.',
      icon: 'package-plus',
      configSchema: [
        {
          key: 'courier',
          label: 'Courier override',
          kind: 'select' as const,
          options: this.registry.all().map((c) => ({ value: c.provider.code, label: c.provider.name })),
          help: 'Defaults to the courier chosen by "Select courier"',
        },
        {
          key: 'fallback',
          label: 'Fall back to next-ranked courier',
          kind: 'boolean' as const,
          default: true,
          help: 'When a courier rejects the booking or its circuit is open',
        },
      ],
      outputs: [
        { id: 'success', label: 'Booked' },
        { id: 'failed', label: 'Failed' },
      ],
    };
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const shipment = requireShipment(ctx);
    if (shipment.awb) {
      // Booked already (a manual courier, or an earlier step). Never book twice — continue as booked.
      return {
        outputHandle: 'success',
        output: { alreadyBooked: true, courierCode: shipment.courier, awb: shipment.awb, labelUrl: shipment.labelUrl },
        contextPatch: { booking: { courier: shipment.courier, awb: shipment.awb } },
      };
    }

    const candidates = courierCandidates(ctx);
    if (!candidates.length) throw new NonRetryableError('No courier selected — add "Select courier" or set an override');

    const attempts: { courier: string; error: string }[] = [];
    for (const courierCode of candidates) {
      try {
        const booking = await this.gateway.createShipment(ctx.tenantId, courierCode, toParcel(shipment), ctx.idempotencyKey);
        await this.shipments.assignCourier(
          ctx.tenantId,
          shipment.id,
          { courier: booking.courierCode, awb: booking.awb, labelUrl: booking.labelUrl },
          `workflow:${ctx.executionId}`,
        );
        return {
          outputHandle: 'success',
          output: { ...booking, fallbackAttempts: attempts },
          contextPatch: { booking: { courier: booking.courierCode, awb: booking.awb } },
        };
      } catch (error) {
        const message = (error as Error).message;
        attempts.push({ courier: courierCode, error: message });
        const definitelyNotBooked = error instanceof CircuitOpenError || error instanceof CourierRejectedError;
        // Once retries are used up, a courier that is plainly down (not merely slow) is skipped too.
        const exhausted = ctx.isFinalAttempt && error instanceof CourierUnavailableError && !isUnknownOutcome(error);
        if (definitelyNotBooked || exhausted) {
          ctx.logger.warn(`Booking with ${courierCode} not possible (${message}); trying next candidate`);
          continue;
        }
        // Transient or unknown outcome: retry this same courier so idempotency can reconcile it.
        if (error instanceof CourierUnavailableError) throw new RetryableError(message);
        throw error;
      }
    }
    throw new NonRetryableError(`All couriers failed: ${attempts.map((a) => `${a.courier} (${a.error})`).join(', ')}`);
  }

}
