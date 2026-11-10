import { Play, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { ConfigFields } from '../../components/config-form/ConfigFields';
import { JsonField } from '../../components/JsonField';
import { Button } from '../../components/ui';
import { builderBranches, builderFields } from './customNodes.helpers';
import type { TestSectionProps } from './customNodes.types';
import { Section } from './Section';
import { TestResultView } from './TestResultView';

export function TestSection({ spec, classic, events, config, onConfigChange, sample, onResetSample, result, running, onRun }: TestSectionProps) {
  const fields = useMemo(() => builderFields(spec), [spec]);
  const branches = builderBranches(spec);
  const saveAs = String(config.saveAs || spec.resultName || 'result');
  return (
    <Section
      step={5}
      title="Test"
      description="Run the unsaved code with sample data — exactly as a workflow would, but nothing is sent or saved."
      actions={
        <Button size="sm" icon={Play} loading={running} onClick={onRun}>
          Run test
        </Button>
      }
    >
      <div className="cn-test-grid">
        <div className="cn-test-input">
          <div className="cn-preview">
            <div className="cn-preview-head">
              <span className="cn-preview-title">Settings, as builders see them</span>
              <span className="muted small">These values are used for the test</span>
            </div>
            {fields.length ? (
              <div className="form-stack">
                <ConfigFields fields={fields} values={config} onChange={onConfigChange} events={events} keyPrefix="test" />
              </div>
            ) : (
              <p className="muted small">This node has no settings.</p>
            )}
            {branches.length > 1 && (
              <div className="field">
                <span className="field-label">Branches</span>
                <div className="output-list">
                  {branches.map((b) => (
                    <span key={b.id} className={`output-chip out-${b.id}`}>
                      {b.label || b.id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <JsonField
            label="Sample data"
            state={sample}
            rows={12}
            help={
              <>
                What run() reads besides <span className="mono">config</span>: <span className="mono">request</span>,{' '}
                <span className="mono">shipment</span>, <span className="mono">context</span>, <span className="mono">trigger</span>.{' '}
                <button type="button" className="link-inline small" onClick={onResetSample}>
                  <RotateCcw size={11} /> New sample
                </button>
              </>
            }
          />
        </div>
        <TestResultView result={result} running={running} spec={spec} classic={classic} saveAs={saveAs} />
      </div>
    </Section>
  );
}
