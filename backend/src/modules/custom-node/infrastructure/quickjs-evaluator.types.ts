/** What `check()` reports: whether the code compiles and defines a callable `run`. */
export type CheckResult = { ok: true } | { ok: false; error: string };
