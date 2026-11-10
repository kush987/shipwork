export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  /** Accessible name of the group. */
  label: string;
  disabled?: boolean;
}
