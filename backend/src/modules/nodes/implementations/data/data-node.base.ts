import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { renderTemplate, renderTyped } from '../../../../shared/util/path';
import { jsonSettingErrors, parseJsonObject, parseJsonValue } from '../../../../shared/util/json-setting';
import { DataService } from '../../../data/application/data.service';
import { DataSourceService } from '../../../data/application/data-source.service';
import { isSystemSource } from '../../../data/domain/data-source';
import { asStep } from '../../domain/step-errors';
import { saveAsErrors } from '../../domain/node-config';
import { COLLECTION_NAME } from '../../../data/domain/data-collection.constants';
import { TEMPLATE_HELP, TYPED_JSON_HELP } from '../../domain/node-config.constants';
import { ConfigField, NodeExecutionContext, NodeExecutionResult, NodeTypeDefinition, WorkflowNode } from '../../domain/workflow-node.types';
import { JsonSettingSpec } from '../../../../shared/util/json-setting.types';
import { parseJoins } from '../../../data/domain/record-join';
import { MAX_JOINS } from '../../../data/domain/record-join.constants';
import { joinRecords } from '../../../data/application/record-joiner';
import type { JoinSummary } from '../../../data/domain/record-join.types';
import type { SourceRecord } from '../../../data/domain/data-source.types';
import type { RecordTarget } from '../../../data/domain/record-update.types';
import { FIELD_PATH } from '../../../../shared/query/record-query.constants';

export const recordIdField: ConfigField = {
  key: 'id',
  label: 'Record id',
  kind: 'text',
  required: true,
  placeholder: '{{request.params.id}}',
  help: TEMPLATE_HELP,
};

/** Matching on `id` loads the record directly. Steps saved before "Find by" existed have none, which means id. */
export const BY_ID = 'id';

export const findByField: ConfigField = {
  key: 'findBy',
  label: 'Find by',
  kind: 'text',
  optionsSource: 'source-fields',
  default: BY_ID,
  placeholder: BY_ID,
  help: 'id, or any field of the data, e.g. sku or email. If several records match, the newest is used.',
};

export const findValueField: ConfigField = { ...recordIdField, label: 'Value', help: `The id, or the value “Find by” must equal. ${TEMPLATE_HELP}` };

export const findByOf = (config: Record<string, unknown>) => String(config.findBy ?? '').trim() || BY_ID;

const isPlainValue = (v: unknown): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v);

/** Which records a list step reads (Find records, Paginated list). */
export const recordFilterField: ConfigField = {
  key: 'filter',
  label: 'Filter',
  kind: 'json',
  default: '{}',
  help: `e.g. {"status": "active", "price": {"$lte": "{{request.query.maxPrice}}"}}. Operators: $eq $ne $gt $gte $lt $lte $in $nin $exists $contains; text search: {"$text": "red shirt"} (needs a text index; best matches first). ${TYPED_JSON_HELP}`,
};

/** Which fields records carry (id and the timestamps always come along). */
export const recordFieldsField: ConfigField = {
  key: 'fields',
  label: 'Fields to return',
  kind: 'text',
  placeholder: 'name, price, customer.phone',
  help: 'Comma-separated; empty returns every field. Smaller records are faster to read and pass on.',
};

/** The fields to set, as before operators existed. */
export const changesField: ConfigField = {
  key: 'changes',
  label: 'Changes',
  kind: 'json',
  default: '{"status": "{{request.body.status}}"}',
  help: `Fields to set; null removes a field. ${TYPED_JSON_HELP}`,
};

/** MongoDB update operators, beside (or instead of) the fields to set. */
export const operationsField: ConfigField = {
  key: 'operations',
  label: 'Operators',
  kind: 'json',
  placeholder: '{"$inc": {"stock": -1}, "$push": {"tags": "vip"}}',
  help:
    'Atomic MongoDB operators: $inc $mul $min $max (numbers, dates), $push $addToSet $pull (lists; a list adds each item, $each/$slice/$position work), ' +
    '$unset ["field"], $currentDate {"paidAt": true}, $setOnInsert (when creating).',
};

/** Changes and operators as one MongoDB update document. */
export const UPDATE_JSON_SETTINGS: JsonSettingSpec[] = [
  { key: 'changes', label: 'Changes' },
  { key: 'operations', label: 'Operators' },
];

export const recordSortField: ConfigField = { key: 'sort', label: 'Sort', kind: 'json', default: '{"createdAt": -1}' };

/** Related records to attach to each record of a list, read in a few batched queries. */
export const joinsField: ConfigField = {
  key: 'joins',
  label: 'Joins',
  kind: 'json',
  placeholder: '[{"from": "products", "localField": "productId", "as": "product"}]',
  help:
    'Attaches related records from other data to each record. from: a collection or built-in data · localField: the key in this record · ' +
    'foreignField: the field it must equal there (default id) · as: where to attach it · many: true attaches every match as a list (default: the newest one, or null). ' +
    `Up to ${MAX_JOINS}; a later join can use an earlier one, e.g. "localField": "product.supplierId".`,
};

/** The JSON settings of the list steps, checked with the shared rules. */
export const LIST_JSON_SETTINGS: JsonSettingSpec[] = [
  { key: 'filter', label: 'Filter' },
  { key: 'sort', label: 'Sort' },
  { key: 'joins', label: 'Joins', shape: 'any' },
];

/**
 * Template Method for the data nodes: validation of the shared settings, typed templating and the
 * mapping of data-store errors to retry semantics live here; subclasses only implement `run`.
 * Decorated so Nest resolves the inherited constructor dependency for every subclass.
 */
@Injectable()
export abstract class DataNode implements WorkflowNode {
  abstract readonly definition: NodeTypeDefinition;
  /** JSON settings of this node, validated with the shared rules. */
  protected readonly jsonSettings: JsonSettingSpec[] = [];
  /** Read steps may also read built-in data (shipments, warehouses, couriers); write steps may not. */
  protected readonly readsBuiltIn: boolean = false;

  constructor(
    protected readonly data: DataService,
    protected readonly sources: DataSourceService,
  ) {}

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = [...saveAsErrors(config), ...jsonSettingErrors(config, this.jsonSettings), ...this.joinErrors(config)];
    const name = config.collection ? String(config.collection) : '';
    if (!name) return errors;
    if (!isSystemSource(name)) {
      if (!COLLECTION_NAME.test(name)) errors.push(`“${name}” is not a valid collection name`);
    } else if (!this.readsBuiltIn) {
      errors.push(`Built-in data (“${name}”) is read-only here — pick a collection, or use the shipment steps to change shipments`);
    } else if (!this.sources.hasSystemSource(name)) {
      errors.push(`“${name}” is not built-in data`);
    }
    return errors;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const collection = String(ctx.config.collection ?? '');
    if (!collection) throw new NonRetryableError('Choose a collection');
    return asStep(() => this.run(ctx, collection));
  }

  protected abstract run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult>;

  /** A JSON setting with placeholders filled in, keeping value types. */
  protected jsonValue(ctx: NodeExecutionContext, key: string, label: string): unknown {
    return renderTyped(parseJsonValue(ctx.config[key], label), ctx.data);
  }

  protected jsonObject(ctx: NodeExecutionContext, key: string, label: string): Record<string, unknown> {
    return (renderTyped(parseJsonObject(ctx.config[key], label) ?? {}, ctx.data) as Record<string, unknown>) ?? {};
  }

  /** A text setting with placeholders filled in. */
  protected text(ctx: NodeExecutionContext, key: string): string {
    return renderTemplate(String(ctx.config[key] ?? ''), ctx.data).trim();
  }

  /** Problems of the Joins setting, including built-in data it names but doesn't have. Bad JSON is reported by jsonSettingErrors. */
  private joinErrors(config: Record<string, unknown>): string[] {
    let raw: unknown;
    try {
      raw = parseJsonValue(config.joins, 'Joins');
    } catch {
      return [];
    }
    const { joins, issues } = parseJoins(raw);
    for (const join of joins.filter((j) => isSystemSource(j.from))) {
      const info = this.sources.systemSourceInfo(join.from);
      if (!info) issues.push(`Join “${join.as}”: “${join.from}” is not built-in data`);
      else if (!info.fields.some((f) => f.key === join.foreignField)) {
        issues.push(`Join “${join.as}”: ${info.label} has no field “${join.foreignField}” — use ${info.fields.map((f) => f.key).join(', ')}`);
      }
    }
    return issues;
  }

  /** `records` with the Joins setting's related records attached, and what each join did. */
  protected async withJoins(ctx: NodeExecutionContext, records: SourceRecord[]): Promise<{ records: SourceRecord[]; joins: JoinSummary[] }> {
    const { joins, issues } = parseJoins(parseJsonValue(ctx.config.joins, 'Joins'));
    if (issues.length) throw new NonRetryableError(issues.join('; '));
    let current = records;
    const summaries: JoinSummary[] = [];
    if (!records.length) return { records, joins: summaries };
    for (const join of joins) {
      // One at a time, so a failure names the join it came from.
      const result = await asStep(() => joinRecords(this.sources, ctx.tenantId, current, [join]), `Join “${join.as}”`);
      current = result.records;
      summaries.push(...result.joins);
    }
    return { records: current, joins: summaries };
  }

  /** The step's Changes and Operators as one update document ({"$set": changes, ...operators}). */
  protected updateDocument(ctx: NodeExecutionContext): Record<string, unknown> {
    const changes = this.jsonObject(ctx, 'changes', 'Changes');
    const operations = this.jsonObject(ctx, 'operations', 'Operators');
    const bad = Object.keys(operations).filter((k) => !k.startsWith('$'));
    if (bad.length) throw new NonRetryableError(`Operators must be $-operators, e.g. {"$inc": {…}} — move ${bad.join(', ')} to Changes`);
    if (Object.keys(changes).length && '$set' in operations) throw new NonRetryableError('Put the fields to set in Changes or in $set, not both');
    return { ...(Object.keys(changes).length ? { $set: changes } : {}), ...operations };
  }

  /** Fields records must carry for this step: the asked-for ones, plus what joins and the order need. */
  protected fieldsToRead(ctx: NodeExecutionContext, extra: string[] = []): string[] | undefined {
    const asked = this.text(ctx, 'fields')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    if (!asked.length) return undefined;
    const { joins } = parseJoins(parseJsonValue(ctx.config.joins, 'Joins'));
    return [...new Set([...asked, ...extra, ...joins.map((j) => j.localField.split('.')[0])])];
  }

  /** The value to match. Exactly one placeholder keeps its type, so "{{request.body.qty}}" stays a number. */
  protected matchValue(ctx: NodeExecutionContext, field: string): string | number | boolean {
    const rendered = renderTyped(ctx.config.id ?? '', ctx.data);
    const value = typeof rendered === 'string' ? rendered.trim() : rendered;
    if (value === '' || value === null || value === undefined) throw new NonRetryableError(`Value to find by “${field}” is empty — check the placeholder`);
    if (!isPlainValue(value)) {
      throw new NonRetryableError(`Value to find by “${field}” must be text, a number or true/false — got ${Array.isArray(value) ? 'a list' : 'an object'}`);
    }
    return value;
  }

  /** Which record the step means: by id, or the newest whose “Find by” field equals the value. */
  protected target(ctx: NodeExecutionContext): RecordTarget {
    const field = findByOf(ctx.config);
    return field === BY_ID ? { id: this.recordId(ctx) } : { field, value: this.matchValue(ctx, field) };
  }

  protected recordId(ctx: NodeExecutionContext): string {
    const id = this.text(ctx, 'id');
    if (!id) throw new NonRetryableError('Record id is empty — check the placeholder');
    return id;
  }
}
