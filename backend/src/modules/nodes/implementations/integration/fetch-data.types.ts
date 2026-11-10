import { OutboundResponse } from '../../../../shared/http/outbound-http.types';

export interface FetchRun {
  request: { method: string; url: string };
  response: OutboundResponse;
  /** What gets stored at context[saveAs]: the extracted fields, or { status, body } when none are listed. */
  saved: Record<string, unknown>;
  missing: string[];
}
