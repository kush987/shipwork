import type { CustomNodeResult, CustomNodeSpec } from '../domain/custom-node.types';

/** The parts of a node definition needed to run its code. */
export type RunnableSpec = Pick<CustomNodeSpec, 'code' | 'outputs' | 'apiVersion' | 'resultSchema'>;

/**
 * One way for `run()` to hand back its work (Strategy). Each stored version names its format, so
 * adding a format never changes how existing versions behave.
 */
export interface ResultFormat {
  /** The program the sandbox evaluates; it must leave a callable `run` behind. */
  program(code: string): string;
  /** Turns what the sandbox returned into a result, or explains what is wrong with it. */
  interpret(value: unknown, spec: RunnableSpec): CustomNodeResult | string;
}

/** What the simple format's wrapper around `run()` returns from the sandbox. */
export interface SimpleEnvelope {
  value: unknown;
  branch: string | null;
  emits: unknown[];
}
