// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { dayLabel } from '@/lib/viz/year';
import { eph, sites } from '@/test/file-loaders';
import { YearView } from './YearView';

// The year's words, counted: the days are named once per year worked out, not on every redraw of the page.
vi.mock('@/lib/viz/year', async (original) => {
  const m = await original<typeof import('@/lib/viz/year')>();
  return { ...m, dayLabel: vi.fn(m.dayLabel) };
});

const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);

describe('YearView, redrawn', () => {
  it('names its 365 days once per year: Explore redrawn for the time bar’s hour, with a new handler each time, names none again', async () => {
    const props = { eph, site, mask, startUtc: '2027-01-01T00:00:00', days: 30, params: DEFAULT_PARAMS };
    const { rerender } = render(<YearView {...props} onLand={() => {}} />);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /^Land / })).toHaveLength(365), { timeout: 20_000 });
    await act(async () => {});
    vi.mocked(dayLabel).mockClear();
    // Play moves the hour a dozen times a second, and Explore redraws with a new arrow for onLand each time.
    for (let i = 0; i < 5; i++) rerender(<YearView {...props} onLand={() => {}} />);
    expect(vi.mocked(dayLabel)).not.toHaveBeenCalled();
    // A day chosen within the year moves the ring and the tab stop, and names no day again either.
    rerender(<YearView {...props} startUtc="2027-03-14T00:00:00" onLand={() => {}} />);
    expect(screen.getByRole('button', { current: 'date' }).getAttribute('aria-label')).toMatch(/^Land 14 March 2027/);
    expect(vi.mocked(dayLabel)).not.toHaveBeenCalled();
  });
});
