import { camelCase, isEqual, isNil, omitBy, pick } from 'lodash';
import { normalizeFieldSpecs } from '../../../shared/schema/field-schema';
import { IDENTIFIER, RESERVED_CONTEXT_KEYS } from '../../nodes/domain/node-config.constants';
import { BASE_SPEC_KEYS, CLASSIC_API, CUSTOM_TYPE_PREFIX, DEFAULT_RESULT_NAME, SIMPLE_API, SPEC_KEYS } from './custom-node.constants';
import type { CustomNodeApiVersion, CustomNodeSpec } from './custom-node.types';
import type { ConfigField } from '../../nodes/domain/workflow-node.types';

export const isCustomType = (type: string) => type.startsWith(CUSTOM_TYPE_PREFIX);

/** Versions saved before the simple format existed carry no apiVersion: they are classic. */
export const apiVersionOf = (spec: Pick<CustomNodeSpec, 'apiVersion'>): CustomNodeApiVersion => spec.apiVersion ?? CLASSIC_API;

export const isSimpleFormat = (spec: Pick<CustomNodeSpec, 'apiVersion'>) => apiVersionOf(spec) === SIMPLE_API;

/** A usable context key derived from the node's name: `COD risk check` → `codRiskCheck`. */
export function defaultResultName(label: string): string {
  const name = camelCase(label).slice(0, 40);
  return IDENTIFIER.test(name) && !RESERVED_CONTEXT_KEYS.includes(name) ? name : DEFAULT_RESULT_NAME;
}

/** The name a simple-format node saves its result under unless a workflow overrides it. */
export const resultNameOf = (spec: Pick<CustomNodeSpec, 'resultName' | 'label'>) => spec.resultName?.trim() || defaultResultName(spec.label);

/**
 * The canonical form of what a user authored: only spec keys, trimmed names, and the simple-format
 * extras filled in (or dropped for classic nodes, which ignore them).
 */
export function normalizeSpec(spec: CustomNodeSpec): CustomNodeSpec {
  const normalized: CustomNodeSpec = {
    ...(pick(spec, BASE_SPEC_KEYS) as CustomNodeSpec),
    label: spec.label.trim(),
    description: (spec.description ?? '').trim(),
    // Stored settings may carry nulls for unset props; they mean the same as absent.
    configSchema: spec.configSchema.map((field) => omitBy(field, isNil) as unknown as ConfigField),
  };
  // Classic is the absence of a format: `apiVersion: 1` and no apiVersion compare equal.
  if (!isSimpleFormat(spec)) return normalized;
  return {
    ...normalized,
    apiVersion: SIMPLE_API,
    resultName: resultNameOf(spec),
    resultSchema: normalizeFieldSpecs(spec.resultSchema ?? []),
    errorBranch: !!spec.errorBranch,
  };
}

/** True when saving `next` over `current` would change anything a workflow could observe. */
export const specChanged = (current: CustomNodeSpec, next: CustomNodeSpec) =>
  !isEqual(pick(normalizeSpec(current), SPEC_KEYS), pick(normalizeSpec(next), SPEC_KEYS));
