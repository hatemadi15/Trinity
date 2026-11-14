import { clockUtc, dayMonth, spanShort } from '../viz/format';
import type { VersionsSummary } from './figures';

/** The fold's closed label: two words, so the verdict keeps to its first-screen words. */
export const VERSIONS_LABEL = 'Terrain versions';

/** Where the versions come from, in one line for the waiting state and the fold. */
export const VERSIONS_SOURCE = 'NASA’s adjusted south-pole map (PGDA product 90)';

export interface VersionsView {
  /** In how many versions the landing still gives its answer, in one sentence. */
  held: string;
  /** Each key result's range over the versions, with the app's own figure beside it. */
  ranges: string[];
  /** Whether the app's own figure lies outside every version for some result. */
  outside: boolean;
  /** What the versions are and what they assume. */
  about: string;
  /** What a share of versions does not establish. */
  limits: string;
}

type Span = [number, number];

export const ABOUT =
  `Each version is ${VERSIONS_SOURCE} with height errors as large, and as patchy, as two generations of NASA’s maps of the same ground differ by: about a metre and a half, more on slopes, changing from one map pixel to the next. ` +
  'Each version’s skyline is traced as the app traces its own, and the figures are the app’s own engine on it, for the same lander, landing and period.';

export const LIMITS =
  'A share of versions is not the chance that the landing works: it is only as good as the error model, which leaves out errors both maps share, hills smaller than a map pixel, the lander’s own height, tilt and placement, and the battery’s temperature. ' +
  'The verdict above stays that of the app’s own skyline.';

const OUTSIDE_WHY =
  ' Where the app’s own figure lies outside every version, the older maps the app reads and NASA’s adjusted map disagree by more than the versions spread, most often over the height of the site itself.';

/**
 * The versions' results in words: how often the landing still gives its answer (meets the requirements set, or with
 * none keeps its verdict), then the range of time with power, the first sunset, the longest night and contact with Earth
 * while powered, each with the app's own figure and a word when that lies outside every version.
 */
export function versionsView(r: VersionsSummary, { startUtc, days }: { startUtc: string; days: number }): VersionsView {
  const hours = days * 24;
  const n = r.versions;
  const of = (k: number) => (k === n ? `all ${n}` : k === 0 ? `none of the ${n}` : `${k} of ${n}`);
  let held: string;
  if (r.basis === 'requirements') {
    held = r.main.meets ? `Still meets your requirements in ${of(r.held)} versions of the ground.` : `Meets your requirements in ${of(r.held)} versions of the ground; on the app’s own skyline it fails them.`;
  } else if (r.main.allPeriod) {
    held = `Power lasts all ${days} days in ${of(r.held)} versions of the ground, as it does here${r.held < n ? `; in ${n - r.held} the battery runs out first` : ''}.`;
  } else {
    held = `The battery runs out in ${of(r.held)} versions of the ground, as it does here${r.held < n ? `; in ${n - r.held} power lasts all ${days} days` : ''}.`;
  }
  let outside = false;
  // `unit` follows a range and the app's own figure once each: "3 Jan 18:00 to 3 Jan 21:00 UTC".
  const line = (name: string, s: Span | null, here: number | null, f: (h: number) => string, extra = '', unit = '') => {
    const out = here !== null && s !== null && (here < s[0] || here > s[1]);
    outside ||= out;
    // Every version gives the app's own figure: said once.
    if (s !== null && here !== null && s[0] === here && s[1] === here && !extra) return `${name}: ${f(here)}${unit} in every version, as here.`;
    const range = s === null ? 'none in any version' : `${s[0] === s[1] ? f(s[0]) : `${f(s[0])} to ${f(s[1])}`}${unit}`;
    return `${name}: ${range}${extra} (here ${here === null ? 'none' : `${f(here)}${unit}`}${out ? ', outside every version' : ''}).`;
  };
  const power = (h: number) => (h >= hours ? `all ${days} days` : spanShort(h));
  const at = (h: number) => `${dayMonth(startUtc, h)} ${clockUtc(startUtc, h)}`;
  const span = (h: number) => (h > 0 ? spanShort(h) : 'none');
  const sunset = line('First sunset', r.firstSunsetH, r.main.firstSunsetH, at, r.firstSunsetH && r.noSunset > 0 ? `, none in the period in ${r.noSunset} versions` : '', ' UTC');
  const contact = r.poweredContactH[1] === 0 && r.main.poweredContactH === 0 ? 'Contact with Earth while powered: none in every version, as here.' : line('Contact with Earth while powered', r.poweredContactH, r.main.poweredContactH, span);
  const ranges = [line('Time with power', r.poweredH, r.main.poweredH, power), sunset, line('Longest night', r.longestNightH, r.main.longestNightH, span), contact];
  return { held, ranges, outside, about: ABOUT, limits: LIMITS + (outside ? OUTSIDE_WHY : '') };
}
