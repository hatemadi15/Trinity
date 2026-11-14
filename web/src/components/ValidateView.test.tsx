// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackcastsDoc, HorizonsDoc, MazaricoDoc } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { ValidateView } from './ValidateView';

const docs = {
  horizons: readJson<HorizonsDoc>('data', 'validation', 'horizons.json'),
  mazarico: readJson<MazaricoDoc>('data', 'validation', 'mazarico.json'),
  backcasts: readJson<BackcastsDoc>('data', 'validation', 'backcasts.json'),
};
const TITLES = ['Where the Sun and Earth are in the sky', 'How much sunlight a site gets', 'When night falls on a real mission'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** The tables with the named checks forced to miss: the directions past their target, every sunlight gap 9 points, Blue Ghost's end 30 hours from sunset. */
function missing(...which: ('directions' | 'sunlight' | 'nights')[]): typeof docs {
  return {
    horizons: which.includes('directions') ? { ...docs.horizons, max_abs_delta_el_deg: 0.02 } : docs.horizons,
    mazarico: which.includes('sunlight') ? { ...docs.mazarico, rows: docs.mazarico.rows.map((r) => (r.covered ? { ...r, delta_points: 9 } : r)) } : docs.mazarico,
    backcasts: which.includes('nights') ? { ...docs.backcasts, rows: docs.backcasts.rows.map((r) => (r.site_id === 'blue_ghost_m1' ? { ...r, end_minus_sunset_h: 30 } : r)) } : docs.backcasts,
  };
}

async function open(recheck: Parameters<typeof ValidateView>[0]['recheck'] = async () => ({ ok: false, message: 'offline' }), tables: typeof docs = docs) {
  render(<ValidateView load={async () => tables} recheck={recheck} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Accuracy' })).toBeTruthy());
  await waitFor(() => expect(screen.getByRole('region', { name: TITLES[0] })).toBeTruthy());
}

describe('ValidateView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fetches each table once with the default loaders (no refetch loop)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/validation/horizons.json')) return jsonResponse(docs.horizons);
      if (url.endsWith('/validation/mazarico.json')) return jsonResponse(docs.mazarico);
      if (url.endsWith('/validation/backcasts.json')) return jsonResponse(docs.backcasts);
      if (url.endsWith('/validation/tests.json')) return jsonResponse({ generated_utc: '2026-10-02T05:48:59Z', web: { files: 102, tests: 714 }, pipeline: { tests: 114 } });
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ValidateView />);
    await waitFor(() => expect(screen.getByRole('region', { name: TITLES[0] })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 400));
    // Three tables and the test badge, once each; the header's band of stars fetches its catalogue besides.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/validation/')).length).toBe(4);
    expect(screen.getByRole('main').textContent).toMatch(/714 automated tests in the app and 114 in the data pipeline/);
  });

  it('shows three checks, each with a pass mark, a figure and a sentence, and its numbers only on request', async () => {
    await open();
    const regions = TITLES.map((name) => screen.getByRole('region', { name }));
    expect(regions[0].textContent).toMatch(/Passes: under the 0\.01° target/);
    expect(regions[0].textContent).toMatch(/0\.00003°/);
    expect(regions[1].textContent).toMatch(/2\.6 points/);
    expect(regions[2].textContent).toMatch(/2\.4 hours/);
    for (const r of regions) {
      expect(within(r).queryByRole('table')).toBeNull();
      const show = within(r).getByRole('button', { name: 'Show the numbers' });
      expect(show.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(show);
      expect(within(r).getByRole('button', { name: 'Hide the numbers' }).getAttribute('aria-expanded')).toBe('true');
      expect(r.querySelector('[data-part="sentence"]')!.className).toMatch(/\bmax-w-\[46em\]/);
      // A phone shows only part of a table: it says the table moves sideways.
      expect(within(r).getByText('Swipe the table sideways to see every column.').className).toMatch(/\bsm:hidden\b/);
      expect(within(r).getByRole('table')).toBeTruthy();
    }
    expect(within(regions[1]).getAllByText(/not covered by the 85°S map/).length).toBeGreaterThan(0);
    expect(within(regions[2]).getByText('+2.4 h')).toBeTruthy(); // Blue Ghost outlived the predicted sunset by 2.4 h
    expect(within(regions[2]).getByText(/panels tilted away/)).toBeTruthy();
    expect(within(regions[2]).getByText(/on its side in a crater/)).toBeTruthy();
  });

  it('says in one line how many checks pass', async () => {
    await open();
    // All three pass on the stored tables.
    const verdict = screen.getByText('All three checks pass.');
    expect(verdict.className).toMatch(/(^| )text-base( |$)/);
    expect(verdict.className).toMatch(/(^| )text-ink( |$)/);
    // Above the three checks, after the page's own introduction.
    expect(screen.getByRole('heading', { level: 1, name: 'Accuracy' }).compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const name of TITLES) expect(verdict.compareDocumentPosition(screen.getByRole('region', { name })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // It counts the checks' own pass marks: with some forced to miss, the line and the panels still agree.
    const cases = [
      [['directions'], 'Two of three checks pass.'],
      [['sunlight', 'nights'], 'One of three checks passes.'],
      [['directions', 'sunlight', 'nights'], 'No check passes.'],
    ] as const;
    for (const [which, line] of cases) {
      cleanup();
      await open(undefined, missing(...which));
      expect(screen.getByText(line)).toBeTruthy();
      expect(screen.queryByText('All three checks pass.')).toBeNull();
      const passing = TITLES.filter((name) => /Passes/.test(screen.getByRole('region', { name }).textContent ?? ''));
      expect(passing).toHaveLength(3 - which.length);
    }
  });

  it('keeps the live re-check inside the first check: success, failure and an error all leave the button usable', async () => {
    await open(async () => ({ ok: true, worstEl: 0.00003, worstAzCosEl: 0.000002, n: 8, ms: 1200 }));
    const first = screen.getByRole('region', { name: TITLES[0] });
    fireEvent.click(within(first).getByRole('button', { name: /Re-check with JPL now/ }));
    await waitFor(() => expect(first.textContent).toMatch(/8 moments compared just now: the largest gap was 0\.00003° in height and under 0\.00001° in direction \(1\.2 s\)/));
  });

  it('a re-check that fails or throws shows the fallback and re-enables the button', async () => {
    await open(async () => {
      throw new Error('could not load /data/ephemeris/x (HTTP 404)');
    });
    const button = screen.getByRole('button', { name: /Re-check with JPL now/ });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText(/JPL could not be reached \(no internet here\?\), so the stored comparison stands: the largest gap was 0\.00003°\./)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Re-check with JPL now/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('words a failed re-check in plain terms and keeps the raw message out of production', async () => {
    const click = () => fireEvent.click(screen.getByRole('button', { name: /Re-check with JPL now/ }));
    await open(async () => ({ ok: false, message: 'fetch failed' }));
    click();
    await waitFor(() => expect(screen.getByText(/JPL could not be reached/)).toBeTruthy());
    expect(screen.getByText(/JPL could not be reached/).textContent).toMatch(/\[fetch failed\]/);
    cleanup();
    vi.stubEnv('NODE_ENV', 'production');
    await open(async () => ({ ok: false, message: 'fetch failed' }));
    click();
    await waitFor(() => expect(screen.getByText(/JPL could not be reached/)).toBeTruthy());
    expect(screen.getByRole('main').textContent).not.toMatch(/fetch failed/);
    cleanup();
    await open(async () => ({ ok: false, message: 'The operation was aborted due to timeout' }));
    click();
    await waitFor(() => expect(screen.getByText(/JPL did not answer in time/)).toBeTruthy());
    cleanup();
    await open(async () => ({ ok: false, message: 'JPL answered HTTP 503' }));
    click();
    await waitFor(() => expect(screen.getByText(/JPL is busy just now/)).toBeTruthy());
  });

  it('writes the test count with a thousands comma', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/validation/tests.json')) return jsonResponse({ generated_utc: '2026-10-02T05:48:59Z', web: { files: 102, tests: 1444 }, pipeline: { tests: 114 } });
      return new Response('missing', { status: 404 });
    });
    await open();
    await waitFor(() => expect(screen.getByRole('main').textContent).toMatch(/1,444 automated tests/));
  });

  it('puts the test count last, after the error budget, and keeps the top to 25 words (spec 20.1)', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/validation/tests.json')) return jsonResponse({ generated_utc: '2026-10-02T05:48:59Z', web: { files: 102, tests: 1444 }, pipeline: { tests: 114 } });
      return new Response('missing', { status: 404 });
    });
    await open();
    const badge = await waitFor(() => screen.getByText(/1,444 automated tests/));
    const budget = screen.getByRole('heading', { level: 2, name: 'How far off the forecast can be' }).closest('section')!;
    expect(budget.contains(badge)).toBe(true);
    expect(budget.lastElementChild).toBe(badge);
    const first = screen.getByRole('region', { name: TITLES[0] });
    expect(first.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const main = screen.getByRole('main');
    // The heading, the intro and the verdict: what shows before the first check.
    const top = [...main.children].slice(0, 2);
    for (const width of [WIDE, PHONE]) {
      const n = top.reduce((sum, el) => sum + visibleWords(el, width).length, 0);
      expect(n).toBeLessThanOrEqual(25);
    }
  });

  it('says when the tests last ran, on which commit, what passed, skipped and failed on each side, and with which data', async () => {
    const run = {
      generated_utc: '2026-11-14T11:47:57Z',
      build: { commit: '916aa96f0c2d3e4b5a69788796a5b4c3d2e1f001', dirty: false, changed: 0 },
      web: { files: 144, tests: 1563, passed: 1558, skipped: 5, failed: 0 },
      pipeline: { tests: 147, passed: 147, skipped: 0, failed: 0 },
      data: { version: '2026-11-14-a120b7a9', parts: { core: 'complete', terrain: 'missing' }, downloads: { kernels: true, lola: true, illumination: true } },
    };
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => (String(input).endsWith('/validation/tests.json') ? jsonResponse(run) : new Response('missing', { status: 404 })));
    await open();
    const badge = await waitFor(() => screen.getByText(/The automated tests last ran/));
    expect(badge.textContent).toBe(
      'The automated tests last ran on 14 November 2026 at 11:47 UTC, on commit 916aa96: in the app 1,558 passed, 5 skipped and 0 failed; in the data pipeline 147 passed, 0 skipped and 0 failed. ' +
        'Data present: the app’s data, but not all of the terrain; all three of the pipeline’s NASA downloads.',
    );
    // Last in the error budget's section, as the count was.
    const budget = screen.getByRole('heading', { level: 2, name: 'How far off the forecast can be' }).closest('section')!;
    expect(budget.lastElementChild).toBe(badge);
  });

  it('renders without the re-check button when no site is listed', async () => {
    await open(undefined, { ...docs, horizons: { ...docs.horizons, sites: [] } });
    expect(screen.queryByRole('button', { name: /Re-check with JPL now/ })).toBeNull();
  });

  it('keeps the error budget, and one gold action on the page', async () => {
    await open();
    const budget = screen.getByRole('region', { name: 'How far off the forecast can be' });
    expect(budget.textContent).toMatch(/under 0\.01° \(the first check finds 0\.00003°\)/);
    expect(budget.querySelector('li')!.textContent).toMatch(/^Sunrise, sunset and Earth rising or setting: within the margins measured above, site by site\./);
    const gold = screen.getByRole('main').querySelectorAll('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toMatch(/Re-check with JPL now/);
  });

  it('says in plain words when the checks cannot be loaded, and keeps the pipeline commands for developers only', async () => {
    const missing = () => (
      <ValidateView
        load={async () => {
          throw new Error('could not load /data/validation/horizons.json (HTTP 404)');
        }}
        recheck={async () => ({ ok: false, message: 'offline' })}
      />
    );
    // Two sentences in two paragraphs, which textContent runs together.
    const plain = /The checks could not be loaded\.\s*Reload the page, or try again in a minute\./;
    render(missing());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    // Under next dev, as in tests, the page also names the command that copies the committed tables, then the error;
    // never `validate`, which needs the NASA downloads.
    expect(screen.getByRole('alert').textContent).toMatch(/Run uv run python -m lunar_pipeline\.cli sync-local inside pipeline\/ and reload: it copies the tables committed in data\/validation\. \(could not load .*HTTP 404\)\)/);
    expect(screen.getByRole('alert').textContent).not.toMatch(/cli validate/);
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    render(missing());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    expect(screen.getByRole('alert').textContent).not.toMatch(/validate|sync-local|HTTP 404/);
  });
});
