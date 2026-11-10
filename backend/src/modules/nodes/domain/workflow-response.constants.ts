/** Headers a workflow may not set: the server owns framing and connection handling. */
export const FORBIDDEN_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'upgrade', 'host', 'trailer']);

export const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;
