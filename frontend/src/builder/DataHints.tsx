import { Check, Copy, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { COPIED_FEEDBACK_MS } from '../components/CopyButton.constants';
import { Button } from '../components/ui';
import { useToast } from '../components/useToast';
import { copyText } from '../lib/clipboard';
import { RESPONSE_NODE_TYPE, TRIGGER_DATA_PATHS, TRIGGER_DATA_TITLE } from './builder.constants';
import { exampleResponseBody, placeholder } from './builder.helpers';
import type { DataHintsProps } from './builder.types';

/**
 * What the trigger and the steps before this one made available, as {{placeholders}} to copy into
 * settings. Return response steps also get a ready-made body that returns what was found.
 */
export function DataHints({ stepPaths, triggerKind, nodeType, readOnly, onUseBody }: DataHintsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), COPIED_FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = (text: string) =>
    copyText(text).then(
      () => setCopied(text),
      (e: unknown) => toast.error('Could not copy', e instanceof Error ? e.message : undefined),
    );

  const triggerPaths = TRIGGER_DATA_PATHS[triggerKind];
  const example = nodeType === RESPONSE_NODE_TYPE ? exampleResponseBody(stepPaths) : null;

  const chips = (paths: string[]) => (
    <div className="data-hints-chips">
      {paths.map((path) => {
        const text = placeholder(path);
        return (
          <button type="button" key={path} className="data-chip" onClick={() => copy(text)} title={`Copy ${text}`}>
            {copied === text ? <Check size={12} /> : <Copy size={12} />}
            <span>{text}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="field data-hints">
      <span className="field-label">Data you can use</span>
      <span className="field-help">
        Click to copy, then paste into a setting. A value that is only a placeholder keeps its type, so a list stays a list.
      </span>

      <div className="data-hints-title">From earlier steps</div>
      {stepPaths.length ? (
        chips(stepPaths)
      ) : (
        <span className="field-help">Nothing yet: connect a step that saves data (Find records, Get record, Run code, Fetch data…) before this one.</span>
      )}

      {triggerPaths.length > 0 && (
        <>
          <div className="data-hints-title">{TRIGGER_DATA_TITLE[triggerKind]}</div>
          {chips(triggerPaths)}
        </>
      )}

      {example && (
        <div className="data-hints-example">
          <div className="data-hints-title">Return what was found</div>
          <pre className="mono">{JSON.stringify(example, null, 2)}</pre>
          {!readOnly && (
            <Button type="button" size="sm" variant="secondary" icon={Wand2} onClick={() => onUseBody(example)}>
              Use as body
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
