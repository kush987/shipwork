import { triggerWants } from './record-trigger.matching';
import { RecordTriggerService } from './record-trigger.service';
import type { RecordChangeEvent } from '../../data/domain/record-change-feed.ports';

const change = (overrides: Partial<RecordChangeEvent> = {}): RecordChangeEvent => ({
  id: 'chg1',
  collection: 'orders',
  operation: 'updated',
  recordId: 'rec_1',
  record: { id: 'rec_1', status: 'paid', total: 900, createdAt: 'x', updatedAt: 'x' },
  previous: { id: 'rec_1', status: 'new', total: 900, createdAt: 'x', updatedAt: 'x' },
  changedFields: ['status'],
  at: '2026-11-09T10:00:00.000Z',
  resumeToken: { _data: 'abc' },
  ...overrides,
});

describe('which changes a Record changed trigger wants', () => {
  it('its operations (all three when none are chosen)', () => {
    expect(triggerWants({}, change())).toBe(true);
    expect(triggerWants({ operations: ['created'] }, change())).toBe(false);
    expect(triggerWants({ operations: ['created', 'updated'] }, change())).toBe(true);
  });

  it('for updates, only when one of its fields changed (nested paths count)', () => {
    expect(triggerWants({ fields: 'status' }, change())).toBe(true);
    expect(triggerWants({ fields: 'total, note' }, change())).toBe(false);
    expect(triggerWants({ fields: 'address' }, change({ changedFields: ['address.city'] }))).toBe(true);
    // Fields only narrow updates: a creation still counts.
    expect(triggerWants({ fields: 'total' }, change({ operation: 'created', changedFields: null }))).toBe(true);
  });

  it('the record must match its filter — the record before the change, for a delete', () => {
    expect(triggerWants({ filter: { status: 'paid' } }, change())).toBe(true);
    expect(triggerWants({ filter: '{"status": "cancelled"}' }, change())).toBe(false);
    expect(triggerWants({ filter: { status: 'new' } }, change({ operation: 'deleted', record: null }))).toBe(true);
    expect(triggerWants({ filter: { status: 'new' } }, change({ operation: 'deleted', record: null, previous: null }))).toBe(false);
  });
});

describe('starting workflows for a change', () => {
  const definition = (config: Record<string, unknown>) => ({ nodes: [{ id: 'trigger', type: 'trigger.record', name: 'x', position: { x: 0, y: 0 }, config }], edges: [] });
  const workflow = (id: string) => ({ id, toJSON: () => ({ name: id, publishedVersion: 1 }) });

  it('starts each matching workflow once (same change → same execution id), then saves where to resume', async () => {
    const started: { id: string; trigger: { event: string; data: { record: unknown } } }[] = [];
    const redis = new Map<string, string>();
    const service = new RecordTriggerService(
      {
        findPublishedByTrigger: async () => [workflow('wf-paid'), workflow('wf-cancelled')],
        getVersion: async (_t: string, id: string) => ({ version: 1, definition: definition(id === 'wf-paid' ? { filter: { status: 'paid' } } : { filter: { status: 'cancelled' } }) }),
      } as never,
      { triggerOf: (d: ReturnType<typeof definition>) => ({ node: d.nodes[0], kind: 'record' }) } as never,
      { start: async (input: (typeof started)[number]) => started.push(input) } as never,
      {} as never,
      {
        incr: async () => 1,
        expire: async () => 1,
        set: async (k: string, v: string) => redis.set(k, v),
      } as never,
    );
    await service.handle('t', change());
    await service.handle('t', change());
    expect(started.map((s) => s.trigger.event)).toEqual(['record.updated', 'record.updated']);
    expect(started[0].id).toBe(started[1].id);
    expect(started[0].trigger.data.record).toMatchObject({ status: 'paid' });
    expect(JSON.parse(redis.get('shipflow:record-feed:t:resume')!)).toEqual({ _data: 'abc' });
  });
});
