import type { PictureRow, PicturesDoc } from '../data/validation';
import type { EvidenceCard } from './checks';

/**
 * The Accuracy page's check of the app's shadows against camera pictures from orbit, in the page's plain words,
 * worked out from the pictures' own rows (`data/validation/images.json`, written by the pipeline's `images`
 * command): every number here comes from the table, so the words cannot drift from it.
 */

/** A picture meets the mark when the two calls agree on enough of its ground and the app finds enough of both kinds. */
export function picturePasses(row: Pick<PictureRow, 'agree' | 'light_found' | 'shadow_found'>, rule: { min_agree: number; min_found: number }): boolean {
  return row.agree >= rule.min_agree && [row.light_found, row.shadow_found].every((f) => f === null || f >= rule.min_found);
}

/** A place without its qualifiers or its landing site: "IM-2 Athena landing site (Mons Mouton)" is "IM-2 Athena". */
export const shortPlace = (name: string) => name.replace(/\s*\(.*\)$/, '').replace(/ landing site$/, '');

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x: number) => `${Math.round(x * 100)} %`;
const listed = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs.join(''));
const day = (iso: string, year = true) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });

/** "20 September to 10 October 2009", or with both years when they differ. */
function span(first: string, last: string): string {
  if (first.slice(0, 10) === last.slice(0, 10)) return day(first);
  return first.slice(0, 4) === last.slice(0, 4) ? `${day(first, false)} to ${day(last)}` : `${day(first)} to ${day(last)}`;
}

/** The check's card: its mark worked out from the rows, its figure the typical picture's agreement. */
export function picturesCard(doc: PicturesDoc): EvidenceCard {
  const rule = doc.evidence.criteria;
  const rows = doc.rows;
  const failing = rows.filter((r) => !picturePasses(r, rule));
  const pass = rows.length > 0 && failing.length === 0;
  const wac = rows.filter((r) => r.camera === 'WAC').sort((a, b) => a.mid_utc.localeCompare(b.mid_utc));
  const nac = rows.filter((r) => r.camera === 'NAC').sort((a, b) => a.mid_utc.localeCompare(b.mid_utc));
  const names = new Map(doc.sites.map((s) => [s.site_id, shortPlace(s.name)]));
  const places = doc.sites.filter((s) => s.pictures > 0).map((s) => shortPlace(s.name));
  const without = doc.sites.filter((s) => s.pictures === 0).map((s) => shortPlace(s.name));
  const minEl = doc.evidence.coverage.min_sun_el_deg;
  const els = rows.map((r) => r.sun_el_deg);

  const cameras: string[] = [];
  if (wac.length > 0) cameras.push(`${wac.length} from the Wide Angle Camera (100 m pixels), ${span(wac[0].mid_utc, wac[wac.length - 1].mid_utc)}, one for each quarter of the Sun's circle with the Sun at least ${minEl}° up`);
  if (nac.length > 0) {
    const at = [...new Set(nac.map((r) => names.get(r.site_id) ?? r.site_id))];
    cameras.push(`${nac.length} from the Narrow Angle Camera (20 m pixels) beside ${listed(at)} on ${span(nac[0].mid_utc, nac[nac.length - 1].mid_utc)}`);
  }
  const testedText =
    `${rows.length} pictures of ${places.length} sites: ${listed(places)}. ${cameras.join('; ')}.` + (without.length > 0 ? ` ${listed(without)} had no picture with the Sun ${minEl}° up.` : '');

  const leftOut: string[] = [];
  if (rows.length > 0 && rows.every((r) => r.app_lit < r.seen_lit)) leftOut.push('In every picture the app draws more shadow than the camera shows.');
  if (failing.length > 0) {
    const worstEl = Math.max(...failing.map((r) => r.sun_el_deg));
    const short = failing.filter((r) => r.light_found !== null && r.light_found < rule.min_found);
    const range = (xs: number[]) => (Math.round(Math.min(...xs) * 100) === Math.round(Math.max(...xs) * 100) ? pct(xs[0]) : `${Math.round(Math.min(...xs) * 100)} to ${pct(Math.max(...xs))}`);
    leftOut.push(
      `The ${failing.length} ${failing.length === 1 ? 'picture that falls' : 'pictures that fall'} short all had the Sun ${worstEl.toFixed(1)}° up or less` +
        (short.length > 0
          ? `: there the app draws shadow on ${range(short.map((r) => 1 - r.light_found!))} of the ground the camera saw lit (with NASA's newer terrain, ${range(short.map((r) => 1 - (r.product90.light_found ?? 1)))}).`
          : '.'),
    );
  }
  const year2009 = wac.length > 0 && nac.length > 0 ? `All but ${nac.length} come from one month` : 'They come from one month';
  leftOut.push(
    `Whether a pixel is lit is judged from its brightness against what sunlight would give that slope, and ground facing away from the Sun is left out. The wide-angle pictures place a shadow's edge only to within 100 m. ${year2009}, with the Sun ${Math.min(...els).toFixed(1)}° to ${Math.max(...els).toFixed(1)}° up; a lower Sun is not tested.`,
  );

  return {
    id: 'pictures',
    kind: 'check',
    title: 'Where shadows fall in pictures from orbit',
    pass,
    mark: pass ? 'Passes: every picture meets the mark' : `Misses: ${failing.length} of ${rows.length} pictures fall short`,
    figure: rows.length > 0 ? pct(median(rows.map((r) => r.agree))) : 'no pictures',
    figureWords: `of the ground the app and the camera call alike, lit or dark, in the typical picture of ${rows.length}`,
    sentence:
      `The app's shadows for the moment each picture was taken, laid over ${rows.length} pictures from the cameras on NASA's Lunar Reconnaissance Orbiter. ` +
      `Where they differ, it is almost always at the edge of a shadow (${pct(median(rows.map((r) => r.disagree_on_edges ?? 0)))} of that ground, in the typical picture); ` +
      `with the Sun put a quarter of the way round, they would agree on only ${pct(median(rows.map((r) => r.agree_sun_turned_90)))}.`,
    parts: [
      { label: 'What it shows', text: "That the app's terrain and its Sun put shadows where a camera saw them: the shadow map Explore draws, worked out for the moment of each picture and laid over it pixel by pixel." },
      {
        label: 'Passes when',
        text: `In every picture the app and the camera call at least ${pct(rule.min_agree)} of the ground alike, and the app gets at least ${pct(rule.min_found)} of the ground the camera shows lit, and ${pct(rule.min_found)} of the ground it shows dark, right. The mark was set after a first look at five pictures.`,
      },
      { label: 'Tested on', text: testedText },
      { label: 'What it leaves out', text: leftOut.join(' ') },
    ],
  };
}
