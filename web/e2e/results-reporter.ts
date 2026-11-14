import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Writes what the browser journeys found, for the test report: public/validation/e2e.json after a run of the whole
 * suite, test-results/e2e.json after a run of some of it (named files, --grep, --project, --last-failed), so a partial
 * run never stands for the suite. Each journey with its outcome (passed, failed, skipped with the reason, or flaky)
 * and time; the totals; when it ran; the commit and whether the tree had changes; the build it ran against; and
 * whether the NASA data was there.
 */
const WEB = path.resolve(__dirname, '..');
const FULL_OUT = path.join(WEB, 'public', 'validation', 'e2e.json');
const PARTIAL_OUT = path.join(WEB, 'test-results', 'e2e.json');

/** The files the data must hold for the journeys to mean anything, under web/public/data. */
const DATA_FILES = ['sites.json', 'ephemeris/moon_me_2024_2036_1h.json', 'ephemeris/moon_me_2024_2036_1h.f32', 'masks/de_gerlache_rim_2.json', 'terrain/manifest.json', 'sky/stars.bin'];

type Outcome = 'passed' | 'failed' | 'skipped' | 'flaky';

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
    const flag = a.split('=')[0];
    if (narrowing.has(flag)) return true;
    if (a.startsWith('-')) {
      if (valued.has(a)) k++;
      continue;
    }
    return true; // a file or a pattern of files
  }
  return false;
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
    const rows = this.tests.map((t) => this.row(t));
    const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
    const nextDir = path.join(WEB, '.next');
    const buildIdFile = path.join(nextDir, 'BUILD_ID');
    const local = !process.env.E2E_BASE_URL;
    const doc = {
      suite: 'Earthrise browser journeys (Playwright, e2e/)',
      run_utc: this.started.toISOString().slice(0, 19) + 'Z',
      duration_s: Math.round(result.duration / 100) / 10,
      status: result.status,
      complete: !partialRun(process.argv),
      commit: git('rev-parse', 'HEAD'),
      branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
      // Changes not yet committed when the journeys ran: the build may hold them.
      uncommitted_changes: (git('status', '--porcelain', '--untracked-files=no') ?? '').length > 0,
      build: local
        ? {
            server: `next start (production build) at ${this.config?.projects[0]?.use.baseURL ?? ''}`,
            build_id: existsSync(buildIdFile) ? readFileSync(buildIdFile, 'utf8').trim() : null,
            built_utc: existsSync(buildIdFile) ? statSync(buildIdFile).mtime.toISOString().slice(0, 19) + 'Z' : null,
          }
        : { server: process.env.E2E_BASE_URL, build_id: null, built_utc: null },
      data: local
        ? (() => {
            const present = DATA_FILES.filter((f) => existsSync(path.join(WEB, 'public', 'data', f)));
            return { dir: 'web/public/data', available: present.length === DATA_FILES.length, missing: DATA_FILES.filter((f) => !present.includes(f)) };
          })()
        : { dir: `${process.env.E2E_BASE_URL}/data`, available: rows.some((r) => r.outcome === 'passed'), missing: [] },
      browser: 'Chromium (Playwright), software WebGL (SwiftShader)',
      totals: { journeys: rows.length, passed: count('passed'), failed: count('failed'), skipped: count('skipped'), flaky: count('flaky') },
      journeys: rows,
    };
    const out = doc.complete ? FULL_OUT : PARTIAL_OUT;
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
    const t = doc.totals;
    console.log(`\nJourneys: ${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped${t.flaky ? `, ${t.flaky} flaky` : ''} in ${doc.duration_s} s; written to ${path.relative(WEB, out)}`);
  }

  private row(t: TestCase) {
    const results: TestResult[] = t.results;
    const last = results.at(-1);
    const o = t.outcome();
    const outcome: Outcome = o === 'expected' ? (last?.status === 'skipped' ? 'skipped' : 'passed') : o === 'unexpected' ? 'failed' : o === 'flaky' ? 'flaky' : 'skipped';
    const notes = [...t.annotations, ...(last?.annotations ?? [])];
    const skip = notes.find((a) => a.type === 'skip' || a.type === 'fixme');
    return {
      file: path.relative(path.join(WEB, 'e2e'), t.location.file).replace(/\\/g, '/'),
      title: t.titlePath().slice(3).join(' › '),
      outcome,
      duration_ms: results.reduce((sum, r) => sum + r.duration, 0),
      ...(outcome === 'skipped' ? { reason: skip?.description ?? 'skipped' } : {}),
      ...(outcome === 'failed' || outcome === 'flaky' ? { error: (results.find((r) => r.error)?.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 300) } : {}),
    };
  }

  printsToStdio() {
    return false;
  }
}

export default ResultsReporter;
