/** Explore on one site and period: the address the site list, the place panel and Compare link to. */
export function exploreHref(siteId: string, startUtc: string, days: number): string {
  const start = startUtc.endsWith('T00:00:00') ? startUtc.slice(0, 10) : startUtc.slice(0, 16);
  return `/explore?site=${siteId}&start=${start}&days=${days}`;
}

/** The stand view for a site, period and hour. */
export function standHref(siteId: string, startUtc: string, days: number, hour: number): string {
  return `${exploreHref(siteId, startUtc, days).replace('/explore?', '/explore/stand?')}&hour=${hour}`;
}
