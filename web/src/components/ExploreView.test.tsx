// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { ExploreView } from './ExploreView';

/** The page with the real catalogue and sky; `search` is the address it opens with. */
async function open(search = '', navigate: (href: string) => void = () => {}) {
  window.history.replaceState({}, '', `/explore${search}`);
  const store = createExploreStore(fileLoaders());
  const view = render(<ExploreView store={store} navigate={navigate} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 20_000 });
  return { store, ...view };
}
const heading = () => screen.getByRole('heading', { level: 1 }).textContent ?? '';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('ExploreView', () => {
  it("shows the answer for the default site as the page's heading, with one gold action", async () => {
    await open();
    expect(heading()).toMatch(/de Gerlache Rim 2/);
    expect(heading()).toMatch(/Landing on 1 January: power for 3 days 4 hours, then night/);
    const gold = screen.getByRole('main').querySelectorAll('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toMatch(/^Land on 20 January/);
  });

  it('lands on the better date when its button is pressed', async () => {
    const { store } = await open();
    fireEvent.click(screen.getByRole('button', { name: /^Land on 20 January/ }));
    expect(store.getState().startUtc).toBe('2027-01-20T10:00:00');
    await waitFor(() => expect(heading()).toMatch(/12 days 15 hours/));
  });

  it('offers Compare as the gold action when no date in the period does better', async () => {
    const navigate = vi.fn();
    const { store } = await open('?site=shackleton_center_rim_high', navigate);
    await waitFor(() => expect(heading()).toMatch(/Landing on 1 January: power for all 30 days/));
    const gold = screen.getByRole('main').querySelectorAll<HTMLElement>('.btn-primary');
    expect(gold).toHaveLength(1);
    expect(gold[0].textContent).toBe('Compare sites');
    fireEvent.click(gold[0]);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/compare'));
    expect(store.getState().compareIds).toContain('shackleton_center_rim_high');
  });

  it('puts the answer first and the time bar last, and names every region', async () => {
    await open();
    const names = ['Why: the 30 days, hour by hour', 'The ground', 'Where on the Moon', 'Ask in plain words'];
    const regions = names.map((name) => screen.getByRole('region', { name }));
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i - 1].compareDocumentPosition(regions[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const slider = screen.getByRole('slider', { name: 'Time' });
    expect(regions[regions.length - 1].compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('moves the time from the keyboard and says what is happening at that hour', async () => {
    const { store } = await open();
    act(() => store.getState().setCursor(66));
    const bar = screen.getByRole('region', { name: 'Time' });
    const before = bar.textContent;
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'ArrowRight' });
    expect(store.getState().cursorHour).toBe(67);
    // Hour 67 is when the Sun goes behind the hills on 3 January.
    await waitFor(() => expect(bar.textContent).toMatch(/Sun behind the hills/));
    expect(bar.textContent).not.toBe(before);
  });

  it('opens the lander settings from the band and applies a preset', async () => {
    const { store } = await open();
    fireEvent.click(screen.getByRole('button', { name: /Lander/ }));
    const dialog = screen.getByRole('dialog', { name: 'The lander' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /20 m² panel, 500 W, 50 kWh battery/ }));
    expect(store.getState().params.power.batteryWh).toBe(50000);
    expect(screen.getByRole('region', { name: 'The numbers' }).textContent).toMatch(/20 m² panel that turns to the Sun, uses 500 W, 50 kWh battery/);
  });

  it('applies the site, start and length from the address', async () => {
    await open('?site=blue_ghost_m1&start=2025-03-02&days=14');
    await waitFor(() => expect(heading()).toMatch(/Blue Ghost/));
    expect(heading()).toMatch(/Landing on 2 March: power for all 14 days/);
  });

  it('keeps instrument and programme names out of the page', async () => {
    await open();
    expect(screen.getByRole('main').textContent).not.toMatch(/LOLA|DE440|Horizons|CLPS|ephemeris|skyline/);
  });

  it('says what to do when the data files are missing', async () => {
    const store = createExploreStore(
      fileLoaders({
        loadSites: async () => {
          throw new Error('could not load /data/sites.json (HTTP 404)');
        },
      }),
    );
    render(<ExploreView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Data files are missing\..*sync-local --tiles/));
  });

  it('shows an error it cannot explain', async () => {
    const store = createExploreStore(
      fileLoaders({
        loadEphemeris: async () => {
          throw new Error('the table is broken');
        },
      }),
    );
    render(<ExploreView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Something went wrong while loading\..*the table is broken/));
  });

  it('has no audience switch, no guided story and no cockpit', async () => {
    await open();
    expect(screen.queryByRole('button', { name: 'Planner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Learn' })).toBeNull();
    expect(document.querySelector('[data-testid="cockpit"]')).toBeNull();
  });
});
