/** Where each query field lives in a stored document, and how its values are stored. */
export interface MongoFieldMapping {
  path(field: string): string;
  /** Converts a query value to its stored form (e.g. ISO text → Date for date fields). */
  value(field: string, value: unknown): unknown;
}
