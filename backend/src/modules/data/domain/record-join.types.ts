/**
 * Attaches related records to each record of a list, like a left join: every record keeps its place and
 * gets the match (or null / an empty list) under `as`.
 */
export interface JoinSpec {
  /** A collection or built-in data (`system.shipments`) to read the related records from. */
  from: string;
  /** The field of each record holding the key. Dotted paths reach into objects; a list holds several keys. */
  localField: string;
  /** The field of the related records the key must equal. */
  foreignField: string;
  /** The field the match is attached under. */
  as: string;
  /** Every match as a list, instead of the newest one (or null). */
  many: boolean;
}

/** What one join did, for the step's output on Executions. */
export interface JoinSummary {
  as: string;
  from: string;
  /** Distinct keys looked up. */
  keys: number;
  /** Records that got at least one match. */
  matched: number;
  /** Some matches may be missing: a key has more related records than one lookup reads. */
  truncated?: true;
}
