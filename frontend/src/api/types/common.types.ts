// Types mirrored from docs/API_CONTRACT.md — shared across resources.
import type { Execution } from './executions.types';

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date';

/** One typed field of a JSON object: endpoint request schemas and custom node results. */
export interface FieldSpec {
  key: string;
  type: FieldType;
  required: boolean;
  description?: string;
  /** Collections only: no two records may have the same value (the database refuses duplicates). */
  unique?: boolean;
}

export interface Stats {
  workflows: number;
  published: number;
  executions24h: number;
  successRate: number;
  shipments: number;
  endpoints: number;
  apiCalls24h: number;
  collections: number;
  recentExecutions: Execution[];
}

export interface Health {
  status: 'ok';
  role: 'all' | 'api' | 'runtime' | 'worker';
  time: string;
}
