import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDuration, httpStatusLabel } from '../lib/format';
import { statusTone } from './HttpResponseView.helpers';
import type { HttpResponseViewProps } from './HttpResponseView.types';
import { Badge, JsonBlock } from './ui';

/** An HTTP answer: status, optional timing / execution link, headers (collapsed at first) and body. */
export function HttpResponseView({
  status,
  statusText,
  headers,
  body,
  durationMs,
  executionId,
  showHeaders = true,
}: HttpResponseViewProps) {
  const hasHeaders = showHeaders && headers && Object.keys(headers).length > 0;
  return (
    <div className="http-response">
      <div className="http-response-head">
        <Badge tone={statusTone(status)} dot>
          {httpStatusLabel(status, statusText)}
        </Badge>
        {durationMs !== undefined && <span className="mono small muted">{formatDuration(durationMs)}</span>}
        {executionId && (
          <Link to={`/executions/${executionId}`} className="link-inline http-response-exec">
            Execution <span className="mono">{executionId.slice(-8)}</span> <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
      {hasHeaders && <JsonBlock label={`Response headers (${Object.keys(headers).length})`} value={headers} defaultOpen={false} />}
      <JsonBlock label="Response body" value={body === undefined || body === null || body === '' ? '(empty)' : body} />
    </div>
  );
}
