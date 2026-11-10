import type { SourceFieldsProps } from './data.types';

/** The fields of a built-in source that filters, sorts and {{placeholders}} can use. */
export function SourceFields({ source }: SourceFieldsProps) {
  return (
    <details className="card source-fields">
      <summary>
        Fields you can filter on <span className="muted small">({source.fields.length})</span>
      </summary>
      <div className="table-scroll">
        <table className="table source-fields-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>What it is</th>
            </tr>
          </thead>
          <tbody>
            {source.fields.map((f) => (
              <tr key={f.key}>
                <td className="mono small">{f.key}</td>
                <td className="small muted">{f.type}</td>
                <td className="small">{f.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
