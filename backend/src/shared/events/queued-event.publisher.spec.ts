import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { QueuedEventPublisher } from './queued-event.publisher';
import { domainEvent } from './domain-event.factory';
import type { DomainEvent } from './domain-events.types';

describe('QueuedEventPublisher', () => {
  const setup = () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const emitter = new EventEmitter2({ wildcard: true, delimiter: '.' });
    const local: string[] = [];
    emitter.on('**', (e: DomainEvent) => local.push(e.name));
    return { add, local, publisher: new QueuedEventPublisher(emitter, { add } as unknown as Queue<DomainEvent>) };
  };

  it('queues events that can start workflows, keyed by event id, and still notifies local listeners', async () => {
    const { add, local, publisher } = setup();
    const event = domainEvent('shipment.created', 't', { shipment: { id: 'shp_1' } });
    await publisher.publish(event);
    expect(add).toHaveBeenCalledWith('shipment.created', event, expect.objectContaining({ jobId: event.id, attempts: 5 }));
    expect(local).toEqual(['shipment.created']);
    await publisher.publish(domainEvent('custom.vip_order', 't', { shipment: { id: 'shp_1' } }));
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('keeps internal notifications in-process only', async () => {
    const { add, local, publisher } = setup();
    await publisher.publish(domainEvent('workflow.published', 't', {}));
    await publisher.publish(domainEvent('endpoints.changed', 't', {}));
    expect(add).not.toHaveBeenCalled();
    expect(local).toEqual(['workflow.published', 'endpoints.changed']);
  });

  it('fails the publish when the queue is unreachable, so the caller knows the event was not stored', async () => {
    const { add, publisher } = setup();
    add.mockRejectedValueOnce(new Error('redis down'));
    await expect(publisher.publish(domainEvent('shipment.created', 't', {}))).rejects.toThrow('redis down');
  });
});
