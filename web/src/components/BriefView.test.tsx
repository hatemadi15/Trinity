// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { BriefView } from './BriefView';

/** A store on the rim summit the brief was written for (the default site moved to de Gerlache Rim 2). */
async function storeWithFiles() {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  const sites = [
    ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
    ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
  ];
  const store = createExploreStore({
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id) => {
      const m = readJson<{ elevation_deg: number[]; site_height_m: number; mast_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: m.mast_m, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  });
  await store.getState().init();
  await store.getState().selectSite('shackleton_center_rim_high');
  return store;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('BriefView', () => {
  it('speaks like Explore: the verdict title and sentences, the five figures, the Sun and Earth rows, method and credits; and prints', async () => {
    const store = await storeWithFiles();
    render(<BriefView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Shackleton rim summit'));
    expect(screen.getByRole('heading', { level: 2, name: /^Landing at Shackleton rim summit on 1 January: power for all 30 days$/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: /^Landing at Shackleton rim summit/ }).textContent).toMatch(/Earth is in view for/);
    const figures = [...document.querySelectorAll('dt')].map((d) => d.textContent);
    expect(figures).toEqual(['Sunlight', 'Radio contact while it has power', 'Longest night', 'Time with power', 'Battery when full']);
    expect(document.querySelector('dl')!.className).toMatch(/\bgrid-cols-2\b.*\bsm:grid-cols-3\b/);
    // The lander once, in words, and Earth's threshold in words.
    expect(screen.getByRole('heading', { name: 'The lander' }).nextElementSibling!.textContent).toBe(
      '4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery, starting with the battery 100 % full; Earth counts as in view whenever it clears the hills.',
    );
    expect(screen.getByRole('img', { name: /^The Sun over the 30 days from 1 January/ }).closest('.stage')).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Earth over the 30 days from 1 January/ }).closest('.stage')).toBeTruthy();
    // Day labels under the rows: every other one gives way on a phone, so none overlap.
    const days = [...document.querySelectorAll<HTMLElement>('[data-day]')];
    expect(days.map((d) => d.textContent)).toEqual(['1 Jan', '6 Jan', '11 Jan', '16 Jan', '21 Jan', '26 Jan']);
    days.forEach((d, i) => expect(d.className.includes('max-sm:hidden'), d.textContent!).toBe(i % 2 === 1));
    expect(document.querySelector('.brief')).toBeTruthy(); // light print tokens whatever the theme
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Sun above the skyline|Longest Earth gap|Survives the window|sky dome/i);
    expect(screen.getByRole('heading', { name: 'How this was computed' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Data' })).toBeTruthy();
    expect(screen.getByText(/NASA LRO LOLA polar elevation models/)).toBeTruthy();
    expect(screen.getByText(/hills measured from NASA elevation data/)).toBeTruthy();
    expect(screen.getByText(/team Astroy\/Ed\)\.$/)).toBeTruthy(); // no unfilled placeholder in the footer
    expect(screen.getByRole('main').classList.contains('brief')).toBe(true);
    expect(screen.getByRole('link', { name: 'Back to Explore' }).getAttribute('href')).toBe('/explore?site=shackleton_center_rim_high&start=2027-01-01&days=30');
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /Print or save as PDF/ }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('keeps the place and the period under the name, and the rest of the setting in the method (a move, so it prints)', async () => {
    const store = await storeWithFiles();
    render(<BriefView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    const meta = screen.getByRole('heading', { level: 1 }).nextElementSibling!;
    expect(meta.textContent).toMatch(/^\d+\.\d{3}° [NS], \d+\.\d{3}° [EW]; the 30 days from 1 January 2027\.$/);
    const method = screen.getByRole('heading', { name: 'How this was computed' }).nextElementSibling!;
    expect(method.textContent).toMatch(/^Site height \d+ m with a 2 m mast; hills measured from NASA elevation data/);
    expect(method.closest('.no-print')).toBeNull();
  });

  it('says what kind of point the site is under its place and period, and never offers a derived high point as a checked landing spot', async () => {
    const store = await storeWithFiles();
    render(<BriefView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Shackleton rim summit'));
    const kind = screen.getByRole('heading', { level: 1 }).nextElementSibling!.nextElementSibling!;
    expect(kind.textContent).toBe("A derived point: the highest ground on the crater rim in NASA's height data, worked out by this app. It has not been checked as a safe place to land.");
    await act(() => store.getState().selectSite('haworth'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Haworth'));
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling!.nextElementSibling!.textContent).toBe('The rough centre of a wider region, give or take 5\u00a0km, not a chosen landing point.');
  });

  it('gives an Apollo landing its date, says the table cannot reach it, and reads its flat horizon in the method', async () => {
    const store = await storeWithFiles();
    render(<BriefView store={store} />);
    await act(() => store.getState().selectSite('apollo_11'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Apollo 11'));
    const kind = screen.getByRole('heading', { level: 1 }).nextElementSibling!.nextElementSibling!;
    expect(kind.textContent).toBe(
      'A surveyed point: the lander has been found in images taken from orbit. It landed on 20 July 1969, before the years this app covers (2024 to 2036), so the figures are for the period above.',
    );
    const method = screen.getByRole('heading', { name: 'How this was computed' }).nextElementSibling!;
    expect(method.textContent).toMatch(/a flat horizon \(no polar height data there\)/);
    expect(method.textContent).toMatch(/There are no hills on this horizon: the place lies outside NASA's polar elevation grids, so the horizon is taken as flat; the Sun counts as up when any part of it clears the horizon\./);
    expect(method.textContent).not.toMatch(/20 m within 6 km/);
  });

  it('says on the far side that Earth never rises, and names the 240 m grid for a polar site north of 80° S', async () => {
    const store = await storeWithFiles();
    render(<BriefView store={store} />);
    await act(() => store.getState().selectSite('cp12_schrodinger'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CP-12 Schrödinger'));
    expect(screen.getByRole('main').textContent).toMatch(/No radio contact: this is the far side, where Earth never rises\./);
    const method = screen.getByRole('heading', { name: 'How this was computed' }).nextElementSibling!;
    expect(method.textContent).toMatch(/NASA LRO LOLA's 240 m elevation grid out to 220 km \(the finer grids stop at 80° S\)/);
    expect(screen.getByRole('main').textContent).not.toMatch(/NaN/);
  });

  it('renders a custom site with its computed provenance', async () => {
    const store = await storeWithFiles();
    render(<BriefView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    act(() => {
      store.getState().applyMask(
        { id: 'custom_x', name: 'Custom site -89.500°, 10.000°', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' },
        new Float64Array(720).fill(1),
        { siteHeightM: 100, source: 'computed', failedTiles: 0 },
      );
    });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Custom site/));
    expect(screen.getByText(/hills worked out in your browser/)).toBeTruthy();
    expect(screen.getByText(/coordinates picked by the user/)).toBeTruthy();
  });

  it('says in plain words when the data cannot be loaded', async () => {
    const missing = () =>
      createExploreStore(
        fileLoaders({
          loadSites: async () => {
            throw new Error('could not load /data/sites.json (HTTP 404)');
          },
        }),
      );
    // Two sentences in two paragraphs, which textContent runs together.
    const plain = /The data could not be loaded\.\s*Reload the page, or try again in a minute\./;
    render(<BriefView store={missing()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    // A print page has no frame: the words sit in the brief's own column, in its print colours.
    expect(screen.getByRole('alert').closest('.brief')).toBeTruthy();
    // Under next dev, as in tests, the page also names the command that fills web/public/data, then the error.
    expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles.*HTTP 404/);
    // The page has no header, so the way back must be there even though no data came.
    expect(screen.getByRole('link', { name: 'Back to Explore' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    vi.stubEnv('NODE_ENV', 'production');
    cleanup();
    render(<BriefView store={missing()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(plain));
    expect(screen.getByRole('alert').textContent).not.toMatch(/sync-local|HTTP 404/);
  });
});

describe('BriefView narration', () => {
  it('shows the template summary by default and the model paragraph after "Let the assistant write it"', async () => {
    const store = await storeWithFiles();
    const narrate = vi.fn(async () => ({ source: 'model' as const, model: 'google/gemma-4-31b-it:free', reply: 'Model paragraph about the rim.' }));
    render(<BriefView store={store} narrate={narrate} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Mission summary' })).toBeTruthy();
    expect(screen.getByTestId('narration').textContent).toMatch(/^Shackleton rim summit .*keeps power for all 30 days/);
    expect(screen.getByText(/written by the app from the figures below/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Let the assistant write it' }));
    await waitFor(() => expect(screen.getByTestId('narration').textContent).toBe('Model paragraph about the rim.'));
    expect(screen.getByText(/^narrated by gemma-4-31b; each number, unit and cause checked against the figures below$/)).toBeTruthy();
    expect(narrate).toHaveBeenCalledTimes(1);
    expect((narrate.mock.calls[0] as unknown[])[0]).toMatchObject({ site: { id: 'shackleton_center_rim_high' } });
  });

  it('keeps the template and says so when narration fails', async () => {
    const store = await storeWithFiles();
    render(
      <BriefView
        store={store}
        narrate={async () => {
          throw new Error('Failed to fetch');
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Let the assistant write it' }));
    await waitFor(() => expect(screen.getByText(/assistant is offline/)).toBeTruthy());
    expect(screen.getByTestId('narration').textContent).toMatch(/keeps power for all 30 days/);
  });
});

describe('BriefView narration labels', () => {
  it('says why the paragraph is the template, and passes a busy message through', async () => {
    const store = await storeWithFiles();
    const narrate = vi
      .fn()
      .mockResolvedValueOnce({ source: 'template', reason: 'cached', reply: 'T1' })
      .mockResolvedValueOnce({ source: 'template', reason: 'numbers', problems: ['"67 %" for sunlight, where the figures say 100 %'], reply: 'T2' })
      .mockRejectedValueOnce(new Error('Too many questions; try again in 12 s.'));
    render(<BriefView store={store} narrate={narrate} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Let the assistant write it' }));
    await waitFor(() => expect(screen.getByText(/demo mode; written by the app from the figures below/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Let the assistant write it' }));
    // The template stands, and the page says what in the model's paragraph did not match.
    await waitFor(() =>
      expect(screen.getByText(/^the model's paragraph did not match the figures \("67 %" for sunlight, where the figures say 100 %\); written by the app from the figures below$/)).toBeTruthy(),
    );
    // A number and its unit stay on one line, as everywhere on the page (the matcher above folds the no-break space).
    expect(screen.getByText(/did not match the figures/).textContent).toContain('say 100\u00a0%)');
    expect(screen.getByTestId('narration').textContent).toBe('T2');
    fireEvent.click(screen.getByRole('button', { name: 'Let the assistant write it' }));
    await waitFor(() => expect(screen.getByText(/try again in 12 s/)).toBeTruthy());
    expect(screen.getByTestId('narration').textContent).toMatch(/keeps power for all 30 days/);
  });
});
