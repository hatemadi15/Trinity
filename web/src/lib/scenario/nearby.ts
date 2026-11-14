import type { Site } from '../data/loaders';
import { nearestSites } from '../viz/relief';
import type { Outcome } from './outcome';

/**
 * The nearby search behind "Find a nearby alternative": the catalogue sites within reach of a scenario's site, each
 * worked out with that scenario's own settings, and the one that does best. The objectives part of the app ranks
 * alternatives in time and place; this small module is where its ranking takes over.
 */

/** How far the search looks, as the forecast's own nearby advice does. */
export const NEARBY_KM = 30;

/** The catalogue sites within `maxKm` of a site, nearest first; never the site itself, never a clicked point. */
export function nearbyCandidates(site: Site, sites: Site[], maxKm = NEARBY_KM): { site: Site; km: number }[] {
  return nearestSites(site, sites, sites.length).filter((c) => c.km <= maxKm);
}

/** Better for the lander first: the longest time with power, then the most radio contact while it has power, then the most sunlight. */
export function rankOutcomes(a: Outcome, b: Outcome): number {
  return b.poweredH - a.poweredH || b.poweredContactH - a.poweredContactH || b.sunFraction - a.sunFraction;
}

/** The candidate that does best, if it does better than the scenario's own figures; the nearest wins a tie. */
export function bestNearby<T extends { site: Site; km: number; outcome: Outcome }>(own: Outcome, tried: T[]): T | null {
  const best = [...tried].sort((x, y) => rankOutcomes(x.outcome, y.outcome) || x.km - y.km)[0];
  return best && rankOutcomes(best.outcome, own) < 0 ? best : null;
}
