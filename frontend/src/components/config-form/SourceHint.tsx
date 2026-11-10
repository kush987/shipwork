import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SOURCE_HINT_FIELDS } from './config-form.constants';
import { sourceDataLink, sourceFieldSummary } from './config-form.helpers';
import type { SourceHintProps } from './config-form.types';

/** Help under a data-source setting: whether it's built-in, and which fields filters and templates can use. */
export function SourceHint({ source }: SourceHintProps) {
  const { shown, more } = sourceFieldSummary(source, SOURCE_HINT_FIELDS);
  return (
    <span className="source-hint">
      {source.kind === 'system' && <strong>Built-in data · read-only. </strong>}
      {shown.length > 0 ? (
        <>
          Fields:{' '}
          {shown.map((key, i) => (
            <span key={key}>
              <code className="mono">{key}</code>
              {i < shown.length - 1 ? ', ' : ''}
            </span>
          ))}
          {more > 0 && ` +${more} more`}
          {' · '}
        </>
      ) : (
        'No fields described yet · '
      )}
      <Link to={sourceDataLink(source.name)} className="link-inline" target="_blank" rel="noreferrer">
        browse <ExternalLink size={11} />
      </Link>
    </span>
  );
}
