import { Wand2 } from 'lucide-react';
import { useMemo } from 'react';
import { CodeEditor } from '../../components/CodeEditor';
import { Button } from '../../components/ui';
import { CodeReference } from './CodeReference';
import { codeSnippets } from './customNodes.helpers';
import type { LogicSectionProps } from './customNodes.types';
import { Section } from './Section';

export function LogicSection({ spec, classic, onCodeChange, editorRef, onInsert, onGenerate }: LogicSectionProps) {
  const groups = useMemo(() => codeSnippets(spec), [spec]);
  return (
    <Section
      step={4}
      title="Logic"
      description={
        classic ? (
          <>
            JavaScript: <span className="mono">function run(input)</span> returns <span className="mono">{'{ outputHandle, output, context }'}</span>.
          </>
        ) : (
          <>
            JavaScript: <span className="mono">function run({'{ config, request, context, shipment }'})</span> — return the result.
          </>
        )
      }
      actions={
        !classic && (
          <Button size="sm" variant="ghost" icon={Wand2} onClick={onGenerate} title="Write a run() skeleton from your settings, result fields and branches">
            Generate starter code
          </Button>
        )
      }
    >
      <div className="cn-logic">
        <CodeEditor ref={editorRef} value={spec.code} onChange={onCodeChange} label="Node logic (JavaScript)" />
        <CodeReference groups={groups} onInsert={onInsert} />
      </div>
      <p className="muted small cn-footnote">
        Runs in an isolated sandbox: no network, files or timers; 1 s and 16 MB per run. To call an API, return the data and add an{' '}
        <strong>HTTP request</strong> step after this node that uses it. ⌘/Ctrl+Enter tests · ⌘/Ctrl+S saves.
      </p>
    </Section>
  );
}
