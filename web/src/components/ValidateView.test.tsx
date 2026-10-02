// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackcastsDoc, HorizonsDoc, MazaricoDoc } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
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

async function open(recheck: Parameters<typeof ValidateView>[0]['recheck'] = async () => ({ ok: false, message: 'offline' })) {
  render(<ValidateView load={async () => docs} recheck={recheck} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Accuracy' })).toBeTruthy());
  await waitFor(() => expect(screen.getByRole('region', { name: TITLES[0] })).toBeTruthy());
}

describe('ValidateView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(fetchMock.mock.calls.length).toBe(4); // three tables and the test badge, once each
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
      // A phone shows only part of a table: it says the table moves sideways.
      expect(within(r).getByText('Swipe the table sideways to see every column.').className).toMatch(/\bsm:hidden\b/);
      expect(within(r).getByRole('table')).toBeTruthy();
    }
    expect(within(regions[1]).getAllByText(/not covered by the 85°S map/).length).toBeGreaterThan(0);
    expect(within(regions[2]).getByText('+2.4 h')).toBeTruthy(); // Blue Ghost outlived the predicted sunset by 2.4 h
    expect(within(regions[2]).getByText(/panels tilted away/)).toBeTruthy();
    expect(within(regions[2]).getByText(/on its side in a crater/)).toBeTruthy();
  });

  it('keeps the live re-check inside the first check: success, failure and an error all leave the button usable', async () => {
    await open(async () => ({ ok: true, worstEl: 0.00003, worstAzCosEl: 0.000002, n: 8, ms: 1200 }));
    const first = screen.getByRole('region', { name: TITLES[0] });
    fireEvent.click(within(first).getByRole('button', { name: /Re-check with JPL now/ }));
    await waitFor(() => expect(first.textContent).toMatch(/8 epochs, worst 3\.0e-5°/));
  });

  it('a re-check that fails or throws shows the fallback and re-enables the button', async () => {
    await open(async () => {
      throw new Error('could not load /data/ephemeris/x (HTTP 404)');
    });
    const button = screen.getByRole('button', { name: /Re-check with JPL now/ });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText(/HTTP 404\); showing the stored comparison/)).toBeTruthy());
    expect((screen.getByRole('button', { name: /Re-check with JPL now/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the error budget, and one gold action on the page', async () => {
    await open();
    const budget = screen.getByRole('region', { name: 'How far off the forecast can be' });
    expect(budget.textContent).toMatch(/under 0\.01° \(the first check finds 0\.00003°\)/);
    expect(budget.querySelector('li')!.textContent).toMatch(/^Sunrise, sunset and Earth rising or setting: within 15 to 60 minutes/);
    const gold = screen.getByRole('main').querySelectorAll('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toMatch(/Re-check with JPL now/);
  });

  it('shows the data-missing state when the tables cannot be loaded', async () => {
    render(
      <ValidateView
        load={async () => {
          throw new Error('could not load /data/validation/horizons.json (HTTP 404)');
        }}
        recheck={async () => ({ ok: false, message: 'offline' })}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/validate/));
  });
});
