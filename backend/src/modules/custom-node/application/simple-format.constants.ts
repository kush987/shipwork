/**
 * Helpers every simple-format node can call. They only record what the code asked for; the host
 * reads the record after `run()` returns, so the sandbox still has no way to reach anything.
 */
export const SIMPLE_PRELUDE = `var __wf = { branch: null, emits: [] };
function branch(id, result) { __wf.branch = String(id); return result; }
function emit(event, payload) {
  __wf.emits.push(event !== null && typeof event === 'object' ? event : { event: event, payload: payload });
}
function fail(message) { throw new Error(message === undefined ? 'Failed' : String(message)); }
`;

/**
 * The user's code runs inside a function scope so its own \`run\` stays private; the global \`run\`
 * becomes a wrapper that resets the record, calls it, and returns { value, branch, emits }. When the
 * code defines no run(), the global stays undefined, which the sandbox's check() reports.
 */
export const wrapUserCode = (code: string) => `${SIMPLE_PRELUDE}
var run = (function () {
${code}
;return typeof run === 'function'
  ? function (input) {
      __wf.branch = null;
      __wf.emits = [];
      var value = run(input);
      return { value: value === undefined ? null : value, branch: __wf.branch, emits: __wf.emits };
    }
  : undefined;
})();`;
