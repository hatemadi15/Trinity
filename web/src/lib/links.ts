/** Explore on one site and period: the address the site list, the place panel and Compare link to. */
export function exploreHref(siteId: string, startUtc: string, days: number): string {
  const start = startUtc.endsWith('T00:00:00') ? startUtc.slice(0, 10) : startUtc.slice(0, 16);
  return `/explore?site=${siteId}&start=${start}&days=${days}`;
}

/** The stand view for a site, period and hour. */
export function standHref(siteId: string, startUtc: string, days: number, hour: number): string {
  return `${exploreHref(siteId, startUtc, days).replace('/explore?', '/explore/stand?')}&hour=${hour}`;
}

/** The printable brief for a site and period: Explore's address on the brief's page, which reads it back the same way. */
export function briefHref(siteId: string, startUtc: string, days: number): string {
  return exploreHref(siteId, startUtc, days).replace('/explore?', '/brief?');
}

/** Any of these addresses with the lander's, the mast's and the radio's settings that differ from the defaults. */
export { withSettings } from './share/settings';

/** The planner: a pane of Choose a site, which `plan=1` opens. The old `/plan` address redirects here. */
export const PLAN_HREF = '/sites?plan=1';

/** Whether an address (its path, then its query) shows the planner. */
export function plannerShowing(path: string, search = ''): boolean {
  return path === '/sites' && new URLSearchParams(search).get('plan') === '1';
}
