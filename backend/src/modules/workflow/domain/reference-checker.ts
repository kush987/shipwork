/** A select holds one value, a multiselect many; blanks are left to the `required` check. */
export const referencedValues = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw : [raw]).filter((v): v is string => typeof v === 'string' && v !== '');
