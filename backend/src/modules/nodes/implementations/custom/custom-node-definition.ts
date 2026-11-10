import { saveAsField } from '../../domain/node-config';
import { isSimpleFormat, resultNameOf } from '../../../custom-node/domain/custom-node';
import { FAILED_BRANCH } from '../../../custom-node/domain/custom-node.constants';
import type { CustomNodeSpec } from '../../../custom-node/domain/custom-node.types';
import type { NodeTypeDefinition } from '../../domain/workflow-node.types';

/**
 * How a custom node looks to the builder and the engine. Shared by the palette (latest version)
 * and the executable adapter (a pinned version) so both always agree.
 *
 * Simple-format nodes get the same "Save result as" setting built-in nodes have, and a "Failed"
 * branch when they opted into error handling.
 */
export function customNodeDefinition(spec: CustomNodeSpec & { type: string }, ref: { id: string; version: number }): NodeTypeDefinition {
  const base = { type: spec.type, category: 'custom' as const, label: spec.label, description: spec.description, icon: spec.icon };
  if (!isSimpleFormat(spec)) return { ...base, configSchema: spec.configSchema, outputs: spec.outputs, custom: ref };
  return {
    ...base,
    configSchema: [...spec.configSchema, saveAsField(resultNameOf(spec))],
    outputs: spec.errorBranch ? [...spec.outputs, FAILED_BRANCH] : spec.outputs,
    custom: { ...ref, resultFields: (spec.resultSchema ?? []).map((f) => f.key) },
  };
}
