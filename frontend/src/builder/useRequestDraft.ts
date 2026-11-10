import { useEffect, useState } from 'react';
import type { ApiEndpoint, HttpMethod, TestRequest } from '../api/types';
import { methodHasBody, pathParams, resolvePath, sampleFromSchema } from '../lib/endpoints';
import { useJsonText } from '../lib/useJsonText';
import type { RequestDraft } from './builder.types';

/** Form state of a simulated API call, prefilled from the endpoint bound to the workflow (when there is one). */
export function useRequestDraft(endpoint: ApiEndpoint | undefined): RequestDraft {
  const [method, setMethod] = useState<HttpMethod>('POST');
  const [path, setPath] = useState('/');
  const params = useJsonText({}, { expect: 'object' });
  const query = useJsonText({}, { expect: 'object' });
  const body = useJsonText({}, { expect: 'any' });

  const prefill = (e: ApiEndpoint) => {
    setMethod(e.method);
    setPath(e.path);
    params.reset(Object.fromEntries(pathParams(e.path).map((p) => [p, ''])));
    const sample = sampleFromSchema(e.requestSchema);
    query.reset(methodHasBody(e.method) ? {} : sample);
    body.reset(methodHasBody(e.method) ? sample : '');
  };

  // Prefill once per bound endpoint (it loads after the modal opens).
  const endpointId = endpoint?.id;
  useEffect(() => {
    if (endpoint) prefill(endpoint);
  }, [endpointId]); // keyed by id on purpose: a refetch must not overwrite what the user typed

  const build = (): TestRequest => {
    const p = Object.fromEntries(Object.entries((params.value as Record<string, unknown>) ?? {}).map(([k, v]) => [k, String(v ?? '')]));
    return {
      method,
      path: resolvePath(path.trim() || '/', p),
      params: p,
      query: (query.value as Record<string, unknown>) ?? {},
      ...(methodHasBody(method) && body.value !== undefined ? { body: body.value } : {}),
    };
  };

  return { method, setMethod, path, setPath, params, query, body, valid: params.valid && query.valid && body.valid, prefill, build };
}
