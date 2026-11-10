import type { Workflow } from '../../api/types';

/** The workflow being copied. */
export type DuplicateWorkflowSource = Pick<Workflow, 'id' | 'name' | 'description'>;

export interface DuplicateWorkflowModalProps {
  /** Workflow to copy; the modal is closed while this is null. */
  source: DuplicateWorkflowSource | null;
  onClose: () => void;
  /** Copy this version instead of the working one (the draft, else the published version). */
  version?: number;
  /** Extra hint shown above the form, e.g. that unsaved changes aren't included. */
  note?: string;
}
