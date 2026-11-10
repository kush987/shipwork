import { isPlainObject } from '../../../shared/util/json-setting';
import { validateFields } from '../../../shared/schema/field-schema';
import { MAX_EMITS_PER_RUN } from '../domain/custom-node.constants';
import { isSimpleFormat } from '../domain/custom-node';
import type { CustomNodeBranch, CustomNodeEmit } from '../domain/custom-node.types';
import type { RunnableSpec } from './result-format.types';

const quoted = (branches: CustomNodeBranch[]) => branches.map((b) => `'${b.id}'`).join(', ');

/** Null when `handle` is one of the node's branches, else a message naming the valid ones. */
export function unknownBranch(handle: string | undefined, branches: CustomNodeBranch[], asCode: (id: string) => string): string | null {
  if (handle !== undefined && branches.some((b) => b.id === handle)) return null;
  return `${asCode(String(handle))} is not a branch of this node — use one of ${quoted(branches)}`;
}

/** Accepts `{ event, payload }` or a list of them; returns an error message when malformed. */
export function normaliseEmit(raw: unknown): CustomNodeEmit[] | string {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length > MAX_EMITS_PER_RUN) return `run() can emit at most ${MAX_EMITS_PER_RUN} events at once`;
  const out: CustomNodeEmit[] = [];
  for (const item of list) {
    if (!isPlainObject(item) || typeof item.event !== 'string' || !item.event) return 'Each emit needs an event, e.g. emit(config.alertEvent, { … })';
    if (!item.event.startsWith('custom.')) return `Only custom events can be emitted — "${item.event}" is built-in`;
    if (item.payload !== undefined && !isPlainObject(item.payload)) return `The payload for "${item.event}" must be an object`;
    out.push({ event: item.event, payload: (item.payload as Record<string, unknown>) ?? {} });
  }
  return out;
}

const describe = (value: unknown) => (value === null ? 'null' : Array.isArray(value) ? 'a list' : `a ${typeof value}`);

/**
 * Where a simple-format result doesn't match the fields the node says it returns. Warnings, not
 * errors: the run still succeeds, but the author (and the timeline) learn about the mismatch.
 */
export function resultWarnings(spec: RunnableSpec, output: unknown): string[] {
  const fields = isSimpleFormat(spec) ? (spec.resultSchema ?? []) : [];
  if (!fields.length) return [];
  if (!isPlainObject(output)) return [`run() returned ${describe(output)}, but result fields are described — return an object`];
  return validateFields(fields, output).issues.map((issue) => `Result: ${issue.message}`);
}
