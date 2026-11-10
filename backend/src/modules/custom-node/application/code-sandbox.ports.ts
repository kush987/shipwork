import { SandboxResult, SandboxLimits } from './code-sandbox.types';

/** Runs untrusted user code with no host access, bounded in time and memory. */
export abstract class CodeSandbox {
  abstract run(code: string, input: unknown, limits?: SandboxLimits): Promise<SandboxResult>;
  /** Compiles the code and reports whether it defines a callable `run`. */
  abstract check(code: string): Promise<{ ok: true } | { ok: false; error: string }>;
}
