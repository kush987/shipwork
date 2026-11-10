import { isPlainObject } from '../../../shared/util/json-setting';
import { physicalName } from './data-collection';
import { ALLOWED_STAGES, FORBIDDEN_OPERATORS, MAX_STAGES } from './aggregation-pipeline.constants';

type Stage = Record<string, unknown>;

/**
 * Checks a MongoDB aggregation pipeline a user wrote and points it at the workspace's own data:
 * only reading/reshaping stages, nothing that writes or runs code (also not inside $lookup, $facet
 * or $unionWith pipelines), and $lookup / $graphLookup / $unionWith may only name the workspace's
 * collections — which are swapped for their MongoDB names (`orders` → `data.orders`).
 */
export function checkPipeline(raw: unknown, collections: string[]): { pipeline: Stage[]; issues: string[] } {
  const issues: string[] = [];
  if (!Array.isArray(raw) || !raw.length) return { pipeline: [], issues: ['The pipeline must be a list of stages, e.g. [{"$match": {…}}, {"$group": {…}}]'] };
  const pipeline = rewrite(raw, collections, issues, 'pipeline');
  return { pipeline, issues: [...new Set(issues)] };
}

function rewrite(stages: unknown[], collections: string[], issues: string[], where: string): Stage[] {
  if (stages.length > MAX_STAGES) issues.push(`A pipeline can have at most ${MAX_STAGES} stages`);
  return stages.map((stage, i) => {
    const at = `${where} stage ${i + 1}`;
    if (!isPlainObject(stage) || Object.keys(stage).length !== 1) {
      issues.push(`${at}: each stage is an object with one operator, e.g. {"$match": {…}}`);
      return {};
    }
    const [name, body] = Object.entries(stage)[0];
    if (!ALLOWED_STAGES.includes(name)) {
      issues.push(FORBIDDEN_OPERATORS.includes(name) ? `${at}: ${name} isn't allowed (it writes, runs code or reads server internals)` : `${at}: unknown or unsupported stage ${name}`);
      return {};
    }
    forbidden(body, `${at} (${name})`, issues);
    if (name === '$lookup' || name === '$graphLookup') return { [name]: lookup(body, collections, issues, at, name) };
    if (name === '$unionWith') return { [name]: unionWith(body, collections, issues, at) };
    if (name === '$facet' && isPlainObject(body)) {
      return { $facet: Object.fromEntries(Object.entries(body).map(([key, sub]) => [key, Array.isArray(sub) ? rewrite(sub, collections, issues, `${at} $facet.${key}`) : sub])) };
    }
    return { [name]: body };
  });
}

/** Refuses operators that write or run code anywhere inside a stage (e.g. $function in $addFields). */
function forbidden(value: unknown, at: string, issues: string[]) {
  if (Array.isArray(value)) value.forEach((v) => forbidden(v, at, issues));
  else if (isPlainObject(value)) {
    for (const [key, v] of Object.entries(value)) {
      if (FORBIDDEN_OPERATORS.includes(key)) issues.push(`${at}: ${key} isn't allowed`);
      // Nested pipelines are checked as pipelines (with their collection names swapped) by the caller.
      else if (key !== 'pipeline') forbidden(v, at, issues);
    }
  }
}

function target(name: unknown, collections: string[], issues: string[], at: string): string {
  const collection = String(name ?? '');
  if (!collections.includes(collection)) {
    issues.push(`${at}: “${collection}” is not one of your collections${collections.length ? ` (${collections.slice(0, 8).join(', ')}${collections.length > 8 ? ', …' : ''})` : ''}`);
  }
  return physicalName(collection);
}

function lookup(body: unknown, collections: string[], issues: string[], at: string, name: string) {
  if (!isPlainObject(body)) {
    issues.push(`${at}: ${name} takes an object`);
    return body;
  }
  const out: Record<string, unknown> = { ...body };
  if ('from' in body || name === '$graphLookup') out.from = target(body.from, collections, issues, at);
  if (Array.isArray(body.pipeline)) out.pipeline = rewrite(body.pipeline, collections, issues, `${at} ${name}.pipeline`);
  return out;
}

function unionWith(body: unknown, collections: string[], issues: string[], at: string) {
  if (typeof body === 'string') return target(body, collections, issues, at);
  if (!isPlainObject(body)) {
    issues.push(`${at}: $unionWith takes a collection name or {"coll": …, "pipeline": […]}`);
    return body;
  }
  return {
    ...body,
    coll: target(body.coll, collections, issues, at),
    ...(Array.isArray(body.pipeline) ? { pipeline: rewrite(body.pipeline, collections, issues, `${at} $unionWith.pipeline`) } : {}),
  };
}
