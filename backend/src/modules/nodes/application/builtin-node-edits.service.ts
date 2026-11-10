import { Injectable } from '@nestjs/common';
import { isEqual } from 'lodash';
import { NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { isCustomType } from '../../custom-node/domain/custom-node';
import { BuiltinNodeEditRepository } from '../../builtin-node/domain/builtin-node-edit.repository';
import { EDIT_LIMITS, ICON_NAME } from '../../builtin-node/domain/builtin-node-edit.constants';
import { NodeRegistry } from '../node-registry';
import { hasStepLogic, noLogicReason, stepLogicIssues } from '../domain/step-logic';
import { STEP_LOGIC_HOOKS } from '../domain/step-logic.constants';
import { appliedEdit, hasChanges } from '../domain/builtin-node-edit';
import type { BuiltinNodeEdit, BuiltinNodeEditInput } from '../../builtin-node/domain/builtin-node-edit.types';
import type { ConfigField, NodeTypeDefinition } from '../domain/workflow-node.types';
import type { StepLogic } from '../../workflow/domain/workflow-definition.types';
import type { FieldIssue } from '../../../shared/schema/field-schema.types';

const parseJson = (v: unknown) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/** Same default value, reading JSON settings written as text and as values alike. */
const sameValue = (field: ConfigField, a: unknown, b: unknown) => (field.kind === 'json' ? isEqual(parseJson(a), parseJson(b)) : isEqual(a, b));

/** Why a value can't be this setting's default, or null. */
function defaultIssue(field: ConfigField, value: unknown): string | null {
  const choices = !field.optionsSource && field.options?.length ? field.options.map((o) => o.value) : null;
  switch (field.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a number';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'select':
      if (typeof value !== 'string') return 'must be one of its options';
      return !choices || choices.includes(value) ? null : `must be one of ${choices.join(', ')}`;
    case 'multiselect':
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return 'must be a list of its options';
      return !choices || value.every((v) => choices.includes(v)) ? null : `can only hold ${choices.join(', ')}`;
    case 'json':
      if (typeof value !== 'string') return null;
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'is not valid JSON';
      }
    case 'conditions':
      return Array.isArray(value) ? null : 'must be a list of conditions';
    default:
      return typeof value === 'string' ? null : 'must be text';
  }
}

const trimmed = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** What one version changed, in words, for the history list. */
const changesOf = (edit: BuiltinNodeEdit): string[] =>
  edit.reset
    ? ['reset to default']
    : [
        ...(edit.label ? ['name'] : []),
        ...(edit.description ? ['description'] : []),
        ...(edit.icon ? ['icon'] : []),
        ...Object.keys(edit.defaults).map((k) => `default ${k}`),
        ...(hasStepLogic(edit.logic) ? ['workspace logic'] : []),
      ];

/**
 * A workspace's changes to built-in steps: name, description, icon, default settings and workspace
 * logic. The step's behaviour stays the app's; only the changes are stored, as versions. Built-in
 * steps can't be deleted — "Reset to default" saves a version without changes.
 */
@Injectable()
export class BuiltinNodeEditService {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly edits: BuiltinNodeEditRepository,
  ) {}

  async list(tenantId: string) {
    const latest = new Map((await this.edits.latestAll(tenantId)).map((e) => [e.type, e]));
    return this.builtins().map((def) => this.view(def, latest.get(def.type) ?? null));
  }

  async get(tenantId: string, type: string) {
    const def = this.require(type);
    const history = await this.edits.history(tenantId, type);
    return {
      ...this.view(def, history[0] ?? null),
      settings: def.configSchema,
      outputs: def.outputs,
      history: history.map((e) => ({ version: e.version, createdAt: e.createdAt, createdBy: e.createdBy, changes: changesOf(e) })),
    };
  }

  /** Saves what the step should look like now as a new version (nothing new when nothing changed). */
  async save(tenantId: string, type: string, input: BuiltinNodeEditInput, actor: string | null) {
    const def = this.require(type);
    const next = this.normalized(def, input);
    const latest = await this.edits.latest(tenantId, type);
    const current = latest && !latest.reset ? latest : null;
    const unchanged = isEqual(
      { label: current?.label, description: current?.description, icon: current?.icon, defaults: current?.defaults ?? {}, logic: current?.logic },
      next,
    );
    if (!unchanged && (latest || hasChanges({ ...next, reset: false }))) {
      await this.append(tenantId, type, latest, { ...next, reset: false }, actor);
    }
    return this.get(tenantId, type);
  }

  /** Back to the app's own name, icon, defaults and no workspace logic — as a new version, history kept. */
  async reset(tenantId: string, type: string, actor: string | null) {
    this.require(type);
    const latest = await this.edits.latest(tenantId, type);
    if (latest && !latest.reset) await this.append(tenantId, type, latest, { defaults: {}, reset: true }, actor);
    return this.get(tenantId, type);
  }

  private async append(tenantId: string, type: string, latest: BuiltinNodeEdit | null, body: Omit<BuiltinNodeEdit, 'tenantId' | 'type' | 'version' | 'createdAt' | 'createdBy'>, actor: string | null) {
    const edit: BuiltinNodeEdit = { tenantId, type, version: (latest?.version ?? 0) + 1, ...body, createdAt: new Date().toISOString(), createdBy: actor };
    if (!(await this.edits.create(edit))) throw new ValidationFailedError([{ message: 'Someone saved this step at the same time — reload and try again' }]);
  }

  /** Checks the input against the step and keeps only real changes (defaults equal to the app's are dropped). */
  private normalized(def: NodeTypeDefinition, input: BuiltinNodeEditInput) {
    const issues: FieldIssue[] = [];
    const label = trimmed(input.label);
    const description = trimmed(input.description);
    const icon = trimmed(input.icon);
    if (label && label.length > EDIT_LIMITS.label) issues.push({ field: 'label', message: `Name can be at most ${EDIT_LIMITS.label} characters` });
    if (description && description.length > EDIT_LIMITS.description) {
      issues.push({ field: 'description', message: `Description can be at most ${EDIT_LIMITS.description} characters` });
    }
    if (icon && !ICON_NAME.test(icon)) issues.push({ field: 'icon', message: `“${icon}” is not an icon name` });

    const defaults: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input.defaults ?? {})) {
      const field = def.configSchema.find((f) => f.key === key);
      if (!field) {
        issues.push({ field: `defaults.${key}`, message: `“${def.label}” has no setting “${key}”` });
        continue;
      }
      if (value === undefined || value === null || sameValue(field, value, field.default)) continue;
      const issue = defaultIssue(field, value);
      if (issue) issues.push({ field: `defaults.${key}`, message: `${field.label} ${issue}` });
      else defaults[key] = value;
    }

    const logic: StepLogic = {};
    for (const hook of STEP_LOGIC_HOOKS) if (input.logic?.[hook]?.trim()) logic[hook] = input.logic[hook];
    for (const message of stepLogicIssues(logic, def)) issues.push({ field: 'logic', message });

    if (issues.length) throw new ValidationFailedError(issues);
    return { label: label === def.label ? undefined : label, description: description === def.description ? undefined : description, icon: icon === def.icon ? undefined : icon, defaults, logic: hasStepLogic(logic) ? logic : undefined };
  }

  private view(def: NodeTypeDefinition, edit: BuiltinNodeEdit | null) {
    const applied = appliedEdit(def, edit);
    return {
      type: def.type,
      category: def.category,
      label: applied.label,
      description: applied.description,
      icon: applied.icon,
      base: { label: def.label, description: def.description, icon: def.icon },
      edit,
      edited: !!edit && hasChanges(edit),
      logicAllowed: noLogicReason(def) === null,
      logicNote: noLogicReason(def),
    };
  }

  private builtins() {
    return this.registry.catalog().filter((d) => !isCustomType(d.type));
  }

  private require(type: string): NodeTypeDefinition {
    const def = !isCustomType(type) ? this.registry.get(type)?.definition : undefined;
    if (!def) throw new NotFoundError('Built-in step', type);
    return def;
  }
}
