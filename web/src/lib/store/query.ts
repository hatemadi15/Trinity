import { normalizeUtc } from '../ai/actions';
import { periodDays } from '../period';
import type { WindowDays } from './explore';

/** What a landing-page card or a shared link may ask Explore to open. */
export interface ExploreQuery {
  site?: string;
  startUtc?: string;
  days?: WindowDays;
}

const SITE_ID = /^[a-z0-9_]{1,64}$/;
/** A clicked point's id as the store writes it: the latitude and longitude to four places, `custom_-89.5000_10.0000`. */
const CUSTOM_ID = /^custom_(-?\d{1,2}\.\d{4})_(-?\d{1,3}\.\d{4})$/;

/** The latitude and longitude a clicked point's id names; null for any other id, or numbers that name no point. */
export function customPoint(id: string): { lat: number; lon: number } | null {
  const m = CUSTOM_ID.exec(id);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** Reads `?site=&start=&days=`, the start at its whole hour; anything malformed is left out rather than reported. */
export function parseExploreQuery(search: string | URLSearchParams): ExploreQuery {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const out: ExploreQuery = {};
  const site = q.get('site');
  // No catalogue id starts with "custom_": an id that does must be a whole clicked point's, minus signs and decimal points included.
  if (site && (site.startsWith('custom_') ? customPoint(site) !== null : SITE_ID.test(site))) out.site = site;
  const start = q.get('start');
  const startUtc = start ? normalizeUtc(start) : null;
  if (startUtc) out.startUtc = startUtc;
  // Any whole number of days the period controls take; an old link's 14, 30 or 90 among them.
  const days = periodDays(q.get('days') ?? '');
  if (days !== null) out.days = days;
  return out;
}
