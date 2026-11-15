import type { Site } from '../data/loaders';
import type { SiteOverview } from '../store/explore';
import { trustedOverview } from '../viz/terrain';

/*
 * The site list's order (components/sites/SitesView), for the assistant's "compare this to every landing site": the
 * same rules, repeated here because the list keeps them to itself. A test renders the list and checks the two agree.
 */

/** A place that never sees Earth in its first days after landing: the list puts it after the others. */
const noContact = (o: SiteOverview | undefined) => o !== undefined && o.afterEarth === 0;
/** The far side, where Earth never rises (data/sites.json "far_side"): the list puts it last. */
const farSide = (site: Site) => site.far_side === true;

/** The list's score: the longest time with power, then sunlight; a site with incomplete terrain after them, one without figures last. */
export function listScore(o: SiteOverview | undefined): number {
  return o ? (o.terrain?.quality === 'incomplete' ? -1e6 : 0) + (o.best?.poweredHours ?? -1) * 10 + o.afterSun : -1e7;
}

/** The list's tiers, before the score: the sites with Earth in view first, then those without, then the far side. */
export function listTier(site: Site, o: SiteOverview | undefined): number {
  return farSide(site) ? 2 : noContact(o) ? 1 : 0;
}

/** The catalogue (custom points left out) in the site list's order for the overview's dates and lander. */
export function rankSites(sites: Site[], overview: Record<string, SiteOverview | undefined>): Site[] {
  return sites
    .filter((x) => x.category !== 'custom')
    .sort((a, b) => listTier(a, overview[a.id]) - listTier(b, overview[b.id]) || listScore(overview[b.id]) - listScore(overview[a.id]));
}

/**
 * The sites that may be named best, in the list's order: worked out from the chosen mast height, with a terrain
 * that is not incomplete (its figures could be too high) and some time with power from the Sun.
 */
export function nameableSites(sites: Site[], overview: Record<string, SiteOverview | undefined>, mastM: number): Site[] {
  const trusted = trustedOverview(overview, mastM);
  return rankSites(sites, overview).filter((x) => trusted[x.id]?.best);
}
