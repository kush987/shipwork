import { isPlainObject } from '../../../shared/util/json-setting';
import { normaliseEmit, unknownBranch } from './result-format.helpers';
import { wrapUserCode } from './simple-format.constants';
import type { ResultFormat, SimpleEnvelope } from './result-format.types';

/**
 * `run()` returns the result itself; `branch('id', result)` picks the branch (the first one
 * otherwise), `emit(event, payload)` queues a custom event and `fail(message)` throws.
 */
export const simpleFormat: ResultFormat = {
  program: wrapUserCode,

  interpret(raw, spec) {
    if (!isPlainObject(raw)) return 'run() did not complete';
    const { value, branch, emits } = raw as unknown as SimpleEnvelope;
    const outputHandle = branch ?? spec.outputs[0]?.id;
    const wrongBranch = unknownBranch(outputHandle, spec.outputs, (id) => `branch('${id}')`);
    if (wrongBranch) return wrongBranch;
    const emit = normaliseEmit(emits.length ? emits : undefined);
    if (typeof emit === 'string') return emit;
    return { outputHandle: outputHandle!, output: value, context: {}, emit };
  },
};
