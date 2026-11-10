import type { DatabaseSwitchInput, DatabaseTest, WorkspaceDatabase } from '../../api/types';

/** Where a switch moves the workspace's business data, as the confirmation describes it. */
export type SwitchTarget = { kind: 'external'; databaseName: string; host: string } | { kind: 'managed' };

export interface SwitchConfirmModalProps {
  open: boolean;
  target: SwitchTarget | null;
  current: WorkspaceDatabase;
  copyData: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}

export interface DatabaseOverviewProps {
  database: WorkspaceDatabase;
}

export interface OwnerCardProps {
  database: WorkspaceDatabase;
  workspaceName: string;
}

export interface CopyDataOptionProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The target already holds this workspace's data: copying would fail, so the option is off. */
  targetHasData?: boolean;
  disabled?: boolean;
}

export interface ConnectionStringInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export interface TestResultBoxProps {
  result: DatabaseTest | null;
  /** A request error (e.g. 422 for a blocked host) shown like a failed test. */
  error: unknown;
}

export type SwitchDatabase = (input: DatabaseSwitchInput) => void;
