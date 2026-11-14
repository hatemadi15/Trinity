// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ENERGY_ONLY, POWER_ASSUMPTIONS } from '@/components/PowerScope';
import type { Series, Summary } from '@/lib/engine/metrics';
import { DEFAULT_POWER, simulateBattery } from '@/lib/engine/power';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { NumbersCard } from './NumbersCard';

const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x' };
const summary: Summary = { hours: 720, illumFraction: 0.4458, meanSunFraction: 0.44, longestDarkH: 399, earthVisFraction: 0.45, longestEarthGapH: 396, jointFraction: 0.2 };
const power = simulateBattery(Float64Array.from({ length: 720 }, (_, h) => (h < 66 ? 1600 : 0)), DEFAULT_POWER);
/** The Sun 1.6° up until it sets at hour 66, then below the horizon; Earth out of view. */
const series: Series = {
  i0: 0,
  hours: 720,
  sunAz: new Float64Array(720),
  sunEl: Float64Array.from({ length: 720 }, (_, h) => (h < 66 ? 1.6 : -1.2)),
  earthAz: new Float64Array(720),
  earthEl: new Float64Array(720),
  sunFraction: Float64Array.from({ length: 720 }, (_, h) => (h < 66 ? 1 : 0)),
  earthVisible: new Uint8Array(720),
  sunAu: new Float64Array(720).fill(1),
};

describe('NumbersCard and the power model’s scope', () => {
  it('keeps what the power figures assume in a fold under All numbers', () => {
    render(<NumbersCard site={site} summary={summary} power={power} params={DEFAULT_PARAMS} days={30} maskMeta={{ siteHeightM: 1432, source: 'featured', failedTiles: 0 }} contactHours={0} series={series} hour={30} startUtc="2027-01-01T00:00:00" />);
    expect(screen.queryByRole('button', { name: /What the power figures assume/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All numbers' }));
    const dialog = screen.getByRole('dialog', { name: 'All numbers' });
    const fold = within(dialog).getByRole('button', { name: 'What the power figures assume' });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(fold);
    for (const line of POWER_ASSUMPTIONS) expect(within(dialog).getByText(line)).toBeTruthy();
    expect(within(dialog).getByText(ENERGY_ONLY)).toBeTruthy();
  });
});
