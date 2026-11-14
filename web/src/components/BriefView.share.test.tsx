// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { BriefView } from './BriefView';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('the brief from its own address', () => {
  it('opens in a fresh browser on the site, the period and the settings its address names, and Back to Explore keeps them', async () => {
    window.history.replaceState({}, '', '/brief?site=haworth&start=2027-02-01&days=14&load=400&earthmin=2');
    const store = createExploreStore(fileLoaders());
    render(<BriefView store={store} narrate={async () => ({ reply: '', source: 'template' })} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Haworth'), { timeout: 20_000 });
    expect(store.getState().days).toBe(14);
    expect(screen.getByRole('heading', { name: 'The lander' }).nextElementSibling!.textContent).toMatch(/uses 400 W.*clears the hills by at least 2°/);
    expect(screen.getByRole('link', { name: 'Back to Explore' }).getAttribute('href')).toBe('/explore?site=haworth&start=2027-02-01&days=14&load=400&earthmin=2');
  });

  it('names the same better date as Explore when the address sets requirements, says why, and lists each one met or failed', async () => {
    // Shackleton rim summit keeps power all 30 days from 1 January, but Earth is out of view at that landing.
    window.history.replaceState({}, '', '/brief?site=shackleton_center_rim_high&earthby=0');
    const store = createExploreStore(fileLoaders());
    render(<BriefView store={store} narrate={async () => ({ reply: '', source: 'template' })} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Shackleton rim summit'), { timeout: 20_000 });
    expect(store.getState().requirements).toEqual({ minPoweredH: null, contactWithinH: 0, maxOutageH: null, minPoweredContactH: null });
    const verdict = screen.getByRole('region', { name: 'Landing at Shackleton rim summit on 1 January: power for all 30 days' });
    expect(verdict.textContent).toContain('From 10 January, 09:00 UTC: power for 22 days 16 hours in a row.');
    expect(verdict.textContent).toContain('It meets every requirement; landing at the period start fails one: Earth in view at landing (not until 9 d 9 h after landing).');
    const req = screen.getByRole('region', { name: 'Your requirements' });
    expect(within(req).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Fails Earth in view at landing: not until 9 d 9 h after landing, 9 d 9 h late', 'Meets Earth in view at landing: yes']);
    expect(req.textContent).toContain('Landing on 10 Jan 2027, 09:00 UTC, the better date above:');
    // The way back, the printed link and the address keep them.
    expect(screen.getByRole('link', { name: 'Back to Explore' }).getAttribute('href')).toBe('/explore?site=shackleton_center_rim_high&start=2027-01-01&days=30&earthby=0');
    expect(screen.getByRole('region', { name: 'Settings, sources and versions' }).textContent).toContain(`${window.location.origin}/explore?site=shackleton_center_rim_high&start=2027-01-01&days=30&earthby=0`);
    await waitFor(() => expect(window.location.search).toBe('?site=shackleton_center_rim_high&start=2027-01-01&days=30&earthby=0'));
  });

  it('lists the requirement on terrain versions as not checked where none were worked out, and never says the better date meets every requirement', async () => {
    window.history.replaceState({}, '', '/brief?site=shackleton_center_rim_high&earthby=0&minhold=90');
    const store = createExploreStore(fileLoaders());
    const missing = async () => {
      throw new Error('could not load /data/ensemble/shackleton_center_rim_high.json (HTTP 404)');
    };
    render(<BriefView store={store} narrate={async () => ({ reply: '', source: 'template' })} versions={{ load: missing }} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Shackleton rim summit'), { timeout: 20_000 });
    expect(store.getState().requirements).toMatchObject({ contactWithinH: 0, minHoldPct: 90 });
    const req = screen.getByRole('region', { name: 'Your requirements' });
    const unchecked = 'Holds in at least 90 % of terrain versions: not checked here (no terrain versions were drawn for this site)';
    await waitFor(() =>
      expect(within(req).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Fails Earth in view at landing: not until 9 d 9 h after landing, 9 d 9 h late', unchecked, 'Meets Earth in view at landing: yes', unchecked]),
    );
    // The better date is the one Explore names, and its reason says what was checked here.
    const verdict = screen.getByRole('region', { name: 'Landing at Shackleton rim summit on 1 January: power for all 30 days' });
    expect(verdict.textContent).toContain('From 10 January, 09:00 UTC: power for 22 days 16 hours in a row.');
    expect(verdict.textContent).toContain('It meets the requirement checked here; landing at the period start fails one: Earth in view at landing (not until 9 d 9 h after landing).');
    expect(verdict.textContent).not.toMatch(/meets every requirement|meets your requirement/i);
  });

  it('lists the requirement on terrain versions even when it is the only one set', async () => {
    window.history.replaceState({}, '', '/brief?site=shackleton_center_rim_high&minhold=90');
    const store = createExploreStore(fileLoaders());
    const missing = async () => {
      throw new Error('could not load /data/ensemble/shackleton_center_rim_high.json (HTTP 404)');
    };
    render(<BriefView store={store} narrate={async () => ({ reply: '', source: 'template' })} versions={{ load: missing }} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Shackleton rim summit'), { timeout: 20_000 });
    const req = screen.getByRole('region', { name: 'Your requirements' });
    await waitFor(() => expect(within(req).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Holds in at least 90 % of terrain versions: not checked here (no terrain versions were drawn for this site)']));
    expect(req.textContent).toContain('Landing at the period start, 1 Jan 2027, 00:00 UTC:');
  });

  it('prints the settings, the sources, the versions and the assumptions behind the figures, in UTC, with the link that opens them again', async () => {
    window.history.replaceState({}, '', '/brief?site=haworth&load=400&earthmin=2');
    const store = createExploreStore(fileLoaders());
    render(<BriefView store={store} narrate={async () => ({ reply: '', source: 'template' })} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Haworth'), { timeout: 20_000 });
    const section = screen.getByRole('region', { name: 'Settings, sources and versions' });
    // It prints: the provenance is the brief's, not the screen's.
    expect(section.closest('.no-print')).toBeNull();
    const row = (name: string) => within(section).getByRole('rowheader', { name }).closest('tr')!.textContent ?? '';
    expect(row('Period (UTC)')).toMatch(/2027-01-01 00:00 to 2027-01-31 00:00 UTC, 30 days, one value per hour/);
    expect(row('Settings')).toMatch(/turns to the Sun \(vertical_tracking\), 4 m², 30 % efficient; load 400 W; battery 2000 Wh, 100 % full at landing; mast 2 m; Earth counts from 2° above the skyline/);
    expect(row('Skyline')).toMatch(/masks\/haworth\.json.*from a 2 m mast.*LOLA LDEM 80 m \(ldem_80s_80m\) from 40 m to 100 km/);
    expect(row('Sun and Earth')).toMatch(/JPL DE440.*hourly from 2024-01-01 00:00 to 2036-12-31 23:00 UTC/);
    expect(row('Versions')).toMatch(/^VersionsEarthrise /);
    expect(within(section).getByRole('list', { name: 'What the figures take as given' }).querySelectorAll('li').length).toBeGreaterThanOrEqual(5);
    expect(section.textContent).toContain(`${window.location.origin}/explore?site=haworth&start=2027-01-01&days=30&load=400&earthmin=2`);
    // The files go with it, on the screen only.
    const downloads = screen.getByRole('region', { name: 'Download the figures' });
    expect(downloads.classList.contains('no-print')).toBe(true);
    expect(downloads.textContent).toMatch(/in the JSON file beside them, and in the section above\./);
    const created = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    const was = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = created;
    URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      fireEvent.click(within(downloads).getByRole('button', { name: 'Radio windows (CSV)' }));
      expect(created).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
    } finally {
      click.mockRestore();
      URL.createObjectURL = was.create;
      URL.revokeObjectURL = was.revoke;
    }
  });
});
