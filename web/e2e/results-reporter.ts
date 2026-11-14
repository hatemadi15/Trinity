import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';

/**
 * Writes what the browser journeys found, for the test report, in the words of public/validation/tests.json
 * (generated_utc, build, counts, data): public/validation/e2e.json after a run of the whole suite, test-results/e2e.json
 * after a run of some of it (named files, --grep, --project, --last-failed), so a partial run never stands for the
 * suite. Each journey with its outcome (passed, failed, skipped with the reason, or flaky) and time; the totals; when
 * it ran; the commit and whether the tree had other changes; the build it ran against; and which parts of the data
 * were there, by data/manifest.json's groups.
 */
const WEB = path.resolve(__dirname, '..');
const FULL_OUT = path.join(WEB, 'public', 'validation', 'e2e.json');
const PARTIAL_OUT = path.join(WEB, 'test-results', 'e2e.json');
/** The reports runs rewrite: a change to them alone does not make the tree dirty. */
const REPORTS = ['web/public/validation/e2e.json', 'web/public/validation/tests.json'];

type Outcome = 'passed' | 'failed' | 'skipped' | 'flaky';
type Manifest = { data_version?: string; groups?: { id: string; files: { path: string }[] }[] };

function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: WEB, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Whether the command line chose some of the journeys rather than all of them. */
function partialRun(argv: string[]): boolean {
  const i = argv.indexOf('test');
  const rest = i < 0 ? [] : argv.slice(i + 1);
  const valued = new Set(['-g', '--grep', '--grep-invert', '--project', '-c', '--config', '--reporter', '--workers', '-j', '--retries', '--timeout', '--output', '--max-failures', '--repeat-each', '--shard', '--trace', '--global-timeout']);
  const narrowing = new Set(['-g', '--grep', '--grep-invert', '--project', '--last-failed', '--only-changed', '--shard', '--repeat-each']);
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (narrowing.has(a.split('=')[0])) return true;
    if (a.startsWith('-')) {
      if (valued.has(a)) k++;
      continue;
    }
    return true; // a file or a pattern of files
  }
  return false;
}

/** Each group of the data manifest as complete, incomplete or missing in web/public/data, as check-data reports it. */
function dataParts(): { version: string | null; parts: Record<string, string> | null } {
  const local = path.join(WEB, 'public', 'data', 'manifest.json');
  const committed = path.join(WEB, '..', 'data', 'manifest.json');
  const file = existsSync(local) ? local : existsSync(committed) ? committed : null;
  if (!file) return { version: null, parts: null };
  const m = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  const parts: Record<string, string> = {};
  for (const g of m.groups ?? []) {
    const here = g.files.filter((f) => existsSync(path.join(WEB, 'public', 'data', f.path))).length;
    parts[g.id] = here === g.files.length ? 'complete' : here === 0 ? 'missing' : 'incomplete';
  }
  return { version: m.data_version ?? null, parts };
}

class ResultsReporter implements Reporter {
  private started = new Date();
  private config: FullConfig | null = null;
  private tests: TestCase[] = [];

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.started = new Date();
    this.tests = suite.allTests();
  }

  onEnd(result: FullResult) {
    const journeys = this.tests.map((t) => this.row(t));
    const count = (o: Outcome) => journeys.filter((r) => r.outcome === o).length;
    const buildIdFile = path.join(WEB, '.next', 'BUILD_ID');
    const remote = process.env.E2E_BASE_URL;
    const changed = (git('status', '--porcelain', '--untracked-files=no') ?? '')
      .split('\n')
      .filter((line) => line.trim() !== '' && !REPORTS.includes(line.slice(3).trim())).length;
    const doc = {
      suite: 'Earthrise browser journeys (Playwright, web/e2e)',
      generated_utc: this.started.toISOString().slice(0, 19) + 'Z',
      complete: !partialRun(process.argv),
      status: result.status,
      build: {
        commit: git('rev-parse', 'HEAD'),
        dirty: changed > 0,
        changed,
        branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
        server: remote ?? `next start, production build, at ${this.config?.projects[0]?.use.baseURL ?? ''}`,
        next_build_id: !remote && existsSync(buildIdFile) ? readFileSync(buildIdFile, 'utf8').trim() : null,
        built_utc: !remote && existsSync(buildIdFile) ? statSync(buildIdFile).mtime.toISOString().slice(0, 19) + 'Z' : null,
      },
      e2e: { tests: journeys.length, passed: count('passed'), skipped: count('skipped'), failed: count('failed'), flaky: count('flaky'), seconds: Math.round(result.duration / 1000) },
      // The served data is the local folder unless the journeys ran against another server.
      data: remote ? { version: null, parts: null } : dataParts(),
      browser: 'Chromium (Playwright 1.56), software WebGL (SwiftShader)',
      journeys,
    };
    const out = doc.complete ? FULL_OUT : PARTIAL_OUT;
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
    const e = doc.e2e;
    console.log(`\nJourneys: ${e.passed} passed, ${e.skipped} skipped, ${e.failed} failed${e.flaky ? `, ${e.flaky} flaky` : ''} in ${e.seconds} s; written to ${path.relative(WEB, out)}`);
  }

  private row(t: TestCase) {
    const last = t.results.at(-1);
    const o = t.outcome();
    const outcome: Outcome = o === 'expected' ? (last?.status === 'skipped' ? 'skipped' : 'passed') : o === 'unexpected' ? 'failed' : o === 'flaky' ? 'flaky' : 'skipped';
    const notes = [...t.annotations, ...(last?.annotations ?? [])];
    const skips = notes.filter((a) => a.type === 'skip' || a.type === 'fixme');
    const skip = skips.find((a) => a.description) ?? skips[0];
    const error = t.results.find((r) => r.error)?.error?.message ?? '';
    return {
      file: path.relative(path.join(WEB, 'e2e'), t.location.file).replace(/\\/g, '/'),
      title: t.titlePath().slice(3).join(' › '),
      outcome,
      seconds: Math.round(t.results.reduce((sum, r) => sum + r.duration, 0) / 100) / 10,
      ...(outcome === 'skipped' ? { reason: skip?.description ?? 'skipped' } : {}),
      ...(outcome === 'failed' || outcome === 'flaky' ? { error: error.replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 300) } : {}),
    };
  }

  printsToStdio() {
    return false;
  }
}

export default ResultsReporter;
