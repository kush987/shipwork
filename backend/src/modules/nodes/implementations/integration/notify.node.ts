import { Injectable } from '@nestjs/common';
import { renderTemplate } from '../../../../shared/util/path';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/** Notification channels are simulated; a real implementation would delegate to a NotificationProvider port. */
@Injectable()
export class NotifyNode implements WorkflowNode {
  readonly definition = {
    type: 'notify.send',
    category: 'integration' as const,
    label: 'Send notification',
    description: 'Sends a WhatsApp, SMS or email message using a template.',
    icon: 'message-square',
    configSchema: [
      {
        key: 'channel',
        label: 'Channel',
        kind: 'select' as const,
        required: true,
        default: 'whatsapp',
        options: [
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'sms', label: 'SMS' },
          { value: 'email', label: 'Email' },
        ],
      },
      { key: 'to', label: 'Recipient', kind: 'text' as const, default: '{{shipment.customer.phone}}', required: true },
      {
        key: 'message',
        label: 'Message',
        kind: 'text' as const,
        required: true,
        default: 'Hi {{shipment.customer.name}}, your order {{shipment.orderId}} is on its way via {{shipment.courier}} (AWB {{shipment.awb}}).',
        help: 'Supports {{shipment.*}} and {{context.*}} placeholders',
      },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const to = renderTemplate(String(ctx.config.to), ctx.data);
    const message = renderTemplate(String(ctx.config.message), ctx.data);
    ctx.logger.log(`[${ctx.config.channel}] → ${to}: ${message}`);
    return { outputHandle: 'default', output: { channel: ctx.config.channel, to, message, delivered: true } };
  }
}
