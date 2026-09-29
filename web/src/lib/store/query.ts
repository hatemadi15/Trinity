import { normalizeUtc } from '../ai/actions';
import type { WindowDays } from './explore';

/** What a landing-page card or a shared link may ask Explore to open. */
export interface ExploreQuery {
  site?: string;
  startUtc?: string;
  days?: WindowDays;
}

const SITE_ID = /^[a-z0-9_]{1,64}$/;
const DAYS: readonly number[] = [14, 30, 90];

/** Reads `?site=&start=&days=`; anything malformed is left out rather than reported. */
export function parseExploreQuery(search: string | URLSearchParams): ExploreQuery {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const out: ExploreQuery = {};
  const site = q.get('site');
  if (site && SITE_ID.test(site)) out.site = site;
  const start = q.get('start');
  const startUtc = start ? normalizeUtc(start) : null;
  if (startUtc) out.startUtc = startUtc;
  const days = Number(q.get('days'));
  if (DAYS.includes(days)) out.days = days as WindowDays;
  return out;
}
