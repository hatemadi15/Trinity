import { degreesText, HOME, thousandsText } from '../data/home';
import type { BackcastRow, ValidationDocs } from '../data/validation';

/** One check on the Accuracy page: its title (the home page's words), whether it passes, its headline figure and one plain sentence. */
export interface CheckCard {
  id: 'directions' | 'sunlight' | 'nights';
  title: string;
  pass: boolean;
  mark: string;
  figure: string;
  figureWords: string;
  sentence: string;
}

/** The directions are checked against a target of a hundredth of a degree. */
const DIRECTIONS_TARGET_DEG = 0.01;
/** A site's sunlight counts as agreeing when it is within this many percentage points of the map. */
const SUNLIGHT_POINTS = 5;
/** Within this many hours of the predicted sunset, a reported mission end counts as agreeing with it. */
export const SUNSET_AGREEMENT_H = 6;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** A place without its qualifiers: "Connecting Ridge (Shackleton–de Gerlache ridge)" is "Connecting Ridge". */
const placeName = (r: { name: string }) => r.name.replace(/\s*\(.*\)$/, '').split(',')[0];

/** The lander, not its site: "IM-1 Odysseus landing site (Malapert A)" is "IM-1 Odysseus". */
const lander = (r: BackcastRow) => r.name.replace(/ landing site\b.*$/, '');

/** One sentence for the landers: who ended at sunset, and who ended early with a stated reason. */
export function backcastSentence(rows: BackcastRow[]): string {
  const dated = rows.filter((r) => r.end_minus_sunset_h !== null);
  if (dated.length === 0) return 'No landed mission has a reported end yet.';
  const agreed = dated.filter((r) => Math.abs(r.end_minus_sunset_h!) <= SUNSET_AGREEMENT_H);
  const early = dated.filter((r) => r.end_minus_sunset_h! < -SUNSET_AGREEMENT_H);
  const parts: string[] = [];
  if (agreed.length > 0) {
    const worst = Math.max(...agreed.map((r) => Math.abs(r.end_minus_sunset_h!)));
    parts.push(`${agreed.map(lander).join(' and ')} ended within ${worst.toFixed(1)} h of the predicted sunset`);
  }
  if (early.length > 0) parts.push(`${early.map(lander).join(' and ')} ended early for known reasons (see the numbers), so their rows only show that the Sun was still up`);
  return parts.join('; ') + '.';
}

/** The three checks, in the order and words of the home page's table. */
export function checkCards({ horizons, mazarico, backcasts }: ValidationDocs): CheckCard[] {
  const dirPass = horizons.max_abs_delta_el_deg < DIRECTIONS_TARGET_DEG && horizons.max_abs_delta_az_cos_el_deg < DIRECTIONS_TARGET_DEG;

  const covered = mazarico.rows.filter((r) => r.covered && r.delta_points !== undefined);
  const gaps = covered.map((r) => Math.abs(r.delta_points!));
  const typical = gaps.length ? median(gaps) : 0;
  const within = gaps.filter((g) => g <= SUNLIGHT_POINTS).length;
  const worstTwo = [...covered].sort((a, b) => Math.abs(b.delta_points!) - Math.abs(a.delta_points!)).slice(0, 2);
  const sunPass = covered.length > 0 && typical <= SUNLIGHT_POINTS;

  const ghost = backcasts.rows.find((r) => r.skyline === 'flat' && r.end_minus_sunset_h !== null) ?? backcasts.rows.find((r) => r.end_minus_sunset_h !== null);
  const ghostGap = ghost ? Math.abs(ghost.end_minus_sunset_h!) : NaN;
  const nightPass = ghost !== undefined && ghostGap <= SUNSET_AGREEMENT_H;

  return [
    {
      id: 'directions',
      title: 'Where the Sun and Earth are in the sky',
      pass: dirPass,
      mark: dirPass ? 'Passes: under the 0.01° target' : 'Misses the 0.01° target',
      figure: degreesText(horizons.max_abs_delta_el_deg),
      figureWords: `the largest gap in ${horizons.n_rows} test cases`,
      sentence: `Our directions to the Sun and Earth against JPL Horizons, NASA's own position calculator, from six sites every 30 days in 2025 and 2026. The Sun's disc is ${thousandsText(HOME.facts.sun_disc_ratio)} times wider than the largest gap. This tests celestial directions, not terrain shadows or battery lifetime.`,
    },
    {
      id: 'sunlight',
      title: 'How much sunlight a site gets',
      pass: sunPass,
      mark: sunPass ? `Passes: the typical gap is under ${SUNLIGHT_POINTS} points` : `Misses: the typical gap is over ${SUNLIGHT_POINTS} points`,
      figure: `${typical.toFixed(1)} points`,
      figureWords: `the typical gap at ${covered.length} sites; 72 % against 70 % is a gap of 2 points`,
      sentence: `Our share of sunlight against NASA's sunlight map from the LOLA laser altimeter, averaged over 13 years, at the ${covered.length} sites it covers: ${within} of ${covered.length} sites are within ${SUNLIGHT_POINTS} points. The two largest misses are at ${worstTwo.map(placeName).join(' and ')}. Terrain resolution, mast height and averaging dates differ; these are possible causes, not a measured allocation of the error.`,
    },
    {
      id: 'nights',
      title: 'When night falls on a real mission',
      pass: nightPass,
      mark: nightPass ? `Passes: within ${SUNSET_AGREEMENT_H} hours of sunset` : `Misses: more than ${SUNSET_AGREEMENT_H} hours from sunset`,
      figure: Number.isFinite(ghostGap) ? `${ghostGap.toFixed(1)} hours` : 'no end yet',
      figureWords: "between Blue Ghost's last signal and our predicted sunset",
      sentence: `Illustrative comparison of predicted sunset and reported mission end. ${backcastSentence(backcasts.rows)} Blue Ghost uses a flat mare horizon; the early endings of IM-1 and IM-2 do not validate polar horizon accuracy.`,
    },
  ];
}
