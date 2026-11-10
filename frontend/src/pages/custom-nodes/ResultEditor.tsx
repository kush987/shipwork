import { SchemaFieldsEditor } from '../../components/SchemaFieldsEditor';
import { Field } from '../../components/ui';
import { resultNameProblem } from './customNodes.helpers';
import type { ResultEditorProps } from './customNodes.types';

/** Result: the data the node produces and where later steps find it. */
export function ResultEditor({ resultName, resultSchema, onChange }: ResultEditorProps) {
  const name = resultName || 'result';
  const example = resultSchema[0]?.key || 'field';
  return (
    <div className="cn-subpart">
      <h3 className="cn-subpart-title">Result — the data it produces</h3>
      <p className="cn-subpart-desc">
        Whatever <span className="mono">run()</span> returns is saved as <span className="mono">context.{name}</span>. Later steps read it with{' '}
        <span className="mono cn-token">{`{{context.${name}.${example}}}`}</span>, e.g. in an HTTP request body or a condition.
      </p>
      <Field
        label="Save result as"
        required
        error={resultNameProblem(resultName)}
        help="The default name; each workflow can change it on the node (useful when the node is used twice)"
      >
        <div className="cn-prefixed">
          <span className="mono">context.</span>
          <input className="input mono" value={resultName} onChange={(e) => onChange({ resultName: e.target.value })} aria-label="Result name" />
        </div>
      </Field>
      <div className="field">
        <span className="field-label">Result fields (optional)</span>
        <SchemaFieldsEditor
          value={resultSchema}
          onChange={(next) => onChange({ resultSchema: next })}
          withDescription
          addLabel="Describe a result field"
          emptyText="Describe the fields your result has: they’re suggested in the builder, and the test warns when the result doesn’t match."
        />
      </div>
    </div>
  );
}
