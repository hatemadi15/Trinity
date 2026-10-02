import type { Series } from './metrics';
import { powerSeries, type PowerConfig } from './power';

/** Hours in the year a best-date search covers. */
export const YEAR_HOURS = 365 * 24;

/** A landing hour and what the lander gets from it. Hours are indexes into the series that was scanned. */
export interface Landing {
  hour: number;
  /** Hours with power from the landing, capped at the period length (a mean when several sites are scored). */
  poweredHours: number;
  /** Share of those hours with Earth in view; 0 when there are none. */
  earthFraction: number;
}

/** Which landing hours to try: `from` up to but not including `to`, every `step` hours, counting at most `capHours` each. */
export interface LandingScan {
  from: number;
  to: number;
  step: number;
  capHours: number;
}

/** One entry per candidate landing hour. */
export interface LandingScores {
  hours: Int32Array;
  /** Time with power from that hour. */
  powered: Int32Array;
  /** How many of those hours have Earth in view. */
  contact: Int32Array;
  /** 1 where any part of the Sun is visible at the landing hour. */
  sunlit: Uint8Array;
}

/** Hours from the start of a battery walk to its first brownout: the whole walk when it never browns out. */
export function timeWithPower(power: { firstBrownoutHour: number | null; powerW: { length: number } }): number {
  return power.firstBrownoutHour ?? power.powerW.length;
}

/**
 * Hours with power for a lander that arrives at `hour` with the configured battery charge: the hours
 * to the first brownout, capped at `capHours` and at the end of `powerW`. The walk is the one in
 * `simulateBattery`, started at `hour`.
 */
export function poweredFrom(powerW: ArrayLike<number>, cfg: PowerConfig, hour: number, capHours: number): number {
  const cap = Math.max(0, cfg.batteryWh);
  let e = Math.min(cap, Math.max(0, cfg.initialSocFraction) * cap);
  const end = Math.min(powerW.length, hour + capHours);
  for (let h = hour; h < end; h++) {
    const next = e + powerW[h] - cfg.loadW;
    if (next < 0) return h - hour;
    e = Math.min(cap, next);
  }
  return Math.max(0, end - hour);
}

/** Time with power and contact with Earth for every candidate landing hour of a scan (none past the end of the series). */
export function landingScores(series: Series, cfg: PowerConfig, scan: LandingScan): LandingScores {
  const powerW = powerSeries(series, cfg);
  const vis = new Int32Array(series.hours + 1); // prefix sums of the hours with Earth in view
  for (let h = 0; h < series.hours; h++) vis[h + 1] = vis[h] + series.earthVisible[h];
  const last = Math.min(scan.to, series.hours);
  const count = last > scan.from ? Math.ceil((last - scan.from) / scan.step) : 0;
  const hours = new Int32Array(count);
  const powered = new Int32Array(count);
  const contact = new Int32Array(count);
  const sunlit = new Uint8Array(count);
  for (let k = 0; k < count; k++) {
    const h = scan.from + k * scan.step;
    const n = poweredFrom(powerW, cfg, h, scan.capHours);
    hours[k] = h;
    powered[k] = n;
    contact[k] = vis[h + n] - vis[h];
    sunlit[k] = series.sunFraction[h] > 0 ? 1 : 0;
  }
  return { hours, powered, contact, sunlit };
}

/**
 * The best landing hour for several sites at once (one site is the usual case): the longest mean time
 * with power, then the larger share of it with Earth in view, then the earlier hour. A lander arrives
 * in daylight, so only hours at which every site is sunlit are candidates; null when there is none.
 */
export function bestLandingAcross(scores: LandingScores[]): Landing | null {
  if (scores.length === 0) return null;
  const count = Math.min(...scores.map((s) => s.hours.length));
  let best: Landing | null = null;
  for (let k = 0; k < count; k++) {
    if (!scores.every((s) => s.sunlit[k] === 1)) continue;
    let powered = 0;
    let contact = 0;
    for (const s of scores) {
      powered += s.powered[k];
      contact += s.contact[k];
    }
    const poweredHours = powered / scores.length;
    const earthFraction = powered > 0 ? contact / powered : 0;
    if (!best || poweredHours > best.poweredHours || (poweredHours === best.poweredHours && earthFraction > best.earthFraction)) {
      best = { hour: scores[0].hours[k], poweredHours, earthFraction };
    }
  }
  return best;
}

/** The best landing hour of a scan for one site; see `bestLandingAcross`. */
export function bestLanding(series: Series, cfg: PowerConfig, scan: LandingScan): Landing | null {
  return bestLandingAcross([landingScores(series, cfg, scan)]);
}
