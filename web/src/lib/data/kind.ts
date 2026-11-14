import { dateLong } from '../viz/format';
import type { Site } from './loaders';

/**
 * What kind of point a catalogue coordinate is (the "kind" of data/sites.json): hardware located in images from orbit,
 * a landing point chosen in advance, the rough centre of a wider region, a point this app derives from NASA heights, or a
 * reference such as the pole. A point picked on the map is the user's own.
 */
export const POINT_KINDS = ['surveyed', 'target', 'region_centre', 'derived', 'reference'] as const;
export type PointKind = (typeof POINT_KINDS)[number] | 'picked';

export interface PointKindWords {
  kind: PointKind;
  /** Radius of the uncertainty the source states for the point (km), or null when it states none. */
  radiusKm: number | null;
  /** A few words for a list or a table: "Surveyed point, ±20 m". */
  short: string;
  /** One plain sentence: what the point is and how well it is known. */
  sentence: string;
}

/** A radius as a reader takes it in: metres below a kilometre, whole kilometres above, a no-break space before the unit. */
export function radiusText(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}\u00a0m` : `${Math.round(km)}\u00a0km`;
}

/** The kind of point a site is, in words for the public and with the radius a planner needs. */
export function pointKind(site: Pick<Site, 'kind' | 'uncertainty_km' | 'category'>): PointKindWords {
  const radiusKm = site.uncertainty_km ?? null;
  const r = radiusKm === null ? null : radiusText(radiusKm);
  const plus = r ? `, ±${r}` : '';
  switch (site.category === 'custom' ? 'picked' : site.kind) {
    case 'surveyed':
      return { kind: 'surveyed', radiusKm, short: `Surveyed point${plus}`, sentence: `A surveyed point: the lander has been found in images taken from orbit${r ? `, to within ${r}` : ''}.` };
    case 'target':
      return { kind: 'target', radiusKm, short: `Landing target${plus}`, sentence: `A landing target: a point chosen in advance${r ? `, give or take ${r}` : ''}, not a place where a lander stands.` };
    case 'region_centre':
      return { kind: 'region_centre', radiusKm, short: `Centre of a region${plus}`, sentence: `The rough centre of a wider region${r ? `, give or take ${r}` : ''}, not a chosen landing point.` };
    case 'derived':
      // A terrain-height maximum is only that: the words never offer it as a place to land.
      return {
        kind: 'derived',
        radiusKm,
        short: 'Derived high point, not checked as safe to land',
        sentence: "A derived point: the highest ground on the crater rim in NASA's height data, worked out by this app. It has not been checked as a safe place to land.",
      };
    case 'reference':
      return { kind: 'reference', radiusKm, short: 'Reference point', sentence: 'A reference point to compare with, not a landing site.' };
    default:
      return { kind: 'picked', radiusKm: null, short: 'Point you chose', sentence: 'A point you chose on the map.' };
  }
}

/** The catalogue's categories in the order the site list gives them, each under a short name for a menu. */
export const CATEGORY_GROUPS: { name: string; categories: string[] }[] = [
  { name: 'Artemis III regions', categories: ['artemis3'] },
  { name: 'Commercial landers', categories: ['clps_landed'] },
  { name: 'Coming commercial landings', categories: ['clps_planned'] },
  { name: "Other countries' landers", categories: ['international'] },
  { name: 'Apollo landings', categories: ['apollo'] },
  { name: 'High points and crater floors', categories: ['classic', 'reference'] },
];

/** The first and last hours the Sun and Earth table covers (data/ephemeris, 2024 to 2036, UTC). */
export const TABLE_FIRST_UTC = '2024-01-01T00:00:00';
export const TABLE_LAST_UTC = '2036-12-31T23:00:00';

/**
 * The day a lander landed: its date in words, and whether the table covers it. Inside the table it opens on the first
 * whole hour after the landing, as the home page's landers do; a landing before 2024 (Apollo, the landers of 2013 to
 * 2023) keeps its date only, as no figure can be worked out for it. A site where nothing landed has none.
 */
export function landedWords(site: Pick<Site, 'landed_utc'>): { date: string; inTable: boolean; startUtc: string | null } | null {
  if (!site.landed_utc) return null;
  const at = new Date(site.landed_utc.endsWith('Z') ? site.landed_utc : `${site.landed_utc}Z`);
  const hour = new Date(Math.ceil(at.getTime() / 3_600_000) * 3_600_000).toISOString().slice(0, 19);
  const date = `${dateLong(site.landed_utc.slice(0, 19), 0)} ${site.landed_utc.slice(0, 4)}`;
  const inTable = hour >= TABLE_FIRST_UTC && hour <= TABLE_LAST_UTC;
  return { date, inTable, startUtc: inTable ? hour : null };
}
