import { describe, expect, it } from 'vitest';
import { degreesText, HOME } from '@/lib/data/home';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { recompute } from '@/lib/store/explore';
import { eph, sites } from '@/test/file-loaders';
import { answerFor } from './answer';
import { arrivalWords, hero, POLE_SENTENCE, shortlistedSentence } from './arrival';
import { spanWords } from './format';
import { betterLabel, standHeadline } from './stand';

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
    // To the hour, as the headline above it says its spans: the forecast below it and the stand view's better day
    // give this landing the same length, so the page never gives one landing two.
    expect(plain(w.better ?? '')).toBe('Land on 20 January instead: power for 12 days 15 hours in a row.');
    expect(plain(w.better ?? '')).toContain(`power for ${spanWords(HOME.battery.best_hours!)} in a row`);
    expect(plain(betterLabel('20 January', r.best!.poweredHours, r.best!.poweredHours * r.best!.earthFraction))).toMatch(/^Try 20 January instead: power for 12 days 15 hours, /);
    // Its spans on one line each, as on the stand view's link.
    expect(w.better).toContain('12 days 15 hours');
    expect(w.siteLine).toMatch(/^Standing at de Gerlache Rim 2, near the Moon's south pole\./);
    expect(w.exploreHref).toBe(`/explore?site=${site.id}&start=2027-01-01&days=30`);
    // Each beat reads on its own (the caption before it has scrolled away), and says who shortlisted the ridge;
    // after landing the month runs on at the site, and its middle says what happened, from the engine's moments.
    expect(w.beats.map(plain)).toEqual([
      'At the south pole the Sun never climbs: it circles the horizon once a month.',
      'NASA has shortlisted de Gerlache Rim 2, this ridge, for astronauts to land on.',
      'Land a small uncrewed solar lander here on 1 January 2027, as an example: the Sun stands just above the hills.',
      'One hill can keep the Sun out of sight for weeks. Here is January at this spot, sped up.',
      "Earth rises on 10 January, but the lander's battery ran out on 4 January.",
    ]);
  });

  it('names the ridge NASA shortlisted by the hero site’s own name, so the sentence follows the hero and not a name written into the page', () => {
    // Only the site changes here: the month's figures stay the home page's, and the sentence does not use them.
    const w = arrivalWords({ ...HOME, hero: { ...HOME.hero, site_id: 'shackleton_center' } });
    expect(plain(w.beats[1])).toBe('NASA has shortlisted Shackleton crater floor, this ridge, for astronauts to land on.');
    expect(w.beats[1]).toBe(shortlistedSentence('Shackleton crater floor'));
    // The pole's sentence names no site, so it reads the same wherever the hero stands.
    expect(w.beats[0]).toBe(POLE_SENTENCE);
    expect(arrivalWords().beats[1]).toBe(shortlistedSentence('de Gerlache Rim 2'));
  });

  it('gives the first screen one line on where its numbers come from and how they were checked, with the Horizons figure the home page’s table gives', () => {
    const w = arrivalWords();
    expect(w.proof).toBe("Built on NASA LRO LOLA terrain and JPL DE440; checked against JPL Horizons to 0.00003° and LOLA sunlight maps.");
    // The figure is the field and the rounding of the first row of "Checked against NASA", so the two never disagree.
    expect(w.proof).toContain(`to ${degreesText(HOME.facts.horizons_worst_el_deg)} and`);
    // It follows the data: another largest gap, another line.
    expect(arrivalWords({ ...HOME, facts: { ...HOME.facts, horizons_worst_el_deg: 0.0004 } }).proof).toContain("checked against JPL Horizons to 0.00040° and LOLA sunlight maps.");
  });
});
