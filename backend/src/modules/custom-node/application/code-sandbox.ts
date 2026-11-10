export class SandboxError extends Error {
  constructor(
    message: string,
    readonly logs: string[],
    readonly durationMs: number,
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}
