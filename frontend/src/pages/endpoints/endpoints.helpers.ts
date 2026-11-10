import type { ApiEndpoint, EndpointInput, EndpointUpdateInput, Workflow } from '../../api/types';
import { schemaProblems } from '../../components/SchemaFieldsEditor.helpers';
import { endpointUrl, methodHasBody, pathProblem, sampleFromSchema } from '../../lib/endpoints';
import { HTTP_TRIGGER_EVENT, RATE_LIMIT_MAX, RATE_LIMIT_MIN, TIMEOUT_DEFAULT, TIMEOUT_MAX, TIMEOUT_MIN } from '../../lib/endpoints.constants';
import { API_KEY_PLACEHOLDER, AUTHORIZER_CACHE, TOKEN_PLACEHOLDER } from './endpoints.constants';
import type { EndpointDraftRules, SnippetKind } from './endpoints.types';

// ---------------------------------------------------------------------------
// Draft validation
// ---------------------------------------------------------------------------

/** Why an endpoint draft can't be saved yet (first problem only), or undefined. */
export function endpointDraftProblem(v: EndpointInput, { workflowRequired }: EndpointDraftRules): string | undefined {
  if (!v.name.trim()) return 'Give the endpoint a name';
  const p = pathProblem(v.path);
  if (p) return `Path: ${p}`;
  if (workflowRequired && !v.workflowId) return 'Choose a workflow';
  if (v.auth === 'jwt' && !v.authProviderId) return 'Choose a sign-in provider for JWT authentication';
  return undefined;
}

/** Why the editor's draft can't be saved (first problem), or undefined. */
export function editorDraftProblem(d: EndpointUpdateInput): string | undefined {
  const basic = endpointDraftProblem(d, { workflowRequired: true });
  if (basic) return basic;
  const schema = schemaProblems(d.requestSchema ?? []);
  if (schema.length) return `Request schema: ${schema[0]}`;
  const t = d.timeoutMs ?? TIMEOUT_DEFAULT;
  if (d.mode !== 'async' && (t < TIMEOUT_MIN || t > TIMEOUT_MAX)) return 'Timeout must be between 1 and 30 seconds';
  const cache = d.authorizerCacheSeconds ?? 0;
  if (d.authorizerWorkflowId && (!Number.isInteger(cache) || cache < AUTHORIZER_CACHE.min || cache > AUTHORIZER_CACHE.max)) {
    return `Cache decisions for ${AUTHORIZER_CACHE.min}–${AUTHORIZER_CACHE.max} whole seconds`;
  }
  const limit = d.rateLimitPerMinute;
  if (limit !== null && limit !== undefined && (!Number.isInteger(limit) || limit < RATE_LIMIT_MIN || limit > RATE_LIMIT_MAX)) {
    return `Rate limit must be a whole number from ${RATE_LIMIT_MIN} to ${RATE_LIMIT_MAX.toLocaleString()} calls per minute`;
  }
  return undefined;
}

/** Explains whose calls the endpoint's own limit counts, for the editor. */
export const rateLimitHelp = (d: Pick<EndpointInput, 'auth' | 'rateLimitPerMinute'>) =>
  `Per ${d.auth === 'api_key' ? 'API key' : 'client IP'}; callers get 429 past it. ${
    d.rateLimitPerMinute ? '' : 'Empty: only the account-wide limits apply.'
  }`.trim();

/** Workflows an endpoint can use as its authorizer: API workflows other than its own; unpublished ones can't run yet. */
export const authorizerCandidates = (workflows: Workflow[] | undefined, ownWorkflowId: string | undefined) =>
  (workflows ?? []).filter((w) => w.triggerEvent === HTTP_TRIGGER_EVENT && w.id !== ownWorkflowId && w.status !== 'archived');

/** Text the endpoint list search matches against. */
export const endpointSearchText = (e: ApiEndpoint) => `${e.method} ${e.path} ${e.name} ${e.workflow?.name ?? ''}`.toLowerCase();

// ---------------------------------------------------------------------------
// Code snippets
// ---------------------------------------------------------------------------

/** URL with ':id' shown as '<id>' and, for GET / DELETE, the schema fields as query placeholders. */
function exampleUrl(ep: ApiEndpoint): string {
  const base = endpointUrl(ep).replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '<$1>');
  if (methodHasBody(ep.method) || !ep.requestSchema.length) return base;
  return `${base}?${ep.requestSchema.map((f) => `${f.key}=<${f.key}>`).join('&')}`;
}

const exampleBody = (ep: ApiEndpoint) => sampleFromSchema(ep.requestSchema);

export function curlSnippet(ep: ApiEndpoint): string {
  const lines = [`curl -X ${ep.method} '${exampleUrl(ep)}'`];
  if (methodHasBody(ep.method)) lines.push(`  -H 'content-type: application/json'`);
  if (ep.auth === 'api_key') lines.push(`  -H 'x-api-key: ${API_KEY_PLACEHOLDER}'`);
  if (ep.auth === 'jwt') lines.push(`  -H 'authorization: Bearer ${TOKEN_PLACEHOLDER}'`);
  if (methodHasBody(ep.method)) lines.push(`  -d '${JSON.stringify(exampleBody(ep))}'`);
  return lines.join(' \\\n');
}

export function fetchSnippet(ep: ApiEndpoint): string {
  const headers: string[] = [];
  if (methodHasBody(ep.method)) headers.push(`    'content-type': 'application/json',`);
  if (ep.auth === 'api_key') headers.push(`    'x-api-key': '${API_KEY_PLACEHOLDER}',`);
  if (ep.auth === 'jwt') headers.push(`    authorization: 'Bearer ${TOKEN_PLACEHOLDER}',`);
  const opts = [`  method: '${ep.method}',`];
  if (headers.length) opts.push('  headers: {', ...headers, '  },');
  if (methodHasBody(ep.method)) {
    const body = JSON.stringify(exampleBody(ep), null, 2).replace(/\n/g, '\n  ');
    opts.push(`  body: JSON.stringify(${body}),`);
  }
  return [`const res = await fetch('${exampleUrl(ep)}', {`, ...opts, '});', 'const data = await res.json();'].join('\n');
}

export const snippetFor = (kind: SnippetKind, ep: ApiEndpoint) => (kind === 'curl' ? curlSnippet(ep) : fetchSnippet(ep));

/** What the Status column shows: ready, switched off, or needs fixing. */
export const endpointStatusOf = (e: ApiEndpoint) => (e.ready ? 'ready' : !e.enabled ? 'disabled' : 'issues');
