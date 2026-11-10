import type { Execution } from '../api/types';
import type { ListControls } from './list/list.types';

export interface ExecutionsTableProps {
  executions: Execution[];
  compact?: boolean;
  /** Makes the headers sort this list (the Executions page); without it they are plain labels. */
  list?: ListControls<Execution>;
}
