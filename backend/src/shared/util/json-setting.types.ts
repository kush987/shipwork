export interface JsonSettingSpec {
  key: string;
  label: string;
  /** 'object' requires a JSON object; 'any' accepts any JSON value. */
  shape?: 'object' | 'any';
}
