import { WorkflowReferenceChecker } from './reference-checkers';
import { WorkflowCalls } from '../../nodes/domain/workflow-caller';
import type { WorkflowRepository } from '../domain/workflow.repository';

const stored: Record<string, { name: string; status: string; publishedVersion: number | null; triggerEvent: string | null }> = {
  'wf-api': { name: 'Price order', status: 'published', publishedVersion: 2, triggerEvent: 'http.request' },
  'wf-draft': { name: 'Draft', status: 'draft', publishedVersion: null, triggerEvent: 'http.request' },
  'wf-events': { name: 'Shipment flow', status: 'published', publishedVersion: 1, triggerEvent: 'shipment.created' },
  'wf-old': { name: 'Old', status: 'archived', publishedVersion: 4, triggerEvent: 'http.request' },
};
const repo = { findById: async (_: string, id: string) => (stored[id] ? { toJSON: () => stored[id] } : null) } as unknown as WorkflowRepository;

describe('Run workflow references', () => {
  const checker = new WorkflowReferenceChecker(repo);

  it('accept only published workflows that start with an API request', async () => {
    expect(await checker.check('t', 'wf-api')).toBeNull();
    expect(await checker.check('t', 'wf-missing')).toBe('workflow "wf-missing" doesn\'t exist');
    expect(await checker.check('t', 'wf-draft')).toBe('workflow “Draft” isn\'t published yet — publish it first');
    expect(await checker.check('t', 'wf-events')).toBe('workflow “Shipment flow” doesn\'t start with an API request, so it can\'t be run from another workflow');
    expect(await checker.check('t', 'wf-old')).toBe('workflow “Old” is archived');
  });

  it('say so when this process can’t run workflows', () => {
    expect(() => new WorkflowCalls().get()).toThrow('Running other workflows is not available in this process');
  });
});
