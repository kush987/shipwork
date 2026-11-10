import { forwardRef, useImperativeHandle, useRef } from 'react';
import { indentOnTab } from './CodeTextarea.helpers';
import type { CodeEditorHandle, CodeEditorProps } from './CodeEditor.types';

/** Textarea with line numbers; Tab indents instead of moving focus; `insert()` types at the cursor. */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({ value, onChange, label = 'Code' }, ref) {
  const gutter = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // The handle outlives renders; read the latest value/onChange through a ref.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      const el = area.current;
      const { value: current, onChange: change } = latest.current;
      // A textarea keeps its selection after losing focus, so this is where the user last was.
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      change(`${current.slice(0, start)}${text}${current.slice(end)}`);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + text.length, start + text.length);
      });
    },
    focus: () => area.current?.focus(),
  }));

  const lines = value.split('\n').length;
  return (
    <div className="code-editor">
      <div className="code-gutter" ref={gutter} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={area}
        className="code-text"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={label}
        value={value}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => indentOnTab(e, value, onChange)}
      />
    </div>
  );
});
