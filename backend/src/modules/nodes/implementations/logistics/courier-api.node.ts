import { Injectable } from '@nestjs/common';
import { CourierGateway } from '../../../courier/application/courier-gateway';
import { CourierRegistry } from '../../../courier/application/courier-registry';
import { CourierRejectedError } from '../../../courier/domain/courier-provider';
import { NonRetryableError, RetryableError } from '../../../../shared/domain/errors';
import { renderTemplate, renderTyped } from '../../../../shared/util/path';
import { jsonSettingErrors, parseJsonValue } from '../../../../shared/util/json-setting';
import { saveAsErrors, saveAsField, saveAsKey } from '../../domain/node-config';
import { TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { FAILED_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';
import { CONNECTION_LABELS, COURIER_OPERATIONS, CourierOperation, OPERATION_LABELS, PARCEL_OPERATIONS, SAMPLE_PARCEL } from './courier-api.constants';
import { COURIER_CONNECTIONS } from '../../../courier/domain/courier-integration.constants';
import type { CourierConnection } from '../../../courier/domain/courier-integration.types';
import { IntegratedCourierProvider } from '../../../courier/application/integrated-courier.provider';

const isTemplate = (value: unknown) => typeof value === 'string' && value.includes('{{');
import { readParcel } from './courier-api.parcel';

/**
 * One call to a courier — through its real API when it is set up on the Couriers page (sandbox or live),
 * else its simulation — with the gateway's timeouts, circuit breaker and exactly-once booking. Works on
 * any data: the parcel is built from the step's JSON, so on-platform backends can book real AWBs.
 */
@Injectable()
export class CourierApiNode implements WorkflowNode {
  constructor(
    private readonly gateway: CourierGateway,
    private readonly registry: CourierRegistry,
  ) {}

  get definition() {
    const parcelOps = { key: 'operation', values: [...PARCEL_OPERATIONS] };
    const awbOps = { key: 'operation', values: ['cancel', 'track'] };
    return {
      type: 'courier.api',
      category: 'courier' as const,
      label: 'Courier API',
      description: 'Checks serviceability, prices, books (AWB + label), cancels or tracks with one courier — its real API once set up on the Couriers page.',
      icon: 'truck',
      configSchema: [
        {
          key: 'courier',
          label: 'Courier',
          kind: 'text' as const,
          required: true,
          options: this.registry.all().map((c) => ({ value: c.provider.code, label: c.provider.name })),
          placeholder: 'delhivery or {{context.quote.courier}}',
          help: `A courier code (${this.registry.all().map((c) => c.provider.code).join(', ')}) or a {{template}} that gives one`,
        },
        {
          key: 'connection',
          label: 'Connection',
          kind: 'text' as const,
          default: 'default',
          options: COURIER_CONNECTIONS.map((value) => ({ value, label: CONNECTION_LABELS[value] })),
          help: `default (as set on the Couriers page), simulated, sandbox or live — or a {{template}} giving one (e.g. the connection a shipment was booked with). Sandbox and Live use the accounts a platform admin set up on the Couriers page`,
        },
        {
          key: 'operation',
          label: 'Operation',
          kind: 'select' as const,
          required: true,
          default: 'rates',
          options: COURIER_OPERATIONS.map((value) => ({ value, label: OPERATION_LABELS[value] })),
        },
        {
          key: 'parcel',
          label: 'Parcel',
          kind: 'json' as const,
          default: SAMPLE_PARCEL,
          visibleWhen: parcelOps,
          help: `paymentMode (COD/PREPAID), codAmount, orderValue, weightKg, pickupPincode, deliveryPincode, customer {name, phone}; to book also deliveryAddress and pickupAddress {line1, city, state, pincode}, pickupContact, items, dimensions. ${TYPED_JSON_HELP}`,
        },
        {
          key: 'reference',
          label: 'Booking reference',
          kind: 'text' as const,
          placeholder: '{{context.shipment.id}}',
          visibleWhen: { key: 'operation', values: ['book'] },
          help: 'Booked at most once per reference and courier (any run asking again gets the same AWB). Empty: once per run of this step',
        },
        { key: 'awb', label: 'AWB', kind: 'text' as const, placeholder: '{{context.shipment.awb}}', visibleWhen: awbOps },
        saveAsField('courier', 'Next steps read context.<name> (book: .awb, .labelUrl; rates: .total; track: .status, .events)'),
      ],
      outputs: [{ id: 'ok', label: 'OK' }, { id: 'rejected', label: 'Courier said no' }, FAILED_OUTPUT],
    };
  }

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = [...saveAsErrors(config), ...jsonSettingErrors(config, [{ key: 'parcel', label: 'Parcel', shape: 'any' }])];
    if (!config.courier) errors.push('Choose the courier');
    else if (!isTemplate(config.courier) && !this.registry.has(String(config.courier))) errors.push(`Unknown courier ${config.courier}`);
    if (config.connection !== undefined && config.connection !== '' && !isTemplate(config.connection) && !(COURIER_CONNECTIONS as readonly unknown[]).includes(config.connection)) {
      errors.push(`Connection must be one of ${COURIER_CONNECTIONS.join(', ')}`);
    }
    const op = config.operation ?? 'rates';
    if (!(COURIER_OPERATIONS as readonly unknown[]).includes(op)) errors.push(`Operation must be one of ${COURIER_OPERATIONS.join(', ')}`);
    if ((op === 'cancel' || op === 'track') && !String(config.awb ?? '').trim()) errors.push('Give the AWB to cancel or track');
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const courier = renderTemplate(String(ctx.config.courier ?? ''), ctx.data).trim().toLowerCase();
    const operation = String(ctx.config.operation ?? 'rates') as CourierOperation;
    // Empty (e.g. a template with nothing behind it) means the Couriers page's choice.
    const connection = (renderTemplate(String(ctx.config.connection ?? ''), ctx.data).trim().toLowerCase() || 'default') as CourierConnection;
    const saveAs = saveAsKey(ctx.config, 'courier');
    const base = { courier, operation, connection, via: this.via(courier, connection) };
    try {
      const result = await this.run(ctx, courier, operation, connection);
      return { outputHandle: 'ok', output: { ...base, ...result }, contextPatch: { [saveAs]: { ...base, ...result } } };
    } catch (error) {
      if (!(error instanceof CourierRejectedError)) {
        // Unreachable courier, timeout, open circuit: worth trying again later.
        if (error instanceof NonRetryableError) throw error;
        throw new RetryableError((error as Error).message);
      }
      // The courier said no — or the chosen account isn't set up: a path the workflow handles.
      const saved = { ...base, rejected: true, reason: error.message };
      return { outputHandle: 'rejected', output: saved, contextPatch: { [saveAs]: saved } };
    }
  }

  /** The connection a call really uses: the chosen one, or the courier's mode on the Couriers page. */
  private via(courier: string, connection: CourierConnection): string | null {
    if (connection !== 'default') return connection;
    if (!this.registry.has(courier)) return null;
    const provider = this.registry.get(courier).provider;
    return provider instanceof IntegratedCourierProvider ? provider.mode : 'simulated';
  }

  private async run(ctx: NodeExecutionContext, courier: string, operation: CourierOperation, connection: CourierConnection): Promise<Record<string, unknown>> {
    if (!courier) throw new NonRetryableError('The courier is empty');
    if (!this.registry.has(courier)) throw new NonRetryableError(`Unknown courier ${courier}`);
    if (!(COURIER_CONNECTIONS as readonly string[]).includes(connection)) throw new NonRetryableError(`Unknown connection ${connection}`);
    if (operation === 'cancel' || operation === 'track') {
      const awb = renderTemplate(String(ctx.config.awb ?? ''), ctx.data).trim();
      if (!awb) throw new NonRetryableError('The AWB is empty');
      if (operation === 'cancel') return { awb, ...(await this.gateway.cancelShipment(courier, awb, connection)) };
      const events = await this.gateway.trackShipment(courier, awb, connection);
      return { awb, status: events.at(-1)?.status ?? null, lastScanAt: events.at(-1)?.at ?? null, events };
    }

    const { parcel, issues } = readParcel(renderTyped(parseJsonValue(ctx.config.parcel ?? SAMPLE_PARCEL, 'Parcel'), ctx.data), operation === 'book');
    if (!parcel) throw new NonRetryableError(`The parcel isn't complete: ${issues.join('; ')}`);

    if (operation === 'serviceability') {
      const [report] = await this.gateway.checkServiceability(parcel, [courier], connection);
      if (!report) throw new NonRetryableError(`${courier} is disabled on the Couriers page`);
      return { serviceable: report.serviceable, reason: report.reason ?? null };
    }
    if (operation === 'rates') {
      const { quotes, skipped } = await this.gateway.getRates(parcel, [courier], connection);
      if (quotes[0]) return { ...quotes[0] };
      throw new CourierRejectedError(courier, skipped[0] ?? `${courier} is disabled on the Couriers page`);
    }
    // Booking is exactly once per reference (else per run and step): asking again gets the same AWB, never a second booking.
    const reference = renderTemplate(String(ctx.config.reference ?? ''), ctx.data).trim();
    const booking = await this.gateway.createShipment(ctx.tenantId, courier, parcel, reference ? `ref:${reference}` : ctx.idempotencyKey, connection);
    return { ...booking };
  }
}
