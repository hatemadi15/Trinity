// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { ShareDialog } from './ShareDialog';

async function haworth() {
  const store = createExploreStore(fileLoaders());
  await store.getState().init();
  await store.getState().selectSite('haworth');
  store.getState().setParams({ minEarthElDeg: 2 });
  const s = store.getState();
  return { site: s.site!, startUtc: s.startUtc, days: s.days, params: s.params, eph: s.eph!, series: s.series!, power: s.power!, summary: s.summary!, maskMeta: s.maskMeta, best: s.best };
}

const LINK = 'https://earthrise.example/explore?site=haworth&start=2027-01-01&days=30&earthmin=2';
const versions = { app: { version: '0.1.0', commit: 'abc123def456' }, data: { sites: 'sites.json version 1', ephemeris: null } };

describe('ShareDialog', () => {
  it('gives the link to the same figures and copies it', async () => {
    const copy = vi.fn(async () => {});
    render(<ShareDialog input={await haworth()} link={LINK} versions={versions} onClose={() => {}} copy={copy} save={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Share and download' });
    expect(within(dialog).getByRole('textbox', { name: 'Link to these figures' })).toHaveProperty('value', LINK);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(copy).toHaveBeenCalledWith(LINK);
    await waitFor(() => expect(within(dialog).getByRole('status').textContent).toBe('Link copied.'));
  });

  it('says how to copy the link by hand when the browser will not let the page copy it', async () => {
    const copy = vi.fn(async () => {
      throw new Error('denied');
    });
    render(<ShareDialog input={await haworth()} link={LINK} versions={versions} onClose={() => {}} copy={copy} save={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('The browser would not copy it: select the link above and copy it.'));
  });

  it('saves the three tables and the settings file beside them, each named for the site and period', async () => {
    const save = vi.fn();
    render(<ShareDialog input={await haworth()} link={LINK} versions={versions} onClose={() => {}} copy={async () => {}} save={save} />);
    const dialog = screen.getByRole('dialog', { name: 'Share and download' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hour by hour (CSV)' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'All numbers (CSV)' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Radio windows (CSV)' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Settings and sources (JSON)' }));
    expect(save.mock.calls.map(([name, , type]) => [name, type])).toEqual([
      ['earthrise_haworth_2027-01-01_30d_hourly.csv', 'text/csv;charset=utf-8'],
      ['earthrise_haworth_2027-01-01_30d_numbers.csv', 'text/csv;charset=utf-8'],
      ['earthrise_haworth_2027-01-01_30d_radio_windows.csv', 'text/csv;charset=utf-8'],
      ['earthrise_haworth_2027-01-01_30d_about.json', 'application/json'],
    ]);
    expect(save.mock.calls[0][1]).toMatch(/^time_utc,sun_elevation_deg,/);
    const about = JSON.parse(save.mock.calls[3][1]);
    expect(about.link).toBe(LINK);
    expect(about.settings.earth_min_clearance_deg).toBe(2);
    expect(about.versions.commit).toBe('abc123def456');
    // Times are in UTC, and the dialog says why the tables are plain and where their settings went.
    expect(dialog.textContent).toMatch(/UTC/);
    expect(dialog.textContent).toMatch(/first row names the columns/);
  });
});
