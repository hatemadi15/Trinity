import { degreesText, HOME, thousandsText } from '../data/home';
import type { BackcastRow, PowerCaseInputs, ValidationDocs } from '../data/validation';
import type { Series } from '../engine/metrics';
import { powerSeries, simulateBattery, type PowerConfig } from '../engine/power';

export type EvidenceId = 'directions' | 'sunlight' | 'sums' | 'missions';

/**
 * One kind of evidence on the Accuracy page. A check has a rule and a pass mark; context has neither (`pass` is
 * null). Its parts say, in plain words, what it shows, when it passes, what it was tested on and what it leaves
 * out; for context, what it can tell, what it cannot tell and what it covers.
 */
export interface EvidenceCard {
  id: EvidenceId;
  kind: 'check' | 'context';
  title: string;
  pass: boolean | null;
  mark: string;
  figure: string;
  figureWords: string;
  sentence: string;
  parts: { label: string; text: string }[];
}

/** The directions are checked against a target of a hundredth of a degree. */
const DIRECTIONS_TARGET_DEG = 0.01;
/** The typical gap to the LOLA maps, worked out the map's way, may be at most this many percentage points. */
const SUNLIGHT_POINTS = 5;
/** Within this many hours of the predicted sunset, a reported mission end is said to come with it. */
export const SUNSET_AGREEMENT_H = 6;
/** The app's power and battery sums may differ from the worked answers by this many W or Wh (the pipeline's rule). */
export const POWER_TOLERANCE = 1e-6;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** A date in words, in UTC: "2025-01-01T00:00:00" reads "1 January 2025". */
const dateWords = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A place without its qualifiers: "Connecting Ridge (Shackleton–de Gerlache ridge)" is "Connecting Ridge". */
export const placeName = (r: { name: string }) => r.name.replace(/\s*\(.*\)$/, '').split(',')[0];

/** The lander, not its site: "IM-1 Odysseus landing site (Malapert A)" is "IM-1 Odysseus". */
const lander = (r: BackcastRow) => r.name.replace(/ landing site\b.*$/, '');

/** One sentence for the landers: who ended near sunset, and who ended early with a stated reason. */
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

/** The app's own answer to a worked case: its engine's panel output and battery walk, run here and now. */
export function appAnswer(inputs: PowerCaseInputs) {
  const n = inputs.hours;
  const series: Series = {
    i0: 0,
    hours: n,
    sunAz: Float64Array.from(inputs.sun_az),
    sunEl: Float64Array.from(inputs.sun_el),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(inputs.sun_fraction),
    earthVisible: new Uint8Array(n),
    sunAu: Float64Array.from(inputs.sun_au),
  };
  const c = inputs.config;
  const cfg: PowerConfig = { panel: c.panel, panelAzimuthDeg: c.panel_azimuth_deg, areaM2: c.area_m2, efficiency: c.efficiency, loadW: c.load_w, batteryWh: c.battery_wh, initialSocFraction: c.initial_soc_fraction };
  const powerW = powerSeries(series, cfg);
  const r = simulateBattery(powerW, cfg);
  return { powerW, energyWh: r.energyWh, brownoutHours: r.brownoutHours, firstBrownoutHour: r.firstBrownoutHour, socMin: r.socMin };
}

/** Each worked case through the app's engine: the largest gaps to the hand answer, and whether it agrees. */
export function sumsResults(power: ValidationDocs['power']) {
  return power.cases.map((k) => {
    const got = appAnswer(k.inputs);
    const gapW = Math.max(...k.expected.power_w.map((w, h) => Math.abs(got.powerW[h] - w)));
    const gapWh = Math.max(...k.expected.energy_wh.map((e, h) => Math.abs(got.energyWh[h] - e)));
    const sameHours = got.brownoutHours === k.expected.brownout_hours && got.firstBrownoutHour === k.expected.first_brownout_hour;
    return { id: k.id, words: k.words, hand: k.hand, gapW, gapWh, pipelineGapW: k.max_abs_diff_w, agrees: k.agrees && sameHours && gapW <= POWER_TOLERANCE && gapWh <= POWER_TOLERANCE };
  });
}

/** The four kinds of evidence, in the page's order: three checks, then the missions as context. */
export function evidenceCards({ horizons, mazarico, power, backcasts }: ValidationDocs): EvidenceCard[] {
  const dirPass = horizons.max_abs_delta_el_deg < DIRECTIONS_TARGET_DEG && horizons.max_abs_delta_az_cos_el_deg < DIRECTIONS_TARGET_DEG;
  const hz = horizons.evidence.coverage;

  const covered = mazarico.rows.filter((r) => r.covered && r.sun && r.earth);
  const typical = covered.length ? median(covered.map((r) => Math.abs(r.sun!.gap_points))) : NaN;
  const earthTypical = covered.length ? median(covered.map((r) => Math.abs(r.earth!.gap_points))) : NaN;
  const appTypical = covered.length ? median(covered.map((r) => Math.abs(r.sun!.app_gap_points))) : NaN;
  const appWorst = [...covered].sort((a, b) => Math.abs(b.sun!.app_gap_points) - Math.abs(a.sun!.app_gap_points))[0];
  const within = covered.filter((r) => Math.abs(r.sun!.gap_points) <= SUNLIGHT_POINTS).length;
  const sunPass = covered.length > 0 && typical <= SUNLIGHT_POINTS && earthTypical <= SUNLIGHT_POINTS;
  const mz = mazarico.evidence.coverage;

  const sums = sumsResults(power);
  const agreeing = sums.filter((s) => s.agrees).length;
  const sumsPass = sums.length > 0 && agreeing === sums.length && power.recorded_runs.every((r) => r.agrees);
  const pc = power.evidence.coverage;

  const ghost = backcasts.rows.find((r) => r.skyline === 'flat' && r.end_minus_sunset_h !== null) ?? backcasts.rows.find((r) => r.end_minus_sunset_h !== null);
  const ghostGap = ghost ? Math.abs(ghost.end_minus_sunset_h!) : NaN;
  const landings = [...backcasts.rows].sort((a, b) => a.landed_utc.localeCompare(b.landed_utc)).map((r) => `${lander(r)} on ${dateWords(r.landed_utc)}`);
  const listed = landings.length > 1 ? `${landings.slice(0, -1).join(', ')} and ${landings[landings.length - 1]}` : landings.join('');

  return [
    {
      id: 'directions',
      kind: 'check',
      title: 'Where the Sun and Earth are in the sky',
      pass: dirPass,
      mark: dirPass ? 'Passes: under the 0.01° target' : 'Misses the 0.01° target',
      figure: degreesText(horizons.max_abs_delta_el_deg),
      figureWords: `the largest gap in ${horizons.n_rows} test cases`,
      sentence: `Our directions to the Sun and Earth against JPL Horizons, NASA's own position calculator. The Sun's disc is ${thousandsText(HOME.facts.sun_disc_ratio)} times wider than the largest gap.`,
      parts: [
        { label: 'What it shows', text: 'That our table of where the Sun and Earth are, and the way we turn it into a direction seen from a spot on the Moon, agree with JPL. It does not involve hills or sunlight.' },
        { label: 'Passes when', text: 'Every test case is within 0.01°, about a fiftieth of the width of the Sun, in height and in direction.' },
        { label: 'Tested on', text: `${hz.sites.length} sites, the Sun and Earth, every 30 days from ${dateWords(hz.first_utc)} to ${dateWords(hz.last_utc)} at 00:00 UTC: ${hz.rows} test cases.` },
        {
          label: 'What it leaves out',
          text: "Both sides use JPL's own tables of the planets, so this checks how we use them, not the tables. Every test case falls on a whole hour; the steps between hours are checked against JPL's SPICE software in the pipeline's tests.",
        },
      ],
    },
    {
      id: 'sunlight',
      kind: 'check',
      title: 'How much sunlight a site gets',
      pass: sunPass,
      mark: sunPass ? `Passes: the typical gap is under ${SUNLIGHT_POINTS} points` : `Misses: the typical gap is over ${SUNLIGHT_POINTS} points`,
      figure: Number.isFinite(typical) ? `${typical.toFixed(1)} points` : 'no sites',
      figureWords: `the typical gap at ${covered.length} sites, worked out the map's way; 72 % against 70 % is a gap of 2 points`,
      sentence: `Our share of hours with sunlight against NASA's sunlight map from the LOLA laser altimeter, averaged over 18.6 years, at the ${covered.length} sites it covers, worked out the way the map was: from the ground, on 60 m terrain, any part of the Sun counting. ${within} of ${covered.length} sites are within ${SUNLIGHT_POINTS} points; for Earth in view the typical gap is ${earthTypical.toFixed(1)} points.`,
      parts: [
        { label: 'What it shows', text: "That our way of tracing the hills around a site, and the paths of the Sun and Earth over them, gives the same long-run share of sunlight and of Earth in view as NASA's LOLA team, when both follow the same rules." },
        { label: 'Passes when', text: `The typical gap is ${SUNLIGHT_POINTS} points or less, for sunlight and for Earth in view.` },
        {
          label: 'Tested on',
          text: `${mz.sites} of the ${mz.polar_sites} sites near the south pole (the map is a square around the pole that reaches 85° S on every side), every hour for 18.6 years from ${dateWords(mz.matched_span[0])}, at the map's four nearest points around each site.`,
        },
        {
          label: 'What it leaves out',
          text:
            'Ours and NASA\'s both come from the same laser measurements of the ground, so errors they share cancel: this is agreement between two models, not a measurement on the Moon, and a long average can hide a sunrise an hour out. ' +
            `The app's own numbers, from a 2 m mast on finer terrain over 2024 to 2036, sit a typical ${appTypical.toFixed(1)} points from the map` +
            (appWorst ? `, up to ${Math.abs(appWorst.sun!.app_gap_points).toFixed(1)} at ${placeName(appWorst)}` : '') +
            '. For Earth the app waits for its centre to clear the hills, where the map counts any part of it.',
        },
      ],
    },
    {
      id: 'sums',
      kind: 'check',
      title: 'The power and battery sums',
      pass: sumsPass,
      mark: sumsPass ? 'Passes: every case to 0.000001 W' : `Misses: ${sums.length - agreeing} of ${sums.length} cases disagree`,
      figure: `${agreeing} of ${sums.length}`,
      figureWords: 'worked cases agree, run in this browser just now',
      sentence: `The app's own solar power and battery sums, worked out in this browser on ${sums.length} made-up cases, against answers worked out by hand: a 4 m² panel at 30 % in full sunshine gives 0.3 × 4 m² × 1,361 W/m² = 1,633.2 W.`,
      parts: [
        { label: 'What it shows', text: 'That the app does the sums the method describes: the angle of the panel, how much of the Sun shows and how far away it is, the battery charging and running down hour by hour, and the hours without power.' },
        { label: 'Passes when', text: 'Every worked case agrees to 0.000001 W and 0.000001 Wh, with the same hours without power.' },
        {
          label: 'Tested on',
          text: `${pc.cases} worked cases (${pc.case_hours} hours, all four panel types), and ${pc.recorded_runs} recorded runs at ${pc.recorded_sites.length} sites (${pc.recorded_hours.toLocaleString('en-US')} hours) that the app's automated tests compare with the pipeline on every change.`,
        },
        {
          label: 'What it leaves out',
          text: "It checks the sums, not real hardware: no heating, dust or ageing of the panels, no battery losses or heaters, no real lander's loads. The worked answers use the same formulas, so a wrong formula would still pass.",
        },
      ],
    },
    {
      id: 'missions',
      kind: 'context',
      title: 'When night falls on a real mission',
      pass: null,
      mark: 'Context, not a check',
      figure: Number.isFinite(ghostGap) ? `${ghostGap.toFixed(1)} hours` : 'no end yet',
      figureWords: "between Blue Ghost's last reported signal and our predicted sunset",
      sentence: `Our predicted sunset after each landing beside the end of the mission its operator reported. ${backcastSentence(backcasts.rows)}`,
      parts: [
        { label: 'What it can tell', text: 'Whether our sunset comes before or after the reported end of a lander that worked into the night, as Blue Ghost did, and that the Sun was still up when IM-1 and IM-2 ended.' },
        {
          label: 'What it cannot tell',
          text: 'The hour of sunset: mission ends are what operators reported, two of them without the hour, not sunsets anyone observed. Whether a battery lasts the night: how a lander ends depends on how it stands, its power system and its team. One lander that ran to sunset is one case, not a test.',
        },
        {
          label: 'Covers',
          text: `${backcasts.rows.length} landings: ${listed}. Blue Ghost's site is far from the pole and uses a flat horizon, which puts our sunset about 2.5 hours after the one Firefly reported.`,
        },
      ],
    },
  ];
}
