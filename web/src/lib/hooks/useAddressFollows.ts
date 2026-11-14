import { useEffect } from 'react';

/** The address's own switches, which say how to show the page rather than what it shows: kept as the visitor gave them. */
const VIEW_SWITCHES = ['demo', 'theme'];

/**
 * The address a page writes for `href` (its site, period and settings): `href` with the view's own switches from the
 * address as it was, and the place on the page (#ask). Nothing else is kept, so a setting back at its default leaves
 * the address with it.
 */
export function addressFor(href: string, search: string, hash: string): string {
  const was = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const kept = VIEW_SWITCHES.flatMap((k) => was.getAll(k).map((v) => `${k}=${encodeURIComponent(v)}`));
  const query = kept.length === 0 ? href : `${href}${href.includes('?') ? '&' : '?'}${kept.join('&')}`;
  return `${query}${hash}`;
}

/**
 * Keeps the address bar on `href` once `ready`, so a reload or an address copied from the bar opens the same figures.
 * `ready` waits until the page has read the address it opened with: written sooner, the page's defaults would replace
 * a shared link before it was read.
 */
export function useAddressFollows(href: string | null, ready: boolean): void {
  useEffect(() => {
    if (!ready || !href || typeof window === 'undefined') return;
    const { pathname, search, hash } = window.location;
    const next = addressFor(href, search, hash);
    // Next.js keeps its router in step with the history API's replaceState.
    if (next !== `${pathname}${search}${hash}`) window.history.replaceState(null, '', next);
  }, [href, ready]);
}
