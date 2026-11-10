import { isPlainObject } from '../../../shared/util/json-setting';
import { normaliseEmit, unknownBranch } from './result-format.helpers';
import { CLASSIC_RESULT_KEYS } from './classic-format.constants';
import type { ResultFormat } from './result-format.types';

/**
 * The original format: `run()` returns `{ outputHandle, output, context, emit }`, or any other value
 * which is treated as the output. Kept unchanged so versions saved with it run exactly as before.
 */
export const classicFormat: ResultFormat = {
  program: (code) => code,

  interpret(value, spec) {
    const shaped = isPlainObject(value) && Object.keys(value).some((k) => CLASSIC_RESULT_KEYS.includes(k));
    const outputHandle = shaped && value.outputHandle !== undefined ? String(value.outputHandle) : spec.outputs[0]?.id;
    const wrongBranch = unknownBranch(outputHandle, spec.outputs, (id) => `run() returned outputHandle '${id}', which`);
    if (wrongBranch) return wrongBranch;
    const context = shaped ? value.context : undefined;
    if (context !== undefined && !isPlainObject(context)) return 'run() returned a context that is not an object';
    const emit = normaliseEmit(shaped ? value.emit : undefined);
    if (typeof emit === 'string') return emit;
    return { outputHandle: outputHandle!, output: shaped ? (value.output ?? null) : value, context: context ?? {}, emit };
  },
};
