// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Summary } from '@/lib/engine/metrics';
import { DEFAULT_POWER, simulateBattery } from '@/lib/engine/power';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { NumbersCard } from './NumbersCard';

const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x', approximate: true };
const summary: Summary = { hours: 720, illumFraction: 0.4458, meanSunFraction: 0.44, longestDarkH: 399, earthVisFraction: 0.45, longestEarthGapH: 396, jointFraction: 0.2 };
// 66 lit hours, then darkness: the default battery carries the next ten, so the power lasts 76 hours.
const power = simulateBattery(Float64Array.from({ length: 720 }, (_, h) => (h < 66 ? 1600 : 0)), DEFAULT_POWER);

function show(extra: Partial<Parameters<typeof NumbersCard>[0]> = {}) {
  render(
    <NumbersCard
      site={site}
      summary={summary}
      power={power}
      params={DEFAULT_PARAMS}
      days={30}
      maskMeta={{ siteHeightM: 1432, source: 'featured', failedTiles: 0 }}
      contactHours={0}
      {...extra}
    />,
  );
}

describe('NumbersCard', () => {
  it('gives the three numbers behind the answer, each with what it measures', () => {
    show();
    const card = screen.getByRole('region', { name: 'The numbers' });
    expect(card.textContent).toMatch(/Sunlight.*share of the 30 days with the Sun above the hills.*45 %/);
    // Contact is counted in the hours the lander has power, the figure the verdict gives; the whole period's share is in the note.
    expect(card.textContent).toMatch(/Radio contact while it has power.*Earth is in view 45 % of the 30 days, but not while the lander has power.*none/);
    expect(card.textContent).toMatch(/Lander.*4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery.*10 h.*of battery when full/);
    expect(card.textContent).not.toMatch(/skyline|LOLA|brownout/i);
  });

  it('gives the hours of contact while the lander has power', () => {
    show({ contactHours: 77 });
    expect(screen.getByRole('region', { name: 'The numbers' }).textContent).toMatch(/Radio contact while it has power.*3 d 5 h/);
  });

  it('opens every number in a dialog, in plain words', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'All numbers' }));
    const dialog = screen.getByRole('dialog', { name: 'All numbers' });
    const row = (label: string) => within(dialog).getByRole('rowheader', { name: label }).closest('tr')?.textContent ?? '';
    expect(row('Sunlight')).toMatch(/44\.6 %/);
    expect(row('Longest night')).toMatch(/16 d 15 h/);
    expect(row('Contact with Earth')).toMatch(/45\.0 %/);
    expect(row('Longest time without Earth')).toMatch(/16 d 12 h/);
    expect(row('Sunlight and Earth together')).toMatch(/20\.0 %/);
    expect(row('Time with power from the start')).toMatch(/3 d 4 h/);
    expect(row('Time without power')).toMatch(/26 d 20 h/);
    expect(row('Lowest battery')).toMatch(/0 %/);
    expect(row('Average power from the panel')).toMatch(/147 W/);
    expect(row('Mast')).toMatch(/2 m/);
    expect(row('Earth counts as in view')).toMatch(/0° or more above the hills/);
    expect(row('Height of the hills')).toMatch(/NASA elevation data, worked out ahead of time/);
    expect(row('Where')).toMatch(/88\.280° S, 64\.310° W.*1432 m.*centre of the region.*about 5 km/);
    expect(dialog.textContent).not.toMatch(/skyline|LOLA|DE440|brownout/i);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says where the hills come from for a place worked out in the browser and for a flat horizon', () => {
    show({ maskMeta: { siteHeightM: 10, source: 'computed', failedTiles: 3, mastM: 5 }, params: { ...DEFAULT_PARAMS, mastM: 5, minEarthElDeg: 2 } });
    fireEvent.click(screen.getByRole('button', { name: 'All numbers' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/worked out in your browser/);
    expect(dialog.textContent).toMatch(/3 pieces of the elevation map could not be loaded/);
    expect(dialog.textContent).toMatch(/2° or more above the hills/);
    expect(dialog.textContent).toMatch(/5 m/);
  });

  it('links to the printable brief and leaves comparing to the verdict and the page header', () => {
    show();
    expect(screen.getByRole('link', { name: 'Printable brief' }).getAttribute('href')).toBe('/brief');
    // Readers counted three ways to compare on one screen; the card has none.
    expect(screen.queryByRole('button', { name: /compare/i })).toBeNull();
  });

  it('says in All numbers when a place lies outside the polar elevation maps', () => {
    show({ maskMeta: { siteHeightM: 0, source: 'flat', failedTiles: 0 } });
    fireEvent.click(screen.getByRole('button', { name: 'All numbers' }));
    expect(screen.getByRole('dialog').textContent).toMatch(/flat: this place lies outside the polar elevation maps/);
  });
});
