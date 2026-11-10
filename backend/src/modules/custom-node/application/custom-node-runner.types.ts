import { CustomNodeResult } from '../domain/custom-node.types';

export interface CustomNodeInput {
  config: Record<string, unknown>;
  shipment: unknown;
  context: Record<string, unknown>;
  /** The API request, for workflows started by an endpoint. */
  request?: unknown;
  trigger: { event: string };
}

export type CustomRun =
  | { ok: true; result: CustomNodeResult; logs: string[]; durationMs: number; warnings: string[] }
  | { ok: false; error: string; logs: string[]; durationMs: number };
