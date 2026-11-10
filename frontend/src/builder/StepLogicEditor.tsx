import { Braces, Plus, X } from 'lucide-react';
import { CodeTextarea } from '../components/CodeTextarea';
import { LOGIC_HOOK_COPY } from './builder.constants';
import { hasLogic, logicStarter } from './builder.helpers';
import type { LogicHook, StepLogicEditorProps } from './builder.types';

const HOOKS: LogicHook[] = ['before', 'after'];

/**
 * The step's own logic: JavaScript that runs before it (to change its settings or answer early) and
 * after it (to change what it saves or the path it takes). Saved and published with the workflow.
 */
export function StepLogicEditor({ def, logic, readOnly, onChange, title = 'Logic', help }: StepLogicEditorProps) {
  if (readOnly && !hasLogic(logic)) return null;
  const set = (hook: LogicHook, code: string | undefined) => onChange({ ...logic, [hook]: code });

  return (
    <div className="field step-logic">
      <span className="field-label">
        <Braces size={13} /> {title}
      </span>
      <span className="field-help">
        {help ?? 'Change how this step works with your own JavaScript. It runs in a sandbox and is saved and published with the workflow.'}
      </span>
      {HOOKS.map((hook) => {
        const code = logic?.[hook];
        if (code === undefined || code === null) {
          if (readOnly) return null;
          return (
            <button type="button" key={hook} className="step-logic-add" onClick={() => set(hook, logicStarter(hook, def))}>
              <Plus size={14} />
              <span>
                <strong>{LOGIC_HOOK_COPY[hook].title}</strong>
                <span className="muted">{LOGIC_HOOK_COPY[hook].add}</span>
              </span>
            </button>
          );
        }
        return (
          <div key={hook} className="step-logic-hook">
            <div className="step-logic-head">
              <span className="mono small">{hook}()</span>
              <span className="small">{LOGIC_HOOK_COPY[hook].title}</span>
              {!readOnly && (
                <button type="button" className="icon-btn" onClick={() => set(hook, undefined)} aria-label={`Remove ${hook}() logic`} title="Remove">
                  <X size={14} />
                </button>
              )}
            </div>
            <CodeTextarea value={code} readOnly={readOnly} rows={12} spellCheck={false} onChange={(next) => set(hook, next)} />
          </div>
        );
      })}
    </div>
  );
}
