import type { LucideIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import type {
  ConfigField,
  CustomNode,
  CustomNodeDetail,
  CustomNodeSpec,
  CustomNodeTemplate,
  CustomNodeTestResult,
  EventOption,
  FieldSpec,
  NodeOutput,
  StepLogic,
} from '../../api/types';
import type { CodeEditorHandle } from '../../components/CodeEditor.types';
import type { JsonText } from '../../lib/json.types';

/** Route params of /custom-nodes/:id ('new' while creating). */
export interface CustomNodeRouteParams extends Record<string, string> {
  id: string;
}

/** Setting types a custom node can use. */
export type SettingKind = Exclude<ConfigField['kind'], 'code'>;

/** Where a dropdown gets its options: a fixed list ('') or events loaded by the builder. */
export type OptionSource = '' | 'events' | 'custom-events';

export interface SettingKindChoice {
  value: SettingKind;
  label: string;
  icon: LucideIcon;
  hint: string;
}

export type SettingOption = NonNullable<ConfigField['options']>[number];

/**
 * Names that existing workflows depend on: setting keys (their stored values) and branch ids (their connections).
 * They come from the saved version and never change by themselves when a label is edited.
 */
export interface LockedNames {
  settingKeys: string[];
  branchIds: string[];
  /** The node was saved with a result name, so renaming the node doesn't rename the result. */
  resultName: boolean;
}

/** Something the code reference types into the editor. */
export interface CodeSnippet {
  label: string;
  insert: string;
  meta?: string;
  title?: string;
}

export interface SnippetGroup {
  title: string;
  hint?: string;
  items: CodeSnippet[];
}

/** Sample data a test run reads besides the settings. */
export interface SampleData {
  request: unknown;
  shipment: unknown;
  context: Record<string, unknown>;
  trigger: { event: string };
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface SectionProps {
  step: number;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export interface TemplatePickerProps {
  templates: CustomNodeTemplate[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onPick: (id: string) => void;
  /** Shown above the cards, e.g. when a template in the URL no longer exists. */
  notice?: string;
}

export interface EditorTopBarProps {
  spec: CustomNodeSpec;
  node: CustomNode | undefined;
  isNew: boolean;
  dirty: boolean;
  saving: boolean;
  testing: boolean;
  archiving: boolean;
  onBack: () => void;
  onChangeTemplate?: () => void;
  onTest: () => void;
  onSave: () => void;
  onArchive: () => void;
}

export interface ClassicBannerProps {
  onSwitch: () => void;
}

export interface BasicsSectionProps {
  spec: CustomNodeSpec;
  onLabelChange: (label: string) => void;
  onChange: (patch: Partial<CustomNodeSpec>) => void;
}

export interface SettingsSectionProps {
  settings: ConfigField[];
  onChange: (next: ConfigField[]) => void;
  events: EventOption[];
  lockedKeys: string[];
  classic: boolean;
}

export interface SettingCardProps {
  setting: ConfigField;
  index: number;
  count: number;
  open: boolean;
  problems: string[];
  events: EventOption[];
  /** The key is stored by existing workflows: it doesn't follow label edits. */
  keyLocked: boolean;
  onToggle: () => void;
  onChange: (next: ConfigField) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export interface OptionsEditorProps {
  options: SettingOption[];
  onChange: (next: SettingOption[]) => void;
}

export interface OutputSectionProps {
  spec: CustomNodeSpec;
  locked: LockedNames;
  classic: boolean;
  onChange: (patch: Partial<CustomNodeSpec>) => void;
  onInsert: (code: string) => void;
}

export interface ResultEditorProps {
  resultName: string;
  resultSchema: FieldSpec[];
  onChange: (patch: Partial<CustomNodeSpec>) => void;
}

export interface BranchesEditorProps {
  branches: NodeOutput[];
  lockedIds: string[];
  classic: boolean;
  errorBranch: boolean;
  onChange: (patch: Partial<CustomNodeSpec>) => void;
  onInsert: (code: string) => void;
}

export interface LogicSectionProps {
  spec: CustomNodeSpec;
  classic: boolean;
  onCodeChange: (code: string) => void;
  editorRef: Ref<CodeEditorHandle>;
  onInsert: (code: string) => void;
  onGenerate: () => void;
}

export interface CodeReferenceProps {
  groups: SnippetGroup[];
  onInsert: (code: string) => void;
}

export interface TestSectionProps {
  spec: CustomNodeSpec;
  classic: boolean;
  events: EventOption[];
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
  sample: JsonText;
  onResetSample: () => void;
  result: CustomNodeTestResult | null;
  running: boolean;
  onRun: () => void;
}

export interface TestResultViewProps {
  result: CustomNodeTestResult | null;
  running: boolean;
  spec: CustomNodeSpec;
  classic: boolean;
  /** Where the result is saved in this test (the form's "Save result as"). */
  saveAs: string;
}

export interface VersionHistoryProps {
  detail: CustomNodeDetail;
}

export type NodesTab = 'custom' | 'builtin';

export interface BuiltinNodeForm {
  label: string;
  description: string;
  /** Empty: the app's own icon. */
  icon: string;
  /** Only the settings whose default differs from the app's. */
  defaults: Record<string, unknown>;
  logic: StepLogic;
}
