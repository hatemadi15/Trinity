import { HOME, heroSeries, type HomeDoc } from '../data/home';
import { DEFAULT_POWER, powerBudget } from '../engine/power';
import { contactPlan } from './contact';

/** A stretch of the month's hours, half-open [from, to). */
export interface Stretch {
  from: number;
  to: number;
}

/** A stretch without radio contact, and the one thing it lacks first: Earth, or with Earth in view, power. */
export interface NoContact extends Stretch {
  why: 'earth' | 'power';
}

/**
 * The home page's lander step (spec 23.2): radio contact needs Earth in view and power at once, so the month is drawn
 * as three lanes: the hours with sunlight on the site (a solar lander's power), the hours with Earth in view, and the
 * hours with both. Every other hour is given the thing it lacks.
 */
export interface HomeContact {
  hours: number;
  sunlight: Stretch[];
  earth: Stretch[];
  both: Stretch[];
  none: NoContact[];
  /** Hours with sunlight and Earth in view together. */
  bothHours: number;
  /** Landing at the month's start: hours of contact before the battery first runs out (the engine's battery walk). */
  firstLandingHours: number;
  /** Landing on the better day: hours of its power with Earth in view (the pipeline's share of them). Null without one. */
  betterLandingHours: number | null;
}

function stretches(n: number, on: (h: number) => boolean): Stretch[] {
  const out: Stretch[] = [];
  let from = -1;
  for (let h = 0; h <= n; h++) {
    const is = h < n && on(h);
    if (is && from < 0) from = h;
    if (!is && from >= 0) {
      out.push({ from, to: h });
      from = -1;
    }
  }
  return out;
}

export function homeContact(doc: HomeDoc = HOME): HomeContact {
  const { sky, battery } = doc;
  const n = sky.hours;
  const lit = (h: number) => sky.lit[h] === 1;
  const up = (h: number) => sky.earth_visible[h] === 1;
  const both = stretches(n, (h) => lit(h) && up(h));
  const none: NoContact[] = [
    ...stretches(n, (h) => !up(h)).map((s) => ({ ...s, why: 'earth' as const })),
    ...stretches(n, (h) => up(h) && !lit(h)).map((s) => ({ ...s, why: 'power' as const })),
  ].sort((a, b) => a.from - b.from);
  const series = heroSeries(doc);
  const plan = contactPlan(series, powerBudget(series, DEFAULT_POWER));
  return {
    hours: n,
    sunlight: stretches(n, lit),
    earth: stretches(n, up),
    both,
    none,
    bothHours: both.reduce((sum, s) => sum + s.to - s.from, 0),
    firstLandingHours: plan.sureHours,
    betterLandingHours: battery.best_hours !== null && battery.best_earth_fraction !== null ? Math.round(battery.best_hours * battery.best_earth_fraction) : null,
  };
}
