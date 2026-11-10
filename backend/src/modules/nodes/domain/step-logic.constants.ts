/** Longest before()/after() code a step may carry. */
export const MAX_STEP_LOGIC_LENGTH = 20_000;

export const STEP_LOGIC_HOOKS = ['before', 'after'] as const;

/** Run data key holding text that before() returned with `{{` in it (see protectLiterals). */
export const LITERALS_KEY = 'literals';

/** Steps that are code or the response themselves; logic belongs in them or the step before. */
export const NO_LOGIC_REASON: Record<string, string> = {
  'http.response': 'Return response sends its body as written — change the body, or add logic to the step before it',
  'code.run': 'Run code is code already — change its code instead',
};
export const NO_LOGIC_TRIGGER = 'Triggers start the workflow — add logic to the step after it';
export const NO_LOGIC_CUSTOM = 'Custom nodes are code already — use “Edit logic” on the custom node';

/**
 * Helpers the hooks can call. Like custom nodes, they only record what the code asked for; the host
 * reads the record after the hook returns, so the sandbox still can't reach anything.
 */
const PRELUDE = `var __wf = { branch: null, respond: null };
function branch(id, result) { __wf.branch = String(id); return result; }
function respond(status, body, headers) {
  __wf.respond = { status: status, body: body === undefined ? null : body, headers: headers || {} };
  return undefined;
}
function fail(message) { throw new Error(message === undefined ? 'Failed' : String(message)); }
`;

/**
 * The user's code runs in a function scope; the sandbox calls the global `run`, which calls their
 * before()/after() and returns { value, keep, branch, respond }. `keep` means "returned nothing".
 */
export const wrapStepLogic = (code: string, hook: (typeof STEP_LOGIC_HOOKS)[number]) => `${PRELUDE}
var run = (function () {
${code}
;return typeof ${hook} === 'function'
  ? function (input) {
      __wf.branch = null;
      __wf.respond = null;
      var value = ${hook}(input);
      return { value: value === undefined ? null : value, keep: value === undefined, branch: __wf.branch, respond: __wf.respond };
    }
  : undefined;
})();`;
