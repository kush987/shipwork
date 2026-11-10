import { apiVersionOf } from '../domain/custom-node';
import type { CustomNodeApiVersion } from '../domain/custom-node.types';
import { classicFormat } from './classic-format';
import { simpleFormat } from './simple-format';
import type { ResultFormat, RunnableSpec } from './result-format.types';

/** Format registry: a new format is a new entry here (Open/Closed); runners never branch on versions. */
const RESULT_FORMATS: Record<CustomNodeApiVersion, ResultFormat> = { 1: classicFormat, 2: simpleFormat };

export const resultFormatOf = (spec: Pick<RunnableSpec, 'apiVersion'>): ResultFormat => RESULT_FORMATS[apiVersionOf(spec)];
