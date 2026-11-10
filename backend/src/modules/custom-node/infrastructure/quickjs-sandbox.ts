import { Injectable } from '@nestjs/common';
import { CodeSandbox } from '../application/code-sandbox.ports';
import { SandboxLimits, SandboxResult } from '../application/code-sandbox.types';
import { QuickJsEvaluator } from './quickjs-evaluator';

/**
 * Runs user code on the calling (main) thread. Used when SANDBOX_THREADS=0 and by the specs;
 * production uses ThreadedCodeSandbox, which runs the same evaluator on worker threads.
 */
@Injectable()
export class QuickJsSandbox extends CodeSandbox {
  private readonly evaluator = new QuickJsEvaluator();

  check(code: string) {
    return this.evaluator.check(code);
  }

  run(code: string, input: unknown, limits: SandboxLimits = {}): Promise<SandboxResult> {
    return this.evaluator.run(code, input, limits);
  }
}
