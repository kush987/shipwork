export interface SandboxLimits {
  timeoutMs?: number;
  memoryBytes?: number;
}

export interface SandboxResult {
  value: unknown;
  logs: string[];
  durationMs: number;
}
