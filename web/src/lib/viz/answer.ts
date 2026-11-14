import { siteLabel, type Site } from '../data/loaders';
import type { Landing } from '../engine/landing';
import type { Series, Summary } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import type { LandingTime, NearbyPlace, Recommendation, Row, YearChoice } from '../plan/options';
import { FAIL_RULE, OBJECTIVE, searchWords, tradeOffWords, type Option } from '../plan/rank';
import { checksShort, requirementCount, type Requirements } from '../plan/requirements';
import { clockUtc, dateLong, isoAt, pct0, spanShort, spanWords } from './format';
import { nearestSites } from './relief';

export type AnswerKind = 'all' | 'night' | 'low-sun' | 'no-sun';

/** The verdict of Explore in words: what happens to the power, why, and what to do about it. */
export interface Answer {
  tone: 'good' | 'bad';
  kind: AnswerKind;
  title: string;
  /** One or two sentences that give the reason. */
  sentences: string[];
  /**
   * A landing hour inside the period that does better, when there is one: more power, or, with requirements set,
   * fewer of them failed. `checks` says in short what it meets (null with no requirement set), `why` why it ranks
   * above landing at the period start; both come with a ranked `plan`.
   */
  better: { hour: number; startUtc: string; label: string; note: string; checks?: string | null; why?: string | null } | null;
  /** What to try when the answer is bad and no landing date in the period does better. */
  hint: string | null;
  /** Hours with power from the landing (the whole period when the power never fails), and how many of them have Earth in view. */
  poweredHours: number;
  contactHours: number;
}

export interface AnswerInput {
  /** The site's name as the page shows it: the title says where and when the lander lands. */
  siteName: string;
  /** The chosen period, hour by hour, with its summary and battery walk. */
  series: Series;
  summary: Summary;
  power: PowerResult;
  startUtc: string;
  days: number;
  loadW: number;
  /** The battery's capacity: a battery below it when the Sun sets covers less of the night than a full one. */
  batteryWh: number;
  /** The best landing hour inside the period (hours from the period start), or null when no hour is sunlit. */
  best: Landing | null;
  /**
   * The period's landing times ranked with the requirements (lib/plan `timeOptions`): when given, the better date is its
   * recommendation, which honours the requirements, rather than `best`, which knows only the time with power.
   */
  plan?: Recommendation<LandingTime> | null;
}

/** The better date in the plan, worded as the answer offers it; null when the plan has none. */
function betterOf(plan: Recommendation<LandingTime>, startUtc: string, days: number, hours: number): Answer['better'] {
  const b = plan.better;
  if (!b) return null;
  const clock = clockUtc(startUtc, b.item.hour);
  const when = `${dateLong(startUtc, b.item.hour)}${clock === '00:00' ? '' : `, ${clock} UTC`}`;
  const n = b.outcome.poweredH;
  return {
    hour: b.item.hour,
    startUtc: b.item.startUtc,
    label: `Land on ${dateLong(startUtc, b.item.hour)} instead`,
    note: n >= hours ? `From ${when}, the lander keeps power for all ${days} days.` : `From ${when}: power for ${spanWords(n)} in a row.`,
    checks: checksShort(b.checks),
    why: plan.betterWhy,
  };
}

export function answerFor({ siteName, series, summary, power, startUtc, days, loadW, batteryWh, best, plan = null }: AnswerInput): Answer {
  const hours = series.hours;
  const first = power.firstBrownoutHour;
  // Every answer is for a lander that lands at the start of the period; the title says where and when.
  const landing = `Landing at ${siteName} on ${dateLong(startUtc, 0)}`;
  // Contact with Earth during the hours with power comes first: a lander that cannot send home is of little use.
  const powered = first ?? hours;
  let contact = 0;
  for (let h = 0; h < powered; h++) contact += series.earthVisible[h];
  const spanOf = (n: number) => (first === null ? `${days} days` : `${spanWords(n)} with power`);
  const contactSentence =
    powered === 0
      ? null
      : contact === 0
        ? `No radio contact: Earth is out of view for all ${spanOf(powered)}.`
        : contact >= powered
          ? `Earth is in view for all ${spanOf(powered)}.`
          : `Earth is in view for ${spanWords(contact)} of the ${spanOf(powered)}.`;
  const withContact = (sentences: string[]) => (contactSentence ? [contactSentence, ...sentences] : sentences);

  if (first === null) {
    const sentence =
      summary.illumFraction === 0
        ? `There is no sunlight in these ${days} days: the battery alone carries the lander.`
        : summary.longestDarkH === 0
          ? `The Sun never sets in these ${days} days.`
          : `The Sun is up ${pct0(summary.illumFraction)} of the time. The longest night lasts ${spanWords(summary.longestDarkH)}, and the battery covers it.`;
    // Power for the whole period leaves nothing to gain in power, but a requirement the start fails can still be met later.
    const better = plan && plan.better && plan.better.failed < plan.current.failed ? betterOf(plan, startUtc, days, hours) : null;
    return { tone: 'good', kind: 'all', title: `${landing}: power for all ${days} days`, sentences: withContact([sentence]), better, hint: null, poweredHours: powered, contactHours: contact };
  }

  if (summary.illumFraction === 0) {
    return {
      tone: 'bad',
      kind: 'no-sun',
      title: `No sunlight at ${siteName} in these ${days} days`,
      sentences: ['This spot stays in shadow for the whole period. A solar lander cannot work here.'],
      better: null,
      hint: 'Try another site, or another month.',
      poweredHours: powered,
      contactHours: contact,
    };
  }

  // The lander is back at the first hour with power after the brownout.
  let back = first;
  while (back < hours && power.powered[back] === 0) back++;
  const backPart = back < hours ? `; power comes back on ${dateLong(startUtc, back)}.` : ', and the lander stays off for the rest of the period.';
  const lead = `power for ${spanWords(first)}`;

  let kind: AnswerKind;
  let title: string;
  let sentences: string[];
  if (series.sunFraction[first] > 0) {
    kind = 'low-sun';
    title = first === 0 ? `${landing}: too little sunlight from the first hour` : `${landing}: ${lead}, then too little sunlight`;
    sentences = [`The Sun is up, but the panel makes about ${Math.round(power.powerW[first])} W and the lander uses ${loadW} W.`];
    sentences.push(back < hours ? `The lander is back on ${dateLong(startUtc, back)}.` : 'The lander stays off for the rest of the period.');
  } else {
    kind = 'night';
    title = first === 0 ? `${landing}: no power, it is night` : `${landing}: ${lead}, then night`;
    let sunset = first;
    while (sunset > 0 && series.sunFraction[sunset - 1] === 0) sunset--;
    let sunrise = first;
    while (sunrise < hours && series.sunFraction[sunrise] === 0) sunrise++;
    // Far from the pole the Sun simply goes below the horizon; near it, the hills hide a Sun that is still up.
    let below = true;
    for (let h = sunset; h < Math.min(sunrise, hours); h++) {
      if (series.sunEl[h] >= 0) {
        below = false;
        break;
      }
    }
    const where = below ? 'below the horizon' : 'behind the hills';
    const dark =
      sunset === 0
        ? `The period starts at night: the Sun is set ${where} until it rises on ${dateLong(startUtc, sunrise)}.`
        : sunrise >= hours
          ? `The Sun sets ${where} on ${dateLong(startUtc, sunset)}, and the night lasts the rest of the period.`
          : `The Sun sets ${where} on ${dateLong(startUtc, sunset)}, and the night lasts ${spanWords(sunrise - sunset)}.`;
    const covered = first - sunset;
    // A low Sun in the last sunlit hours can give less than the lander uses, so the night may start on a battery that is no longer full.
    const full = sunset === 0 || power.energyWh[sunset - 1] >= batteryWh - 1e-6;
    const battery =
      covered > 0
        ? full
          ? `The battery covers the first ${spanWords(covered)} of the night`
          : `As the Sun set, the panel already gave less than the lander uses, so the battery covers only the first ${spanWords(covered)} of the night`
        : sunset === 0
          ? 'The battery is empty at the start'
          : 'The battery is empty when the Sun sets';
    sentences = [dark, `${battery}${backPart}`];
  }

  let better: Answer['better'] = null;
  if (plan) {
    better = betterOf(plan, startUtc, days, hours);
  } else if (best && best.poweredHours > first) {
    const clock = clockUtc(startUtc, best.hour);
    const when = `${dateLong(startUtc, best.hour)}${clock === '00:00' ? '' : `, ${clock} UTC`}`;
    better = {
      hour: best.hour,
      startUtc: isoAt(startUtc, best.hour),
      label: `Land on ${dateLong(startUtc, best.hour)} instead`,
      note: best.poweredHours >= hours ? `From ${when}, the lander keeps power for all ${days} days.` : `From ${when}: power for ${spanWords(best.poweredHours)} in a row.`,
    };
  }
  const hint = better
    ? null
    : plan && plan.current.checks.length > 0
      ? `No landing time in these ${days} days does better against your requirements. Try a bigger battery (Lander, above), a shorter stay or another site.`
      : `No landing date in these ${days} days gives more power here. To get through the night, choose a bigger battery (Lander, above) or a shorter stay.`;
  return { tone: 'bad', kind, title, sentences: withContact(sentences), better, hint, poweredHours: powered, contactHours: contact };
}

/** A nearby site that does clearly better from the same landing day: what the verdict offers next to the better date. */
export interface NearbyAdvice {
  site: Site;
  km: number;
  /** Hours with power at that site when the lander arrives at the period start. */
  hours: number;
}

/** The nearby advice in one sentence: where, how far, and how long the power lasts there. */
export function nearbyWords(a: NearbyAdvice, days: number): string {
  const lasting = a.hours >= days * 24 ? `all ${days} days` : spanWords(a.hours);
  // A spot round an approximate site has its distance in its name already.
  const where = a.site.category === 'custom' ? siteLabel(a.site) : `${siteLabel(a.site)} (${Math.round(a.km)} km away)`;
  return `Nearby, ${where} keeps power for ${lasting} from the same landing day.`;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/**
 * A spot worked out round an approximate site, as a place to go: named by its distance and direction from the site
 * ("the spot 5 km north-east"), with the id a clicked point there has, so its link opens it as a click would.
 */
export function spotSite(centre: Pick<Site, 'polar'>, p: { lat: number; lon: number; km: number; bearingDeg: number }): Site {
  const label = `the spot ${p.km} km ${COMPASS[Math.round(p.bearingDeg / 45) % 8]}`;
  return { id: `custom_${p.lat.toFixed(4)}_${p.lon.toFixed(4)}`, name: label, label, lat: p.lat, lon: p.lon, category: 'custom', polar: centre.polar, source: 'user' };
}

/**
 * The nearest catalogue site within `maxKm` that keeps power at least `marginH` hours longer than
 * `poweredHours` when the lander arrives at the same hour (the period start); null when there is none,
 * or before the overview has its figures.
 */
export function nearbyAdvice(
  site: Site,
  sites: Site[],
  overview: Record<string, { nowHours: number } | undefined>,
  poweredHours: number,
  maxKm = 30,
  marginH = 24,
): NearbyAdvice | null {
  for (const { site: other, km } of nearestSites(site, sites, sites.length)) {
    if (km > maxKm) break;
    const o = overview[other.id];
    if (o && o.nowHours >= poweredHours + marginH) return { site: other, km, hours: o.nowHours };
  }
  return null;
}

/** One option as the panel lists it: when or where, its checks, its trade-offs against the current choice and why it ranks above the next. */
export interface OptionView {
  key: string;
  /** "20 January, 10:00 UTC", "de Gerlache rim summit, 12 km away". */
  title: string;
  /** The words of its button or link: "Land on 20 January at 10:00 UTC", "Explore de Gerlache rim summit". */
  action: string;
  /** The checks in short; null when no requirement is set. */
  summary: string | null;
  checks: { met: boolean; words: string }[];
  /** "Power +9 d 11 h, sunlight −1 d 3 h, …", against the current choice. */
  trade: string;
  why: string | null;
  /** Each compared site's own time with power, when the choice is for several sites. */
  perSite?: string;
  /** The landing time to move the period to (UTC), for a landing time. */
  land?: string;
  /** Where to explore it, for a place. */
  href?: string;
}

/** Everything the panel's list of options says, in words: the objective, the rule, and each list with how finely it was searched. */
export interface PlanView {
  objective: string;
  /** How a choice that fails a requirement is treated; null when none is set. */
  rule: string | null;
  current: { title: string; summary: string | null; checks: { met: boolean; words: string }[] };
  times: { search: string; options: OptionView[] };
  places: { search: string; options: OptionView[] } | null;
  year: { search: string; options: OptionView[] } | null;
}

const checkList = <T,>(o: Option<T>) => o.checks.map((c) => ({ met: c.met, words: c.words }));

function viewOf<T>(row: Row<T>, key: string, title: string, extra: Partial<OptionView> & { action: string }): OptionView {
  return { key, title, summary: checksShort(row.checks), checks: checkList(row), trade: tradeOffWords(row.trade), why: row.why, ...extra };
}

/** A landing time for a list: "20 January, 10:00 UTC", with the year when it is not the start's. */
const timeTitle = (startUtc: string, hour: number) => `${dateLong(startUtc, hour)}, ${clockUtc(startUtc, hour)} UTC`;
const landWords = (startUtc: string, hour: number) => `Land on ${dateLong(startUtc, hour)} at ${clockUtc(startUtc, hour)} UTC`;

/**
 * The options in words for the panel: the period's landing times, the places nearby and, after a 12-month search, its
 * landing times (with each compared site's own power when it searched several), each against the current choice.
 */
export function planView({
  times,
  places,
  year,
  req,
  startUtc,
  days,
  hrefFor,
}: {
  times: Recommendation<LandingTime>;
  places: Recommendation<NearbyPlace> | null;
  year: { plan: Recommendation<YearChoice>; fromUtc: string; days: number; stepH: number; siteNames: string[] } | null;
  req: Requirements;
  startUtc: string;
  days: number;
  hrefFor: (siteId: string) => string;
}): PlanView {
  return {
    objective: OBJECTIVE,
    rule: requirementCount(req) > 0 ? FAIL_RULE : null,
    current: { title: `Landing at the period start, ${timeTitle(startUtc, 0)}`, summary: checksShort(times.current.checks), checks: checkList(times.current) },
    times: {
      search: searchWords({ kind: 'period', days }),
      options: times.alternatives.map((r) => viewOf(r, `time-${r.item.hour}`, timeTitle(startUtc, r.item.hour), { action: landWords(startUtc, r.item.hour), land: r.item.startUtc })),
    },
    places: places && {
      search: searchWords({ kind: 'place', days, km: 30 }),
      options: places.alternatives.map((r) => {
        const name = siteLabel(r.item.site);
        // A spot round the site is titled by its own name, which has its distance.
        const title = r.item.site.category === 'custom' ? `${name[0].toUpperCase()}${name.slice(1)}` : `${name}, ${Math.round(r.item.km)} km away`;
        return viewOf(r, `place-${r.item.site.id}`, title, { action: `Explore ${name}`, href: hrefFor(r.item.site.id) });
      }),
    },
    year: year && {
      search: searchWords({ kind: 'year', days: year.days, stepH: year.stepH }),
      options: year.plan.alternatives.map((r) =>
        viewOf(r, `year-${r.item.hour}`, timeTitle(year.fromUtc, r.item.hour), {
          action: landWords(year.fromUtc, r.item.hour),
          land: r.item.startUtc,
          ...(r.item.perSite.length > 1 ? { perSite: `Power for ${r.item.perSite.map((o, i) => `${spanShort(o.poweredH)} at ${year.siteNames[i]}`).join(', ')}` } : {}),
        }),
      ),
    },
  };
}
