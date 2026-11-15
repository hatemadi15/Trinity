import catalogue from '../data/catalogue.json';
import { HOME, type HomeDoc } from '../data/home';
import { siteLabel, type Site } from '../data/loaders';
import { arrivalWords, POLE_SENTENCE, shortlistedSentence, type ArrivalWords } from './arrival';
import { psSouthLatLon, reliefKm } from './descentPose';

/* The descent's words (spec 23.1), worked out on the server so they are page text; the pose is in descentPose.ts. */

/** The labels on the polar map: the pole, its best-known crater and the hero site. */
export interface DescentPin {
  id: string;
  label: string;
  lat: number;
  lon: number;
  hero: boolean;
}

/** The words of the descent, worked out on the server: a line per stage, the pins, and the answer for the site. */
export interface DescentWords extends Pick<ArrivalWords, 'siteLine' | 'answer' | 'better' | 'exploreHref'> {
  turn: { eyebrow: string; text: string };
  pole: { eyebrow: string; text: string };
  site: { eyebrow: string; text: string };
  pins: DescentPin[];
  /** How many known places the catalogue holds, for the first screen's "Pick a known site". */
  knownSites: number;
  hero: { lat: number; lon: number; windowKm: number; image: string; wideKm: number; wide: string; relief: string; reliefHalfKm: number };
}

export function descentWords(doc: HomeDoc = HOME): DescentWords {
  const sites = catalogue.sites as unknown as Site[];
  const heroSite = sites.find((s) => s.id === doc.hero.site_id);
  if (!heroSite) throw new Error(`the catalogue has no ${doc.hero.site_id}`);
  const name = siteLabel(heroSite);
  const frame = new Date(`${doc.hero.frame_utc}Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const a = arrivalWords(doc);
  const pin = (id: string, label: string, hero = false): DescentPin[] => {
    const p = doc.relief.sites.find((s) => s.id === id);
    if (!p) return [];
    const { x, y } = reliefKm(p.u, p.v, doc.relief.half_km);
    return [{ id, label, ...psSouthLatLon(x, y), hero }];
  };
  return {
    turn: { eyebrow: 'The Moon turns once a month', text: POLE_SENTENCE },
    pole: {
      eyebrow: `The south pole · ${Math.round(doc.relief.half_km * 2)} km across`,
      text: 'Here the hills decide: crater floors that never see the Sun lie beside ridges that almost never lose it.',
    },
    site: {
      eyebrow: `${name} · ${Math.round(doc.hero.window_km)} km across`,
      text: `${shortlistedSentence(name)} Black is ground the Sun cannot reach on ${frame}.`,
    },
    pins: [...pin('south_pole', 'The south pole'), ...pin('malapert_massif', 'Malapert Massif'), ...pin('mons_mouton', 'Mons Mouton'), ...pin(doc.hero.site_id, name, true)],
    hero: { lat: heroSite.lat, lon: heroSite.lon, windowKm: doc.hero.window_km, image: doc.hero.image, wideKm: doc.hero.wide_km, wide: doc.hero.wide_image, relief: doc.relief.image, reliefHalfKm: doc.relief.half_km },
    knownSites: sites.length,
    siteLine: a.siteLine,
    answer: a.answer,
    better: a.better,
    exploreHref: a.exploreHref,
  };
}
