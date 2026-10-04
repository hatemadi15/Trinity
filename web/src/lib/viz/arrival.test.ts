import { describe, expect, it } from 'vitest';
import { HOME } from '@/lib/data/home';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { recompute } from '@/lib/store/explore';
import { eph, sites } from '@/test/file-loaders';
import { answerFor } from './answer';
import { arrivalWords, hero } from './arrival';
import { standHeadline } from './stand';

const engine = () => {
  const site = sites.find((s) => s.id === HOME.hero.site_id)!;
  const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', `${site.id}.json`).elevation_deg);
  return { site, r: recompute(eph, site, mask, '2027-01-01T00:00:00', 30) };
};
const plain = (t: string) => t.replace(/ /g, ' ');

describe('the arrival', () => {
  it('draws the engine’s month at the hero site: the pipeline’s figures agree with the engine’s', () => {
    const h = hero(), { r } = engine();
    for (let k = 0; k < 720; k += 7) {
      expect(h.series.sunEl[k]).toBeCloseTo(r.series.sunEl[k], 1);
      expect(h.series.earthAz[k]).toBeCloseTo(r.series.earthAz[k], 1);
      expect(Math.abs(h.series.sunFraction[k] - r.series.sunFraction[k])).toBeLessThan(0.03);
    }
    expect(h.power.firstBrownoutHour).toBe(r.power.firstBrownoutHour);
    expect(h.power.firstBrownoutHour).toBe(HOME.battery.now_hours);
    expect(h.siteHeightM).toBeCloseTo(190.33, 1);
    expect(h.earthKm[10]).toBeGreaterThan(360000);
  });

  it('gives the standing beat Explore’s answer for the site, as the stand view words it, with the better day', () => {
    const w = arrivalWords(), { site, r } = engine();
    const a = answerFor({ siteName: 'de Gerlache Rim 2', series: r.series, summary: r.summary, power: r.power, startUtc: '2027-01-01T00:00:00', days: 30, loadW: 200, batteryWh: 2000, best: r.best });
    expect(w.answer).toBe(standHeadline(a.title, 'de Gerlache Rim 2', r.series, r.power, '2027-01-01T00:00:00', a.contactHours, a.poweredHours));
    expect(plain(w.answer)).toBe('Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days without power');
    expect(plain(w.better ?? '')).toBe('Land on 20 January instead: power for 12 days 15 hours in a row.');
    expect(w.siteLine).toMatch(/^Standing at de Gerlache Rim 2, near the Moon's south pole\./);
    expect(w.exploreHref).toBe(`/explore?site=${site.id}&start=2027-01-01&days=30`);
    expect(w.beats).toEqual(['At the south pole the Sun never climbs: it circles the horizon once a month.', 'One hill can hide it for weeks.', 'This ridge was shortlisted for astronauts.']);
  });
});
