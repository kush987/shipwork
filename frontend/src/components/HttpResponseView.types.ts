export interface HttpResponseViewProps {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body: unknown;
  durationMs?: number;
  executionId?: string | null;
  showHeaders?: boolean;
}
