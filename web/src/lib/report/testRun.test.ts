import { describe, expect, it } from 'vitest';
import { buildIdentity, dataParts, pytestCounts, testRunWords, vitestCounts, type TestRun } from './testRun';

const RUN: TestRun = {
  generated_utc: '2026-11-14T11:47:57Z',
  build: { commit: '916aa96f0c2d3e4b5a69788796a5b4c3d2e1f001', dirty: false, changed: 0 },
  web: { files: 144, tests: 1563, passed: 1558, skipped: 5, failed: 0 },
  pipeline: { tests: 147, passed: 147, skipped: 0, failed: 0 },
  data: {
    version: '2026-11-14-a120b7a9',
    parts: { core: 'complete', sky: 'complete', validation: 'complete', tiles: 'complete', terrain: 'complete', globe: 'complete', fixtures: 'complete' },
    downloads: { kernels: true, lola: true, illumination: true },
  },
};

describe('the test run as the report records it', () => {
  it('reads passed, skipped and failed apart from vitest’s report, a file per test file', () => {
    const report = { numTotalTests: 10, numPassedTests: 7, numFailedTests: 1, numPendingTests: 2, numTodoTests: 0, testResults: [{}, {}, {}] };
    expect(vitestCounts(report)).toEqual({ files: 3, tests: 10, passed: 7, skipped: 2, failed: 1 });
    // A test left to do counts as skipped: it did not run.
    expect(vitestCounts({ ...report, numPendingTests: 1, numTodoTests: 1 }).skipped).toBe(2);
  });

  it('reads the tests pytest ran from its JUnit report, errors counted as failures', () => {
    const xml = '<?xml version="1.0"?><testsuites name="pytest tests"><testsuite name="pytest" errors="1" failures="2" skipped="26" tests="134" time="3.6"></testsuite></testsuites>';
    expect(pytestCounts(xml)).toEqual({ tests: 134, passed: 105, skipped: 26, failed: 3, seconds: 3.6 });
    expect(pytestCounts('not a report')).toBeNull();
  });

  it('names the commit and whether the tree had changes, leaving out the report it is about to rewrite', () => {
    const head = '916aa96f0c2d3e4b5a69788796a5b4c3d2e1f001\n';
    expect(buildIdentity(head, '')).toEqual({ commit: '916aa96f0c2d3e4b5a69788796a5b4c3d2e1f001', dirty: false, changed: 0 });
    expect(buildIdentity(head, ' M web/public/validation/tests.json\n')).toEqual({ commit: '916aa96f0c2d3e4b5a69788796a5b4c3d2e1f001', dirty: false, changed: 0 });
    expect(buildIdentity(head, ' M web/src/app/page.tsx\n?? notes.txt\n')).toEqual({ commit: '916aa96f0c2d3e4b5a69788796a5b4c3d2e1f001', dirty: true, changed: 2 });
    // A copy without git (a ZIP download) has no commit to name.
    expect(buildIdentity('', '')).toEqual({ commit: null, dirty: false, changed: 0 });
  });

  it('takes the data parts and the pipeline’s downloads from check-data', () => {
    const check = { data_version: '2026-11-14-a120b7a9', groups: [{ id: 'core', state: 'complete' }, { id: 'terrain', state: 'missing' }], sources: { kernels: false, lola: true, illumination: false } };
    expect(dataParts(check)).toEqual({ version: '2026-11-14-a120b7a9', parts: { core: 'complete', terrain: 'missing' }, downloads: { kernels: false, lola: true, illumination: false } });
    expect(dataParts(null)).toEqual({ version: null, parts: null, downloads: null });
  });
});

describe('the Accuracy page’s words for the test run', () => {
  it('says when the tests ran, on which commit, what passed, skipped and failed on each side, and with which data', () => {
    expect(testRunWords(RUN)).toEqual([
      'The automated tests last ran on 14 November 2026 at 11:47 UTC, on commit 916aa96: in the app 1,558 passed, 5 skipped and 0 failed; in the data pipeline 147 passed, 0 skipped and 0 failed.',
      'Data present: all of the app’s data, and all three of the pipeline’s NASA downloads.',
    ]);
  });

  it('says so when the tree had changes, when data was missing and when a test failed', () => {
    const words = testRunWords({
      ...RUN,
      build: { commit: RUN.build.commit, dirty: true, changed: 3 },
      web: { files: 144, tests: 1563, passed: 1531, skipped: 30, failed: 2 },
      data: { version: RUN.data.version, parts: { ...RUN.data.parts!, terrain: 'missing', globe: 'partial' }, downloads: { kernels: true, lola: false, illumination: false } },
    });
    expect(words[0]).toMatch(/^The automated tests last ran on 14 November 2026 at 11:47 UTC, on commit 916aa96 with uncommitted changes: in the app 1,531 passed, 30 skipped and 2 failed;/);
    // A part missing or incomplete reads the same: not all of it was there.
    expect(words[1]).toBe('Data present: the app’s data, but not all of the terrain or the globe; of the pipeline’s NASA downloads, the kernels but not the LOLA heights or the illumination maps.');
  });

  it('says when the pipeline’s tests did not run and when the copy has no git history', () => {
    const words = testRunWords({ ...RUN, build: { commit: null, dirty: false, changed: 0 }, pipeline: null, data: { version: null, parts: null, downloads: null } });
    expect(words).toEqual(['The automated tests last ran on 14 November 2026 at 11:47 UTC, on a copy with no git history: in the app 1,558 passed, 5 skipped and 0 failed; the data pipeline’s tests did not run.']);
  });

  it('keeps an older report’s count as a count, never as a run', () => {
    const old = { generated_utc: '2026-11-12T11:47:57Z', web: { files: 138, tests: 1514 }, pipeline: { tests: 134 } } as unknown as TestRun;
    expect(testRunWords(old)).toEqual(['1,514 automated tests in the app and 134 in the data pipeline, counted on 12 November 2026.']);
  });
});
