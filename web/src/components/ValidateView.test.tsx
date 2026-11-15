// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackcastsDoc, HorizonsDoc, MazaricoDoc, PicturesDoc, PowerDoc, ValidationDocs } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { ValidateView } from './ValidateView';

const docs: ValidationDocs = {
  horizons: readJson<HorizonsDoc>('data', 'validation', 'horizons.json'),
  mazarico: readJson<MazaricoDoc>('data', 'validation', 'mazarico.json'),
  power: readJson<PowerDoc>('data', 'validation', 'power.json'),
  backcasts: readJson<BackcastsDoc>('data', 'validation', 'backcasts.json'),
};
const TITLES = ['Where the Sun and Earth are in the sky', 'How much sunlight a site gets', 'The power and battery sums', 'When night falls on a real mission'];
const CHECKS = TITLES.slice(0, 3);
const pictures = readJson<PicturesDoc>('data', 'validation', 'images.json');
const PICTURES = 'Where shadows fall in pictures from orbit';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** The tables with the named checks forced to miss: the directions past their target, every sunlight gap 9 points, one worked power case off by 1 W. */
function missing(...which: ('directions' | 'sunlight' | 'sums')[]): ValidationDocs {
  return {
    horizons: which.includes('directions') ? { ...docs.horizons, max_abs_delta_el_deg: 0.02 } : docs.horizons,
    mazarico: which.includes('sunlight') ? { ...docs.mazarico, rows: docs.mazarico.rows.map((r) => (r.covered && r.sun ? { ...r, sun: { ...r.sun, gap_points: 9 } } : r)) } : docs.mazarico,
    power: which.includes('sums') ? { ...docs.power, cases: docs.power.cases.map((k, i) => (i === 0 ? { ...k, expected: { ...k.expected, power_w: k.expected.power_w.map((w) => w + 1) } } : k)) } : docs.power,
    backcasts: docs.backcasts,
  };
}

async function open(recheck: Parameters<typeof ValidateView>[0]['recheck'] = async () => ({ ok: false, message: 'offline' }), tables: ValidationDocs = docs) {
  render(<ValidateView load={async () => tables} recheck={recheck} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Accuracy' })).toBeTruthy());
  await waitFor(() => expect(screen.getByRole('region', { name: TITLES[0] })).toBeTruthy());
}

/** The labelled parts of a panel, as label and text pairs. */
function partsOf(region: HTMLElement): [string, string][] {
  return [...region.querySelectorAll('dl > div')].map((d) => [d.querySelector('dt')!.textContent ?? '', d.querySelector('dd')!.textContent ?? '']);
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
      if (url.endsWith('/validation/power.json')) return jsonResponse(docs.power);
      if (url.endsWith('/validation/backcasts.json')) return jsonResponse(docs.backcasts);
      if (url.endsWith('/validation/images.json')) return jsonResponse(pictures);
      if (url.endsWith('/validation/tests.json')) return jsonResponse({ generated_utc: '2026-10-02T05:48:59Z', web: { files: 102, tests: 714 }, pipeline: { tests: 114 } });
      return new Response('missing', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ValidateView />);
    await waitFor(() => expect(screen.getByRole('region', { name: TITLES[0] })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 400));
    // Five tables and the test badge, once each; the header's band of stars fetches its catalogue besides.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/validation/')).length).toBe(6);
    expect(screen.getByRole('region', { name: PICTURES })).toBeTruthy();
    expect(screen.getByRole('main').textContent).toMatch(/714 automated tests in the app and 114 in the data pipeline/);
  });

  it('shows four kinds of evidence, each with its mark, a figure, a sentence and its labelled parts, and its numbers only on request', async () => {
    await open();
    const regions = TITLES.map((name) => screen.getByRole('region', { name }));
    expect(regions[0].textContent).toMatch(/Passes: under the 0\.01° target/);
    expect(regions[0].textContent).toMatch(/0\.00003°/);
    expect(regions[1].textContent).toMatch(/Passes: the typical gap is under 5 points/);
    expect(regions[2].textContent).toMatch(new RegExp(`${docs.power.cases.length} of ${docs.power.cases.length}`));
    expect(regions[3].textContent).toMatch(/2\.4 hours/);
    for (const r of regions.slice(0, 3)) expect(partsOf(r).map(([label]) => label)).toEqual(['What it shows', 'Passes when', 'Tested on', 'What it leaves out']);
    expect(partsOf(regions[3]).map(([label]) => label)).toEqual(['What it can tell', 'What it cannot tell', 'Covers']);
    for (const r of regions) {
      for (const [, text] of partsOf(r)) expect(text.length).toBeGreaterThan(30);
      expect(within(r).queryByRole('table')).toBeNull();
      const show = within(r).getByRole('button', { name: 'Show the numbers' });
      expect(show.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(show);
      expect(within(r).getByRole('button', { name: 'Hide the numbers' }).getAttribute('aria-expanded')).toBe('true');
      expect(r.querySelector('[data-part="sentence"]')!.className).toMatch(/\bmax-w-\[46em\]/);
      // A phone shows only part of a table: it says the table moves sideways.
      expect(within(r).getByText('Swipe the table sideways to see every column.').className).toMatch(/\bsm:hidden\b/);
      expect(within(r).getAllByRole('table').length).toBeGreaterThan(0);
    }
    expect(within(regions[1]).getAllByText(/not covered by the 85° S map/).length).toBeGreaterThan(0);
    expect(within(regions[3]).getByText('+2.4 h')).toBeTruthy(); // Blue Ghost outlived the predicted sunset by 2.4 h
    expect(within(regions[3]).getByText(/panels tilted away/)).toBeTruthy();
    expect(within(regions[3]).getByText(/on its side in a crater/)).toBeTruthy();
  });

  it('gives the missions no pass mark: they are context, in neutral words', async () => {
    await open();
    const missions = screen.getByRole('region', { name: TITLES[3] });
    const mark = within(missions).getByText('Context, not a check');
    expect(mark.className).not.toMatch(/text-(good|bad)/);
    expect(mark.querySelector('svg')).toBeNull();
    expect(missions.textContent).not.toMatch(/Passes|Misses/);
  });

  it('says in one line how many checks meet their criteria, and that the missions are context', async () => {
    await open();
    const verdict = screen.getByText('Three checks meet their criteria; past missions are context, not a check.');
    expect(verdict.className).toMatch(/(^| )text-base( |$)/);
    expect(verdict.className).toMatch(/(^| )text-ink( |$)/);
    // Above the panels, after the page's own introduction.
    expect(screen.getByRole('heading', { level: 1, name: 'Accuracy' }).compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const name of TITLES) expect(verdict.compareDocumentPosition(screen.getByRole('region', { name })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/All three checks pass/)).toBeNull();
    // It counts the checks' own pass marks: with some forced to miss, the line and the panels still agree.
    const cases = [
      [['directions'], 'Two of three checks meet their criteria; past missions are context, not a check.'],
      [['sunlight', 'sums'], 'One of three checks meets its criteria; past missions are context, not a check.'],
      [['directions', 'sunlight', 'sums'], 'No check meets its criteria; past missions are context, not a check.'],
    ] as const;
    for (const [which, line] of cases) {
      cleanup();
      await open(undefined, missing(...which));
      expect(screen.getByText(line)).toBeTruthy();
      const passing = CHECKS.filter((name) => /^Passes/.test(screen.getByRole('region', { name }).querySelector('[data-part="mark"]')!.textContent ?? ''));
      expect(passing).toHaveLength(3 - which.length);
    }
  });

  it('checks the shadows against pictures from orbit as a fourth check, after sunlight, counted in the verdict', async () => {
    await open(undefined, { ...docs, images: pictures });
    const region = screen.getByRole('region', { name: PICTURES });
    expect(partsOf(region).map(([label]) => label)).toEqual(['What it shows', 'Passes when', 'Tested on', 'What it leaves out']);
    const mark = region.querySelector('[data-part="mark"]')!;
    expect(mark.textContent).toBe('Misses: 3 of 20 pictures fall short');
    expect(mark.className).toMatch(/text-bad/);
    expect(screen.getByText('Three of four checks meet their criteria; past missions are context, not a check.')).toBeTruthy();
    // After the sunlight check, before the sums.
    const at = (name: string) => screen.getByRole('region', { name });
    expect(at(TITLES[1]).compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(at(TITLES[2])) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(region).queryByRole('table')).toBeNull();
    fireEvent.click(within(region).getByRole('button', { name: 'Show the numbers' }));
    expect(within(region).getByRole('table', { name: 'Every picture against the app' })).toBeTruthy();
    // Still one gold action on the page.
    expect(screen.getByRole('main').querySelectorAll('.btn-primary')).toHaveLength(1);
  });

  it('shows the four other kinds of evidence as before where the pictures’ table is missing', async () => {
    await open();
    expect(screen.queryByRole('region', { name: PICTURES })).toBeNull();
    expect(screen.getByText('Three checks meet their criteria; past missions are context, not a check.')).toBeTruthy();
  });

  it('shows the sunlight comparison step by step from the app’s own share to the map’s way, with both Earth rules and what could not be matched', async () => {
    await open();
    const sunlight = screen.getByRole('region', { name: TITLES[1] });
    fireEvent.click(within(sunlight).getByRole('button', { name: 'Show the numbers' }));
    const [sun, earth] = within(sunlight).getAllByRole('table');
    expect(within(sun).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Site', 'The app: 2 m mast', 'From the ground', 'Over 18.6 years', 'On 60 m terrain', "NASA's map", 'Gap']);
    expect(within(earth).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Site', "The app: Earth's centre", 'Ours: any part of Earth', "NASA's map", 'Gap']);
    const malapert = docs.mazarico.rows.find((r) => r.site_id === 'malapert_massif')!;
    const row = within(sun).getByText(malapert.name).closest('tr')!;
    expect(row.textContent).toContain(`${(malapert.sun!.app * 100).toFixed(1)} %`);
    expect(row.textContent).toContain(`${(malapert.sun!.matched * 100).toFixed(1)} %`);
    expect(row.textContent).toContain(`${(malapert.sun!.map * 100).toFixed(1)} %`);
    expect(sunlight.textContent).toContain(docs.mazarico.reference.sun.product_id);
    expect(sunlight.textContent).toContain(docs.mazarico.reference.earth.product_id);
    for (const line of docs.mazarico.evidence.unmatched!) expect(sunlight.textContent).toContain(line);
    expect(within(sunlight).getByRole('heading', { level: 3, name: 'What the comparison could not match' })).toBeTruthy();
  });

  it('lists every worked power case with its hand answer and the gap in this browser', async () => {
    await open();
    const sums = screen.getByRole('region', { name: TITLES[2] });
    fireEvent.click(within(sums).getByRole('button', { name: 'Show the numbers' }));
    const table = within(sums).getAllByRole('table')[0];
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Case', 'By hand', 'Pipeline: largest gap', 'This browser: largest gap']);
    expect(within(table).getAllByRole('row')).toHaveLength(docs.power.cases.length + 1);
    expect(table.textContent).toContain('0.3 x 4 m2 x 1361 W/m2 = 1633.2 W');
    expect(sums.textContent).toMatch(new RegExp(`${docs.power.recorded_runs.length} recorded runs`));
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

  it('puts the test count last, after the error budget, and keeps the top to 22 words (spec 20.1)', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/validation/tests.json')) return jsonResponse({ generated_utc: '2026-10-02T05:48:59Z', web: { files: 102, tests: 1444 }, pipeline: { tests: 114 } });
      return new Response('missing', { status: 404 });
    });
    await open();
    const badge = await waitFor(() => screen.getByText(/1,444 automated tests/));
    const budget = screen.getByRole('heading', { level: 2, name: 'How far off the forecast can be' }).closest('section')!;
    expect(budget.contains(badge)).toBe(true);
    // Last in the section, in its fold.
    expect(budget.lastElementChild!.contains(badge)).toBe(true);
    expect(within(budget).getByRole('button', { name: /The automated tests' last run/ })).toBeTruthy();
    const first = screen.getByRole('region', { name: TITLES[0] });
    expect(first.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const main = screen.getByRole('main');
    // The heading, the intro and the verdict: what shows before the first panel.
    const top = [...main.children].slice(0, 2);
    for (const width of [WIDE, PHONE]) {
      const n = top.reduce((sum, el) => sum + visibleWords(el, width).length, 0);
      expect(n).toBeLessThanOrEqual(22);
    }
    expect(top[0].textContent).toMatch(/What each check shows, and its limits\./);
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
    expect(budget.lastElementChild!.contains(badge)).toBe(true);
  });

  it('renders without the re-check button when no site is listed', async () => {
    await open(undefined, { ...docs, horizons: { ...docs.horizons, sites: [] } });
    expect(screen.queryByRole('button', { name: /Re-check with JPL now/ })).toBeNull();
  });

  it('keeps the error budget, and one gold action on the page', async () => {
    await open();
    const budget = screen.getByRole('region', { name: 'How far off the forecast can be' });
    expect(budget.textContent).toMatch(/under 0\.01° \(the first check finds 0\.00003°\)/);
    expect(budget.querySelector('li')!.textContent).toMatch(/^Sunrise, sunset, Earth rising or setting: within the margins above\./);
    const gold = screen.getByRole('main').querySelectorAll('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toMatch(/Re-check with JPL now/);
  });

  it('says in plain words when the checks cannot be loaded, and keeps the pipeline commands for developers only', async () => {
    const missingTables = () => (
      <ValidateView
        load={async () => {
          throw new Error('could not load /data/validation/horizons.json (HTTP 404)');
        }}
        recheck={async () => ({ ok: false, message: 'offline' })}
      />
    );
    // Two sentences in two paragraphs, which textContent runs together.
    const plain = /The checks could not be loaded\.\s*Reload the page, or try again in a minute\./;
    render(missingTables());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    // Under next dev, as in tests, the page also names the command that copies the committed tables, then the error;
    // never `validate`, which needs the NASA downloads.
    expect(screen.getByRole('alert').textContent).toMatch(/Run uv run python -m lunar_pipeline\.cli sync-local inside pipeline\/ and reload: it copies the tables committed in data\/validation\. \(could not load .*HTTP 404\)\)/);
    expect(screen.getByRole('alert').textContent).not.toMatch(/cli validate/);
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    render(missingTables());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    expect(screen.getByRole('alert').textContent).not.toMatch(/validate|sync-local|HTTP 404/);
  });
});
