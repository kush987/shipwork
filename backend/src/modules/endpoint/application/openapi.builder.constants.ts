export const ERROR_SCHEMA_REF = { $ref: '#/components/schemas/Error' };

export const RETRY_AFTER_HEADER = { 'Retry-After': { description: 'Seconds to wait before calling again', schema: { type: 'integer' } } };
