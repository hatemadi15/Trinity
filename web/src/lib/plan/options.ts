import type { Site } from '../data/loaders';
import type { LandingScan } from '../engine/landing';
import type { Series } from '../engine/metrics';
import type { PowerConfig } from '../engine/power';
import { isoAt } from '../viz/format';
import { nearestSites } from '../viz/relief';
import { outcomeScanner, worstOf, type Outcome } from './outcome';
import { compareOptions, optionOf, pickApart, rankOptions, tradeOffs, whyAbove, type Option, type TradeOff } from './rank';
import type { Requirements } from './requirements';

/** An alternative to the current choice: its checks, what it gains and loses against the current one, and why it ranks above the next. */
export interface Row<T> extends Option<T> {
  trade: TradeOff[];
  /** Why it ranks above the next alternative (the next one the search found, for the last shown); null when there is none. */
  why: string | null;
}

/** The current choice and the best few alternatives, with the one to recommend when it does better. */
export interface Recommendation<T> {
  current: Option<T>;
  /** Best first; the current choice is not among them. */
  alternatives: Row<T>[];
  /** The first alternative when it ranks above the current choice and gives more: fewer failed requirements, or more power. */
  better: Row<T> | null;
  /** Why the better one ranks above the current choice, in a sentence. */
  betterWhy: string | null;
}

function recommend<T>(kind: 'time' | 'place', current: Option<T>, picks: Option<T>[], top: number, currentName: string, gives: (a: Option<T>, cur: Option<T>) => boolean): Recommendation<T> {
  const alternatives = picks.slice(0, top).map((o, i) => ({ ...o, trade: tradeOffs(o.outcome, current.outcome), why: picks[i + 1] ? whyAbove(o, picks[i + 1], kind) : null }));
  const first = alternatives[0];
  const better = first && compareOptions(first, current) < 0 && gives(first, current) ? first : null;
  return { current, alternatives, better, betterWhy: better ? whyAbove(better, current, kind, currentName) : null };
}

/** Fewer failed requirements, or more power in a row by at least `marginH`. */
const givesMore =
  (marginH: number) =>
  <T>(a: Option<T>, cur: Option<T>) =>
    a.failed < cur.failed || a.outcome.poweredH >= cur.outcome.poweredH + marginH;

/** A landing time: hours from the period start, and the UTC instant. */
export interface LandingTime {
  hour: number;
  startUtc: string;
}

/**
 * The better landing time inside the period: every sunlit hour after the start is tried for a stay as long as the
 * period, on the series the store scans (it runs a period past the end), and ranked against landing at the start.
 * Alternatives are kept `apartH` hours apart.
 */
export function timeOptions({ scan, cfg, req, hours, startUtc, top = 3, apartH = 72 }: { scan: Series; cfg: PowerConfig; req: Requirements; hours: number; startUtc: string; top?: number; apartH?: number }): Recommendation<LandingTime> {
  const at = outcomeScanner(scan, cfg);
  const current = optionOf({ hour: 0, startUtc }, at(0, hours), req);
  const candidates: Option<LandingTime>[] = [];
  for (let h = 1; h < hours && h < scan.hours; h++) {
    const o = at(h, hours);
    if (o.sunlitAtLanding) candidates.push(optionOf({ hour: h, startUtc: isoAt(startUtc, h) }, o, req));
  }
  return recommend('time', current, pickApart(rankOptions(candidates), apartH, top + 1), top, 'landing at the period start', givesMore(1));
}

/** A catalogue site near the current one. */
export interface NearbyPlace {
  site: Site;
  km: number;
}

/**
 * The better place nearby: the catalogue sites within `maxKm` whose figures are in (`outcomes`, by site id), and any
 * `extra` places worked out for it (the spots round an approximate site), each from the same landing hour, ranked
 * against the current site, the nearer first on a tie. One is recommended only when it fails fewer requirements or
 * keeps power at least `marginH` hours longer: an hour or two is within what the terrain data can tell apart.
 */
export function placeOptions({
  site,
  sites,
  outcomes,
  extra = [],
  current,
  req,
  maxKm = 30,
  top = 3,
  marginH = 24,
}: {
  site: Site;
  sites: Site[];
  outcomes: Record<string, Outcome | undefined>;
  extra?: { place: NearbyPlace; outcome: Outcome }[];
  current: Outcome;
  req: Requirements;
  maxKm?: number;
  top?: number;
  marginH?: number;
}): Recommendation<NearbyPlace> {
  const catalogue = nearestSites(site, sites, sites.length).flatMap((x) => {
    const o = outcomes[x.site.id];
    return x.km <= maxKm && o ? [{ place: x, outcome: o }] : [];
  });
  const candidates = [...extra.filter((x) => x.place.km <= maxKm), ...catalogue].sort((a, b) => a.place.km - b.place.km).map((x) => optionOf<NearbyPlace>(x.place, x.outcome, req));
  return recommend('place', optionOf<NearbyPlace>({ site, km: 0 }, current, req), rankOptions(candidates).slice(0, top + 1), top, 'this site', givesMore(marginH));
}

/** A landing time of the 12-month search, with each site's own outcome (one for one site). */
export interface YearChoice {
  hour: number;
  startUtc: string;
  perSite: Outcome[];
}

/**
 * The 12-month search: the landing hours of `scan` (every `step` hours) at which every site is sunlit, each judged on
 * the worst site's figures when there are several, ranked with the requirements; the best `top`, kept `apartH` hours
 * apart (two weeks by default, so each is another lunar day or month rather than the same one again). The current
 * choice is landing at the scan's first hour.
 */
export function yearOptions({ scans, cfg, req, scan, startUtc, top = 3, apartH = 14 * 24 }: { scans: Series[]; cfg: PowerConfig; req: Requirements; scan: LandingScan; startUtc: string; top?: number; apartH?: number }): Recommendation<YearChoice> {
  const at = scans.map((s) => outcomeScanner(s, cfg));
  const choice = (hour: number): Option<YearChoice> => {
    const perSite = at.map((f) => f(hour, scan.capHours));
    return optionOf({ hour, startUtc: isoAt(startUtc, hour), perSite }, worstOf(perSite), req);
  };
  const candidates: Option<YearChoice>[] = [];
  const last = Math.min(scan.to, ...scans.map((s) => s.hours));
  for (let h = scan.from; h < last; h += scan.step) {
    const c = choice(h);
    if (c.item.perSite.every((o) => o.sunlitAtLanding)) candidates.push(c);
  }
  return recommend('time', choice(scan.from), pickApart(rankOptions(candidates), apartH, top + 1), top, 'the date you started from', () => true);
}
