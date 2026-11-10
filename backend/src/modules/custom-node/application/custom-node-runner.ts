import { SandboxError } from './code-sandbox';
import { CodeSandbox } from './code-sandbox.ports';
import { CustomRun, CustomNodeInput } from './custom-node-runner.types';
import { resultFormatOf } from './result-formats';
import { resultWarnings } from './result-format.helpers';
import type { RunnableSpec } from './result-format.types';

/**
 * Runs a custom node's code in the node's result format and normalises what it returns. Shared by
 * workflow executions and the editor's "Run test" so both behave identically.
 */
export async function runCustomNode(sandbox: CodeSandbox, spec: RunnableSpec, input: CustomNodeInput): Promise<CustomRun> {
  const format = resultFormatOf(spec);
  try {
    const { value, logs, durationMs } = await sandbox.run(format.program(spec.code), input);
    const result = format.interpret(value, spec);
    if (typeof result === 'string') return { ok: false, error: result, logs, durationMs };
    return { ok: true, result, logs, durationMs, warnings: resultWarnings(spec, result.output) };
  } catch (error) {
    if (error instanceof SandboxError) return { ok: false, error: error.message, logs: error.logs, durationMs: error.durationMs };
    throw error;
  }
}

/** Compiles the code as its format will run it and reports whether it defines `run()`. */
export const checkCustomNodeCode = (sandbox: CodeSandbox, spec: Pick<RunnableSpec, 'code' | 'apiVersion'>) =>
  sandbox.check(resultFormatOf(spec).program(spec.code));
