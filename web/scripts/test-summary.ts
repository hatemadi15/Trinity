// Runs the automated tests on both sides and writes public/validation/tests.json, which the Accuracy page reads: what
// passed, was skipped and failed in the app (vitest) and in the data pipeline (pytest, run, not only collected), when
// (UTC), on which commit and whether the tree had other changes, and which data was there (check-data).
// Run from web/: `npm run validation:tests` (needs uv for the pipeline). Arguments after `--` go to vitest, for example
// `npm run validation:tests -- --maxWorkers=2` on a computer with few cores.
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentity, dataParts, pytestCounts, vitestCounts, type CheckData, type TestRun } from '../src/lib/report/testRun';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pipeline = resolve(web, '..', 'pipeline');
// On Windows npx and uv are found through the shell; paths are kept relative and free of spaces for it.
const shell = process.platform === 'win32';

function run(cmd: string, args: string[], cwd: string, options: Partial<SpawnSyncOptionsWithStringEncoding> = {}) {
  return spawnSync(cmd, args, { cwd, shell, maxBuffer: 64 * 1024 * 1024, ...options, encoding: 'utf8' });
}

const started = new Date();
// The commit and the tree as they are before the run, which rewrites the report.
const build = buildIdentity(run('git', ['rev-parse', 'HEAD'], web).stdout ?? '', run('git', ['status', '--porcelain'], web).stdout ?? '');

// The data during the run, as check-data finds it (it exits 1 when a required part is missing, with its report all the same).
let check: CheckData | null = null;
const checked = run('uv', ['run', 'python', '-m', 'lunar_pipeline.cli', 'check-data', '--json'], pipeline);
try {
  check = JSON.parse(checked.stdout ?? '') as CheckData;
} catch {
  console.warn('check-data did not run (is uv installed?); the report leaves the data out');
}

mkdirSync(resolve(web, '.vitest'), { recursive: true });
const vitestReport = resolve(web, '.vitest', 'report.json');
rmSync(vitestReport, { force: true });
console.log('Running the app’s tests (vitest)…');
const t0 = Date.now();
run('npx', ['vitest', 'run', '--reporter=json', '--outputFile=.vitest/report.json', ...process.argv.slice(2)], web, { stdio: 'ignore' });
if (!existsSync(vitestReport)) {
  console.error('vitest wrote no report; run `npx vitest run` to see why');
  process.exit(1);
}
const webCounts = { ...vitestCounts(JSON.parse(readFileSync(vitestReport, 'utf8'))), seconds: Math.round((Date.now() - t0) / 1000) };

console.log('Running the data pipeline’s tests (pytest)…');
const pytestXml = resolve(web, '.vitest', 'pytest.xml');
rmSync(pytestXml, { force: true });
run('uv', ['run', 'pytest', '-q', '-p', 'no:cacheprovider', '--junitxml=../web/.vitest/pytest.xml'], pipeline, { stdio: 'ignore' });
const pipelineCounts = existsSync(pytestXml) ? pytestCounts(readFileSync(pytestXml, 'utf8')) : null;
if (!pipelineCounts) console.warn('pytest did not run (is uv installed?); the report says so');

const doc: TestRun = {
  generated_utc: started.toISOString().slice(0, 19) + 'Z',
  build,
  web: webCounts,
  pipeline: pipelineCounts,
  data: dataParts(check),
  node: process.version,
};
mkdirSync(resolve(web, 'public', 'validation'), { recursive: true });
writeFileSync(resolve(web, 'public', 'validation', 'tests.json'), JSON.stringify(doc, null, 1) + '\n');
console.log(JSON.stringify(doc));
const failed = webCounts.failed + (pipelineCounts?.failed ?? 0);
if (failed > 0) {
  console.error(`${failed} tests failed: the report says so. Run npx vitest run and uv run pytest -q to see them.`);
  process.exit(1);
}
