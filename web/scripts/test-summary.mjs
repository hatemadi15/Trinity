// Counts the automated tests on both sides and writes public/validation/tests.json for the Validate page badge.
// Run from web/: `npm run validation:tests` (needs uv for the Python count).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const pipeline = resolve(web, '..', 'pipeline');

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
}

const report = resolve(web, '.vitest', 'report.json');
mkdirSync(resolve(web, '.vitest'), { recursive: true });
run('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${report}`], web);
const vitest = JSON.parse(readFileSync(report, 'utf8'));
const webFiles = vitest.testResults?.length ?? 0; // one entry per test file
const webTests = vitest.numTotalTests ?? 0;

let pipelineTests = 0;
try {
  const out = run('uv', ['run', 'pytest', '--collect-only', '-q'], pipeline);
  pipelineTests = out.split('\n').filter((l) => /^tests\/.+::/.test(l.trim())).length;
} catch (err) {
  console.warn('pytest collection failed; leaving the pipeline count at 0', err instanceof Error ? err.message : err);
}

const doc = { generated_utc: new Date().toISOString().slice(0, 19) + 'Z', web: { files: webFiles, tests: webTests }, pipeline: { tests: pipelineTests } };
mkdirSync(resolve(web, 'public', 'validation'), { recursive: true });
writeFileSync(resolve(web, 'public', 'validation', 'tests.json'), JSON.stringify(doc, null, 1) + '\n');
console.log(JSON.stringify(doc));
