export const DEFAULT_TIMEOUT_MS = 1_000;

export const DEFAULT_MEMORY_BYTES = 16 * 1024 * 1024;

export const MAX_STACK_BYTES = 512 * 1024;

/** `check()` only compiles the code and reads `typeof run`, so it gets a short budget. */
export const CHECK_TIMEOUT_MS = 250;

export const MAX_LOG_LINES = 50;

export const MAX_LOG_LINE = 2_000;

export const MAX_RESULT_BYTES = 256 * 1024;

export const TIMEOUT_MESSAGE = 'Timed out — the code ran longer than allowed';

export const MISSING_RUN_MESSAGE = 'Code must define `function run(input) { … }`';
