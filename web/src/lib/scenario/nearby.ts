import type { Site } from '../data/loaders';
import { placeOptions } from '../plan/options';
import type { Outcome as PlanOutcome } from '../plan/outcome';
import { BY_POWER, type RankBy } from '../plan/rank';
import type { Requirements } from '../plan/requirements';
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

/**
 * The candidate to offer, ranked with the planner's requirements (lib/plan): every site that meets them all before any
 * that fails one, then the objective (by default the longest time with power, then contact while powered; or the
 * priorities Explore's options are ranked by), the nearer first on a tie. It is offered when it fails fewer requirements
 * than the scenario's own site or gives more by the objective's measure; null when none does better.
 */
export function bestNearbyFor<T extends { site: Site; km: number; plan: PlanOutcome }>(here: Site, own: PlanOutcome, tried: T[], req: Requirements, by: RankBy = BY_POWER): T | null {
  const extra = tried.map((t) => ({ place: { site: t.site, km: t.km }, outcome: t.plan }));
  const better = placeOptions({ site: here, sites: [], outcomes: {}, extra, current: own, req, maxKm: Infinity, marginH: 1, by }).better;
  return better ? (tried.find((t) => t.site.id === better.item.site.id) ?? null) : null;
}
