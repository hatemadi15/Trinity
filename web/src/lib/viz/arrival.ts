import catalogue from '../data/catalogue.json';
import { HOME, heroMask, heroSeries, type HomeDoc } from '../data/home';
import { siteLabel, type Site } from '../data/loaders';
import { summarize, type Series } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerResult } from '../engine/power';
import { exploreHref } from '../links';
import { answerFor } from './answer';
import { dateLong, spanWords } from './format';
import { keyMoments, standHeadline, standingLine, unbrokenSpans } from './stand';

/** The hour the arrival shows: 1 January 2027, 10:00 UTC (the Sun on the ridge), the hour section 5 names. */
export const HERO_HOUR = 10;

/** The flight's first two sentences, over the pole and the cap (spec section 5, as amended in section 14). */
export const BEAT_SENTENCES: [string, string] = [
  'At the south pole the Sun never climbs: it circles the horizon once a month.',
  'NASA has shortlisted this ridge for astronauts to land on.',
];

export interface Hero { site: Site; series: Series; power: PowerResult; mask: Float64Array; siteHeightM: number; earthKm: number[]; startUtc: string; days: number }

/** The home page's site and month, as the arrival draws it: the pipeline's figures, the engine's power. */
export function hero(doc: HomeDoc = HOME): Hero {
  const site = (catalogue.sites as unknown as Site[]).find((s) => s.id === doc.hero.site_id);
  if (!site) throw new Error(`the catalogue has no ${doc.hero.site_id}`);
  const series = heroSeries(doc);
  return { site, series, power: powerBudget(series, DEFAULT_POWER), mask: heroMask(doc), siteHeightM: doc.hero.site_height_m, earthKm: doc.sky.earth_km, startUtc: doc.sky.start_utc, days: Math.round(doc.sky.hours / 24) };
}

/**
 * The beats' sentences, a screen each, between the first screen and the answer: the pole, the cap, the landing
 * (a small uncrewed solar lander: the battery that runs out later is its own, and no one is stranded with it),
 * standing as the month at the site begins, and its middle (from the engine's key moments).
 */
export interface ArrivalWords { beats: string[]; siteLine: string; answer: string; better: string | null; exploreHref: string }

/**
 * The arrival's words, worked out on the server so they are page text: the beats, then standing at the site
 * with Explore's answer as the stand view words it, the better landing day, and Explore's address. The better
 * day's power is said to the hour, as the headline says its spans and as the forecast below and the stand
 * view's better day say it: "power for 12 days 15 hours in a row".
 */
export function arrivalWords(doc: HomeDoc = HOME): ArrivalWords {
  const h = hero(doc), name = siteLabel(h.site), b = doc.battery;
  const best = b.best_hour !== null && b.best_hours !== null ? { hour: b.best_hour, poweredHours: b.best_hours, earthFraction: b.best_earth_fraction ?? 0 } : null;
  const answer = answerFor({ siteName: name, series: h.series, summary: summarize(h.series), power: h.power, startUtc: h.startUtc, days: h.days, loadW: DEFAULT_POWER.loadW, batteryWh: DEFAULT_POWER.batteryWh, best });
  const moments = keyMoments(h.series, h.power, h.startUtc), landing = dateLong(h.startUtc, HERO_HOUR), month = landing.split(' ').slice(-1)[0];
  const earthIn = moments.find((m) => m.kind === 'earth-in'), out = moments.find((m) => m.kind === 'battery-out' || m.kind === 'sunset-power-off');
  return {
    beats: [
      ...BEAT_SENTENCES,
      `Land a small uncrewed solar lander here on ${landing} ${h.startUtc.slice(0, 4)}, as an example: the Sun stands just above the hills.`,
      `One hill can keep the Sun set for weeks. Here is ${month} at this spot, sped up.`,
      earthIn && out
        ? `Earth rises on ${dateLong(h.startUtc, earthIn.hour)}, but the lander's battery ran out on ${dateLong(h.startUtc, out.hour)}.`
        : 'The month runs on: when the lander has power, and when it can see Earth.',
    ],
    siteLine: standingLine(h.site, name, 'top'),
    answer: standHeadline(answer.title, name, h.series, h.power, h.startUtc, answer.contactHours, answer.poweredHours),
    better: answer.better && best ? unbrokenSpans(`${answer.better.label}: power for ${spanWords(best.poweredHours)} in a row.`) : null,
    exploreHref: exploreHref(h.site.id, h.startUtc, h.days),
  };
}
