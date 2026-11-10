/** Basename of the worker entry; `.js` next to the compiled adapter, `.ts` in the sources. */
export const WORKER_ENTRY = 'sandbox.worker';

/**
 * Bootstrap for running the TypeScript worker entry straight from the sources (jest, ts-jest),
 * where no compiled `.js` exists: transpile each required `.ts` file on the fly with the
 * project's TypeScript, then load the entry. Production loads the compiled `.js` directly.
 */
export const TS_WORKER_BOOTSTRAP = `
const { readFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { workerData } = require('node:worker_threads');
const ts = require(require.resolve('typescript', { paths: [dirname(workerData.entry)] }));
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, experimentalDecorators: true },
  });
  module._compile(outputText, filename);
};
require(workerData.entry);
`;
