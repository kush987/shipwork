import type { ApiEndpoint, EndpointInput } from '../../api/types';
import type { SnippetKind } from './endpoints.types';
import type { SegmentedOption } from '../../components/Segmented.types';

export const API_KEY_PLACEHOLDER = '<YOUR_API_KEY>';
export const TOKEN_PLACEHOLDER = '<TOKEN>';

/** Tab labels of the code samples, in display order. */
export const SNIPPET_LABELS: Record<SnippetKind, string> = {
  curl: 'curl',
  fetch: 'JavaScript',
};

export const BLANK_ENDPOINT: EndpointInput = { name: '', method: 'POST', path: '', mode: 'sync', auth: 'none' };

export const MODE_OPTIONS: SegmentedOption<ApiEndpoint['mode']>[] = [
  { value: 'sync', label: 'Sync' },
  { value: 'async', label: 'Async' },
];

export const AUTH_OPTIONS: SegmentedOption<ApiEndpoint['auth']>[] = [
  { value: 'none', label: 'Public' },
  { value: 'api_key', label: 'API key' },
  { value: 'jwt', label: 'Sign-in (JWT)' },
];

/** How an endpoint's auth reads in lists. */
export const AUTH_LABEL: Record<ApiEndpoint['auth'], string> = { none: 'Public', api_key: 'API key', jwt: 'Sign-in (JWT)' };

export const MODE_HELP: Record<ApiEndpoint['mode'], string> = {
  sync: 'Waits for the workflow and returns its “Return response” step.',
  async: 'Answers 202 with an executionId at once and runs the workflow in the background — callers never get its “Return response”. Use Sync for APIs that return data.',
};

export const AUTH_HELP: Record<ApiEndpoint['auth'], string> = {
  none: 'Anyone with the URL can call it.',
  api_key: 'Callers send x-api-key (or Authorization: Bearer) with a key from API keys.',
  jwt: 'Your app’s signed-in users send Authorization: Bearer <token>; the sign-in provider checks it. The workflow reads the user as request.auth.',
};

/** Bounds of "cache authorizer decisions" (seconds). */
export const AUTHORIZER_CACHE = { min: 0, max: 300 };

/** sessionStorage key of the API key typed into "Try it" (this tab only). */
export const TRY_API_KEY_STORAGE_KEY = 'shipflow-try-api-key';
/** sessionStorage key of the sign-in token typed into "Try it" (this tab only). */
export const TRY_TOKEN_STORAGE_KEY = 'shipflow-try-token';
