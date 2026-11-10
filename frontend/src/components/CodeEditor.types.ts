export interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  /** Accessible name of the textarea. */
  label?: string;
}

/** Imperative handle: lets a reference panel or snippet button type into the editor. */
export interface CodeEditorHandle {
  /** Inserts text at the cursor (replacing any selection) and focuses the editor. */
  insert: (text: string) => void;
  focus: () => void;
}
