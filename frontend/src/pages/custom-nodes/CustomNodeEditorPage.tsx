import { useMutation } from '@tanstack/react-query';
import { pick } from 'lodash-es';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { CustomNodeSpec, CustomNodeTestResult } from '../../api/types';
import type { CodeEditorHandle } from '../../components/CodeEditor.types';
import { ErrorState, Skeleton } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { errorMessages } from '../../lib/errors';
import { useJsonText } from '../../lib/useJsonText';
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard';
import { BasicsSection } from './BasicsSection';
import { ClassicBanner } from './ClassicBanner';
import { SAMPLE_TRIGGER } from './customNodes.constants';
import {
  builderFields,
  defaultResultName,
  followsLabel,
  isClassic,
  lockedNamesOf,
  sampleData,
  starterCode,
  testDefaults,
  toEditableSpec,
  toSaveableSpec,
  toSimpleFormat,
} from './customNodes.helpers';
import type { CustomNodeRouteParams, LockedNames, SampleData } from './customNodes.types';
import { EditorTopBar } from './EditorTopBar';
import { useArchiveCustomNode, useCustomNode, useCustomNodeTemplates, useEditorShortcuts, useEventOptions, useRefreshCustomNodes } from './hooks';
import { LogicSection } from './LogicSection';
import { OutputSection } from './OutputSection';
import { SettingsSection } from './SettingsSection';
import { TemplatePicker } from './TemplatePicker';
import { TestSection } from './TestSection';
import { VersionHistory } from './VersionHistory';

export function CustomNodeEditorPage() {
  const { id } = useParams<CustomNodeRouteParams>();
  const isNew = !id || id === 'new';
  const [params, setParams] = useSearchParams();
  const templateId = isNew ? params.get('template') : null;
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshCustomNodes();

  const templates = useCustomNodeTemplates(isNew);
  const existing = useCustomNode(id ?? '', !isNew);
  const events = useEventOptions().data ?? [];
  const archive = useArchiveCustomNode(id ?? '');

  const [spec, setSpec] = useState<CustomNodeSpec | null>(null);
  /** JSON of the saved version (or the untouched template): the editor is dirty when the spec differs. */
  const [baseline, setBaseline] = useState('');
  const [locked, setLocked] = useState<LockedNames>(() => lockedNamesOf(null));
  const [errors, setErrors] = useState<string[]>([]);
  const [testValues, setTestValues] = useState<Record<string, unknown>>({});
  const [testResult, setTestResult] = useState<CustomNodeTestResult | null>(null);
  const [initialSample] = useState(sampleData);
  const sample = useJsonText(initialSample, { expect: 'object', allowEmpty: false });
  const editorRef = useRef<CodeEditorHandle>(null);

  // Load once per node or template; later refetches (after a save) don't clobber edits.
  const template = templates.data?.find((t) => t.id === templateId);
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const source = isNew ? template?.spec : existing.data?.node;
    const key = isNew ? `new:${templateId}` : id!;
    if (!source || loadedFor.current === key) return;
    loadedFor.current = key;
    const next = toEditableSpec(source);
    setSpec(next);
    setBaseline(JSON.stringify(next));
    setLocked(lockedNamesOf(isNew ? null : next));
    setErrors([]);
    setTestValues({});
    setTestResult(null);
  }, [isNew, id, templateId, template, existing.data]);

  const classic = !!spec && isClassic(spec);
  const dirty = !!spec && JSON.stringify(spec) !== baseline;
  const node = existing.data?.node;

  // The test uses the settings form's values, falling back to each setting's default.
  const fields = useMemo(() => (spec ? builderFields(spec) : []), [spec]);
  const testConfig = useMemo(
    () => ({ ...testDefaults(fields, events), ...pick(testValues, fields.map((f) => f.key)) }),
    [fields, events, testValues],
  );

  const save = useMutation({
    mutationFn: () => {
      const body = toSaveableSpec(spec!);
      return isNew ? api.createCustomNode(body) : api.updateCustomNode(id!, body);
    },
    onSuccess: (n) => {
      const saved = toEditableSpec(n);
      setErrors([]);
      setSpec(saved);
      setBaseline(JSON.stringify(saved));
      setLocked(lockedNamesOf(saved));
      refresh(n);
      toast.success(isNew ? 'Custom node created' : `Saved as v${n.latestVersion}`, 'It is in the workflow builder palette under “Custom”.');
      if (isNew) {
        loadedFor.current = n.id;
        navigate(`/custom-nodes/${n.id}`, { replace: true });
      }
    },
    onError: (e: Error) => {
      const list = errorMessages(e);
      setErrors(list);
      toast.error('Could not save', list[0]);
    },
  });

  const test = useMutation({
    mutationFn: () => {
      if (!sample.valid) throw new Error(`Sample data: ${sample.error}`);
      const data = sample.value as Partial<SampleData>;
      const { code, outputs, apiVersion, resultSchema } = toSaveableSpec(spec!);
      return api.testCustomNode({
        code,
        outputs,
        apiVersion,
        resultSchema,
        input: {
          config: testConfig,
          request: data.request ?? null,
          shipment: data.shipment ?? null,
          context: data.context ?? {},
          trigger: data.trigger ?? SAMPLE_TRIGGER,
        },
      });
    },
    onSuccess: setTestResult,
    onError: (e: Error) => setTestResult({ ok: false, error: errorMessages(e).join(' · '), logs: [], durationMs: 0 }),
  });

  useUnsavedChangesGuard(dirty, { allowNavigation: save.isPending });
  useEditorShortcuts({
    save: () => spec && (isNew || dirty) && !save.isPending && save.mutate(),
    test: () => spec && !test.isPending && test.mutate(),
  });

  const patch = (p: Partial<CustomNodeSpec>) => setSpec((s) => (s ? { ...s, ...p } : s));
  const setLabel = (label: string) =>
    setSpec((s) => {
      if (!s) return s;
      // The result name follows the node's name until edited (or once the node is saved with one).
      const follows = !isClassic(s) && !locked.resultName && followsLabel(s.resultName, s.label, defaultResultName);
      return { ...s, label, ...(follows ? { resultName: defaultResultName(label) } : {}) };
    });
  const insert = (code: string) => editorRef.current?.insert(code);
  const generate = () => {
    if (spec!.code.trim() && !confirm('Replace the current code with starter code generated from your settings, result fields and branches?')) return;
    patch({ code: starterCode(spec!) });
  };
  const switchToSimple = () => {
    setSpec(toSimpleFormat(spec!));
    toast.info(
      'Switched to the simple format',
      "Now update run(): return the result instead of { outputHandle, output, context }, and pick a branch with branch('id'). Saving creates a new version.",
    );
  };
  const pickTemplate = (templateKey: string) => setParams({ template: templateKey });
  const backToTemplates = () => {
    if (dirty && !confirm('Discard your changes and pick another template?')) return;
    loadedFor.current = null;
    setParams({});
  };

  // ---- New node: pick a template first -------------------------------------------------------------
  if (isNew && (!templateId || (templates.data && !template))) {
    return (
      <div className="cn-page">
        <header className="cn-topbar">
          <button className="icon-btn" aria-label="Back to custom nodes" onClick={() => navigate('/custom-nodes')}>
            <ArrowLeft size={16} />
          </button>
          <div className="cn-title">
            <h1>New custom node</h1>
            <div className="cn-sub">Your own workflow step, with its own settings, branches and logic</div>
          </div>
        </header>
        <div className="cn-scroll">
          <TemplatePicker
            templates={templates.data}
            loading={templates.isLoading}
            error={templates.error}
            onRetry={() => templates.refetch()}
            onPick={pickTemplate}
            notice={templateId ? `The template “${templateId}” doesn’t exist any more — pick another one.` : undefined}
          />
        </div>
      </div>
    );
  }

  const loadError = isNew ? templates.error : existing.error;
  if (loadError && !spec) {
    return (
      <div className="page">
        <ErrorState error={loadError} onRetry={() => (isNew ? templates.refetch() : existing.refetch())} />
      </div>
    );
  }
  if (!spec) {
    return (
      <div className="page">
        <Skeleton h={28} w="30%" />
        <div style={{ height: 16 }} />
        <Skeleton h={480} />
      </div>
    );
  }

  return (
    <div className="cn-page">
      <EditorTopBar
        spec={spec}
        node={node}
        isNew={isNew}
        dirty={dirty}
        saving={save.isPending}
        testing={test.isPending}
        archiving={archive.isPending}
        onBack={() => navigate('/custom-nodes')}
        onChangeTemplate={isNew ? backToTemplates : undefined}
        onTest={() => test.mutate()}
        onSave={() => save.mutate()}
        onArchive={() => node && archive.mutate(node.archived)}
      />
      {classic && <ClassicBanner onSwitch={switchToSimple} />}
      {errors.length > 0 && (
        <div className="cn-errors" role="alert">
          <strong>Fix these before saving:</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cn-body">
        <div className="cn-col">
          <BasicsSection spec={spec} onLabelChange={setLabel} onChange={patch} />
          <SettingsSection
            settings={spec.configSchema}
            onChange={(configSchema) => patch({ configSchema })}
            events={events}
            lockedKeys={locked.settingKeys}
            classic={classic}
          />
          <OutputSection spec={spec} locked={locked} classic={classic} onChange={patch} onInsert={insert} />
          {existing.data && <VersionHistory detail={existing.data} />}
        </div>
        <div className="cn-col">
          <LogicSection
            spec={spec}
            classic={classic}
            onCodeChange={(code) => patch({ code })}
            editorRef={editorRef}
            onInsert={insert}
            onGenerate={generate}
          />
          <TestSection
            spec={spec}
            classic={classic}
            events={events}
            config={testConfig}
            onConfigChange={(key, value) => setTestValues((v) => ({ ...v, [key]: value }))}
            sample={sample}
            onResetSample={() => sample.reset(sampleData())}
            result={testResult}
            running={test.isPending}
            onRun={() => test.mutate()}
          />
        </div>
      </div>
    </div>
  );
}
