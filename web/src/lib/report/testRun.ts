/**
 * The automated tests' last run as `npm run validation:tests` records it in public/validation/tests.json, and the
 * Accuracy page's words for it. The script (scripts/test-summary.ts) runs the tests and reads their reports with the
 * functions here, so what the page says is what the run found: what passed, was skipped and failed on each side, when
 * (UTC), on which commit, and which data was there.
 */

export interface TestCounts {
  tests: number;
  passed: number;
  skipped: number;
  failed: number;
  seconds?: number;
}

export interface TestRun {
  /** When the run started, UTC. */
  generated_utc: string;
  /** The commit the tests ran on, and whether the tree had other changes then (the report itself aside). */
  build: { commit: string | null; dirty: boolean; changed: number };
  web: TestCounts & { files: number };
  /** Null when the pipeline's tests could not run (no uv). */
  pipeline: TestCounts | null;
  /** The data during the run: each part of web/public/data by check-data, and the downloads the pipeline's tests read. */
  data: { version: string | null; parts: Record<string, string> | null; downloads: Record<string, boolean> | null };
  node?: string;
}

/** The fields of vitest's JSON report that count tests (it follows Jest's), one entry of testResults per test file. */
export interface VitestReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests?: number;
  testResults?: unknown[];
}

export function vitestCounts(r: VitestReport): TestRun['web'] {
  return { files: r.testResults?.length ?? 0, tests: r.numTotalTests, passed: r.numPassedTests, skipped: r.numPendingTests + (r.numTodoTests ?? 0), failed: r.numFailedTests };
}

/** The counts on pytest's JUnit report (`--junitxml`), which it writes only for tests it ran; an error counts as a failure. */
export function pytestCounts(xml: string): TestCounts | null {
  const suite = /<testsuite\b[^>]*>/.exec(xml)?.[0];
  if (!suite) return null;
  const n = (name: string) => Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(suite)?.[1] ?? 0);
  const tests = n('tests'), skipped = n('skipped'), failed = n('failures') + n('errors');
  return { tests, passed: tests - skipped - failed, skipped, failed, seconds: n('time') };
}

/** The report the run rewrites: a change to it alone does not make the tree dirty. */
export const REPORT_PATH = 'web/public/validation/tests.json';

/** `git rev-parse HEAD` and `git status --porcelain`, as they print; empty when the copy has no git. */
export function buildIdentity(head: string, porcelain: string): TestRun['build'] {
  const changed = porcelain
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => line.slice(3).trim() !== REPORT_PATH).length;
  const commit = head.trim();
  return { commit: /^[0-9a-f]{7,64}$/.test(commit) ? commit : null, dirty: changed > 0, changed };
}

/** What `check-data --json` reports, as far as the test report needs it. */
export interface CheckData {
  data_version: string;
  groups: { id: string; state: string }[];
  sources?: Record<string, boolean>;
}

export function dataParts(check: CheckData | null): TestRun['data'] {
  if (!check) return { version: null, parts: null, downloads: null };
  return { version: check.data_version, parts: Object.fromEntries(check.groups.map((g) => [g.id, g.state])), downloads: check.sources ?? null };
}

const PART_NAMES: Record<string, string> = { core: 'the site data', sky: 'the sky', validation: 'the check tables', tiles: 'the height tiles', terrain: 'the terrain', fixtures: 'the test fixtures' };
const DOWNLOAD_NAMES: Record<string, string> = { kernels: 'the kernels', lola: 'the LOLA heights', illumination: 'the illumination maps' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const count = (n: number) => n.toLocaleString('en-US');
const either = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);
const both = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

function dayText(iso: string, withTime: boolean): string {
  const d = new Date(iso);
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withTime ? `${day} at ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC` : day;
}

const side = (c: TestCounts) => `${count(c.passed)} passed, ${count(c.skipped)} skipped and ${count(c.failed)} failed`;

function dataSentence(data: TestRun['data']): string | null {
  if (!data.parts && !data.downloads) return null;
  const short = Object.entries(data.parts ?? {})
    .filter(([, state]) => state !== 'complete')
    .map(([id]) => PART_NAMES[id] ?? id);
  const app = !data.parts ? null : short.length === 0 ? 'all of the app’s data' : `the app’s data, but not all of ${either(short)}`;
  const entries = Object.entries(data.downloads ?? {});
  const have = entries.filter(([, ok]) => ok).map(([k]) => DOWNLOAD_NAMES[k] ?? k);
  const lack = entries.filter(([, ok]) => !ok).map(([k]) => DOWNLOAD_NAMES[k] ?? k);
  const downloads = !data.downloads
    ? null
    : lack.length === 0
      ? `all ${entries.length === 3 ? 'three' : count(entries.length)} of the pipeline’s NASA downloads`
      : have.length === 0
        ? 'none of the pipeline’s NASA downloads'
        : `of the pipeline’s NASA downloads, ${both(have)} but not ${either(lack)}`;
  if (!app || !downloads) return `Data present: ${app ?? downloads}.`;
  // "and" joins two plain halves; a semicolon parts them where either half lists what was missing.
  const plain = short.length === 0 && (lack.length === 0 || have.length === 0);
  return `Data present: ${app}${plain ? ', and ' : '; '}${downloads}.`;
}

/** One sentence on the run, one on the data it had; an older report, which only counted the tests, keeps its count. */
export function testRunWords(run: TestRun): string[] {
  if (run.web.passed === undefined) {
    return [`${count(run.web.tests)} automated tests in the app and ${count(run.pipeline?.tests ?? 0)} in the data pipeline, counted on ${dayText(run.generated_utc, false)}.`];
  }
  const on = run.build.commit ? `on commit ${run.build.commit.slice(0, 7)}${run.build.dirty ? ' with uncommitted changes' : ''}` : 'on a copy with no git history';
  const pipeline = run.pipeline ? `in the data pipeline ${side(run.pipeline)}` : 'the data pipeline’s tests did not run';
  const words = [`The automated tests last ran on ${dayText(run.generated_utc, true)}, ${on}: in the app ${side(run.web)}; ${pipeline}.`];
  const data = dataSentence(run.data);
  if (data) words.push(data);
  return words;
}
