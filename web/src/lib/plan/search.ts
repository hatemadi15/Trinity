import { siteLabel, type Site } from '../data/loaders';
import type { TerrainReport } from '../engine/completeness';
import type { Ephemeris } from '../engine/ephemeris';
import { hourlySeries, withCommsThreshold } from '../engine/metrics';
import { DEFAULT_POWER, type PowerConfig } from '../engine/power';
import { utcToEt } from '../engine/time';
import { dateTimeUtc, isoAt, spanShort, spanWords } from '../viz/format';
import { compareOptions, failedWords, FAIL_RULE, objectiveWords, optionOf, outcomeScanner, scoreAbove, weighedScore, type Option, type Priorities, type RankBy, type RequirementId } from './judge';
import { objectivePhrase, type MissionSpec, type Objective } from './spec';

/**
 * The planner's search: for each candidate site, every landing time in the window at the stated step, worked out with
 * the app's own engine (the hourly Sun and Earth series over the site's skyline, the battery walk), judged against the
 * requirements and ranked: those that meet every requirement first, then by the objective. A result is only ever the
 * best among the sites and landing times tried, under the stated settings.
 */

/** A landing time: hours from the window's start, and the UTC instant. */
export interface Landing {
  hour: number;
  utc: string;
}

/** The skyline a site was searched with: precomputed, flat (outside the polar grids) or computed for the mast. */
export interface SkylineInfo {
  source: 'featured' | 'flat' | 'computed';
  mastM: number;
  failedTiles?: number;
  /** What the terrain behind the skyline holds (the integrity part's report): an incomplete one ranks last. */
  terrain?: TerrainReport;
}

export interface SiteInput {
  site: Site;
  mask: Float64Array;
  skyline: SkylineInfo;
}

/** What reaching a requirement looked like at a site: whether any landing time met it, and the best value reached. */
export interface Reach {
  met: boolean;
  best: number | null;
}

/** One site's best landing time, and how the rest of its landing times did. */
export interface SiteFinding {
  site: Site;
  skyline: SkylineInfo;
  /** Null when no landing time in the window has the Sun up, or the site could not be worked out. */
  best: Option<Landing> | null;
  /** Landing times tried, and how many had any of the Sun up (a lander lands in daylight). */
  tried: number;
  sunlit: number;
  /** Of the sunlit ones, how many meet every requirement. */
  meeting: number;
  reach: Partial<Record<RequirementId, Reach>>;
  error?: string;
}

/** The candidate count above which landing times are tried less often, so a search stays to seconds. */
export const MAX_CANDIDATES = 200_000;
const STEPS = [1, 2, 3, 4, 6, 8, 12, 24];

export function windowHours(spec: Pick<MissionSpec, 'fromUtc' | 'toUtc'>): number {
  return Math.max(0, Math.round((Date.parse(`${spec.toUtc}Z`) - Date.parse(`${spec.fromUtc}Z`)) / 3_600_000));
}

/** The step the search uses: the one asked for, or the smallest that keeps the candidates under the bound. */
export function planStep(spec: MissionSpec, siteCount: number): { stepH: number; coarsened: boolean } {
  const hours = windowHours(spec);
  const need = Math.ceil((siteCount * hours) / MAX_CANDIDATES);
  const stepH = STEPS.find((s) => s >= Math.max(spec.stepH, need)) ?? 24;
  return { stepH, coarsened: stepH > spec.stepH };
}

/** The lander's power settings, the rest as Explore's defaults. */
export function powerOf(spec: MissionSpec): PowerConfig {
  const l = spec.lander;
  return { ...DEFAULT_POWER, loadW: l.loadW, batteryWh: l.batteryWh, areaM2: l.areaM2, panel: l.panel };
}

/** The objectives' ranking for a specification: the priorities for 'weighed', the longest time with power otherwise. */
const byOf = (objective: Objective, priorities?: Priorities): RankBy => (objective === 'weighed' && priorities ? { kind: 'weighed', priorities } : { kind: 'power' });

/** Negative when `a` ranks above `b`, by the requirements and then the objective; ties go to the earlier landing. */
export function rankWith(objective: Objective, priorities?: Priorities) {
  const by = byOf(objective, priorities);
  return (a: Option<Landing>, b: Option<Landing>): number => {
    if (a.failed !== b.failed) return a.failed - b.failed;
    if (objective === 'earliest') return a.item.hour - b.item.hour || b.outcome.poweredH - a.outcome.poweredH;
    if (objective === 'contact') return b.outcome.poweredContactH - a.outcome.poweredContactH || b.outcome.poweredH - a.outcome.poweredH || a.item.hour - b.item.hour;
    return compareOptions(a, b, by) || a.item.hour - b.item.hour;
  };
}

/** What the planner's answer is ranked by, in words, for where its recommendations appear. */
export function planRankWords(spec: Pick<MissionSpec, 'objective' | 'priorities'>): string {
  if (spec.objective === 'weighed') return objectiveWords({ kind: 'weighed', priorities: spec.priorities }).replace('Ties go to the earlier time or the nearer place.', 'Ties go to the earlier landing.');
  if (spec.objective === 'contact') return 'Ranked by the most Earth contact while powered; ties go to the longer time with power, then to the earlier landing.';
  if (spec.objective === 'earliest') return 'Ranked by the earliest landing; ties go to the longer time with power.';
  return 'Ranked by the longest continuous time with power from landing; ties go to more Earth contact while powered, then to the earlier landing.';
}

/** The ranking's words with the rule for a failed requirement, when one is set. */
export function planRuleWords(spec: Pick<MissionSpec, 'objective' | 'priorities'>, requirements: number): string {
  return requirements > 0 ? `${planRankWords(spec)} ${FAIL_RULE}` : planRankWords(spec);
}

/** The value a check reached, for "the best reached": more is better for power and contact, less for the rest. */
const better = (id: RequirementId, a: number | null, b: number | null): boolean => {
  if (a === null) return false;
  if (b === null) return true;
  return id === 'power' || id === 'powered-contact' ? a > b : a < b;
};

/** Every landing time of the window at one site, judged and the best kept. */
export function searchSite(eph: Ephemeris, input: SiteInput, spec: MissionSpec, stepH: number): SiteFinding {
  const { site, mask, skyline } = input;
  const finding: SiteFinding = { site, skyline, best: null, tried: 0, sunlit: 0, meeting: 0, reach: {} };
  const hours = windowHours(spec);
  let series;
  try {
    const raw = hourlySeries(site, mask, eph, utcToEt(spec.fromUtc), hours + spec.stayH);
    series = spec.lander.earthClearanceDeg > 0 ? withCommsThreshold(raw, mask, spec.lander.earthClearanceDeg) : raw;
  } catch (err) {
    return { ...finding, error: err instanceof Error ? err.message : String(err) };
  }
  const at = outcomeScanner(series, powerOf(spec));
  const rank = rankWith(spec.objective, spec.priorities);
  for (let h = 0; h < hours; h += stepH) {
    finding.tried++;
    const o = at(h, spec.stayH);
    if (!o.sunlitAtLanding) continue;
    finding.sunlit++;
    const opt = optionOf<Landing>({ hour: h, utc: isoAt(spec.fromUtc, h) }, o, spec.req);
    if (opt.failed === 0) finding.meeting++;
    for (const c of opt.checks) {
      const r = (finding.reach[c.id] ??= { met: false, best: null });
      r.met ||= c.met;
      if (better(c.id, c.value, r.best)) r.best = c.value;
    }
    if (!finding.best || rank(opt, finding.best) < 0) finding.best = opt;
  }
  return finding;
}

/** A requirement that no landing time met at any site, with the best any reached and where. */
export interface FailEverywhere {
  id: RequirementId;
  label: string;
  /** "the most is 16 d 4 h at Connecting Ridge". */
  best: string;
}

export interface PlanAnswer {
  /** Every site searched, best first; sites without a sunlit landing time last. */
  ranked: SiteFinding[];
  /** The sites the answer shows. */
  shown: SiteFinding[];
  /** Sites with at least one landing time that meets every requirement. */
  meetingSites: number;
  requirements: number;
  failsEverywhere: FailEverywhere[];
  /** The answer in one or two sentences: how many meet, how many are shown and why; what fails everywhere. */
  headline: string;
  /** Why each shown site ranks above the next one searched; null for the last site. */
  why: (string | null)[];
}

const REACH_WORDS: Record<RequirementId, (v: number | null) => string> = {
  power: (v) => `the most is ${spanShort(v ?? 0)}`,
  'contact-at-landing': (v) => (v === null ? 'Earth is never in view during the stay' : `Earth is first in view ${spanShort(v)} after landing at the soonest`),
  outage: (v) => `the shortest is ${spanShort(v ?? 0)}`,
  'powered-contact': (v) => `the most is ${spanShort(v ?? 0)}`,
};

/** Why `a` ranks above `b`, in one plain sentence, by the requirements and then the objective. */
export function whyFirst(a: SiteFinding, b: SiteFinding | undefined, objective: Objective, priorities?: Priorities): string | null {
  if (!b) return null;
  const next = siteLabel(b.site);
  if (!a.best) return null;
  if (!b.best) return `${next} has no landing time in the window with the Sun up.`;
  const A = a.best;
  const B = b.best;
  if (A.failed < B.failed) {
    if (A.failed === 0) {
      const fails = B.checks.filter((c) => !c.met);
      return `It meets every requirement; ${next} fails ${fails.length === 1 ? 'one' : fails.length}: ${fails.map(failedWords).join('; ')}.`;
    }
    return `It fails fewer requirements than ${next}: ${A.failed} against ${B.failed}.`;
  }
  if (objective === 'weighed' && priorities) {
    const sa = weighedScore(A.outcome, priorities);
    const sb = weighedScore(B.outcome, priorities);
    if (sa.score - sb.score < 1e-9) return `It ties with ${next} on your priorities and comes first as the earlier landing.`;
    return scoreAbove(sa, sb, next);
  }
  const dh = B.item.hour - A.item.hour;
  const dp = A.outcome.poweredH - B.outcome.poweredH;
  const dc = A.outcome.poweredContactH - B.outcome.poweredContactH;
  if (objective === 'earliest' && dh > 0) return `It can land ${spanShort(dh)} earlier than ${next}.`;
  if (objective === 'contact' && dc > 0) return `It has ${spanShort(dc)} more Earth contact while powered than ${next}.`;
  if (dp > 0) return `Power lasts ${spanShort(dp)} longer than at ${next}.`;
  if (dc > 0) return `Power lasts as long as at ${next}, with ${spanShort(dc)} more Earth contact while powered.`;
  return `It ties with ${next} and comes first as the earlier landing.`;
}

/** The answer from the sites' findings: ranked, the few to show, and the words for it. */
export function answerOf(findings: SiteFinding[], spec: MissionSpec): PlanAnswer {
  const rank = rankWith(spec.objective, spec.priorities);
  const ranked = findings
    .map((f, i) => ({ f, i }))
    .sort((x, y) => {
      if (!x.f.best || !y.f.best) return (x.f.best ? 0 : 1) - (y.f.best ? 0 : 1) || x.i - y.i;
      // A skyline with terrain missing may show more Sun and Earth than there is: it ranks after every complete one.
      const gap = (f: SiteFinding) => (f.skyline.terrain?.quality === 'incomplete' ? 1 : 0);
      return gap(x.f) - gap(y.f) || rank(x.f.best, y.f.best) || x.i - y.i;
    })
    .map((x) => x.f);
  const n = findings.length;
  const requirements = [spec.req.minPoweredH, spec.req.contactWithinH, spec.req.maxOutageH, spec.req.minPoweredContactH].filter((v) => v !== null).length;
  const meeting = ranked.filter((f) => f.best && f.best.failed === 0);
  const withBest = ranked.filter((f) => f.best);
  // The requirements that no landing time met anywhere, with the best reached and where.
  const failsEverywhere: FailEverywhere[] = [];
  const ids: RequirementId[] = ['power', 'contact-at-landing', 'outage', 'powered-contact'];
  for (const id of ids) {
    const seen = findings.filter((f) => f.reach[id]);
    if (seen.length === 0 || seen.some((f) => f.reach[id]!.met)) continue;
    let top: SiteFinding | null = null;
    for (const f of seen) if (!top || better(id, f.reach[id]!.best, top.reach[id]!.best)) top = f;
    const label = withBest[0]?.best?.checks.find((c) => c.id === id)?.label ?? id;
    const value = top?.reach[id]?.best ?? null;
    failsEverywhere.push({ id, label, best: `${REACH_WORDS[id](value)}${top && (value !== null || id !== 'contact-at-landing') ? ` at ${siteLabel(top.site)}` : ''}` });
  }
  let shown: SiteFinding[];
  let headline: string;
  const of = `of the ${n} site${n === 1 ? '' : 's'}`;
  if (withBest.length === 0) {
    shown = [];
    headline = `No landing time in the window has the Sun up at any ${n === 1 ? 'site' : `of the ${n} sites`}: a lander lands in daylight.`;
  } else if (requirements === 0) {
    shown = withBest.slice(0, spec.top);
    headline = `No requirement was set, so the sites are ranked by ${objectivePhrase(spec)} alone. The best ${shown.length === 1 ? 'one' : shown.length} ${of} ${shown.length === 1 ? 'is' : 'are'} shown.`;
  } else if (meeting.length > 0) {
    shown = meeting.slice(0, spec.top);
    const m = meeting.length;
    const which = shown.length === m ? (m === 1 ? 'it is shown' : `all ${m} are shown`) : `the best ${shown.length} are shown`;
    headline = `${m === 1 ? 'One' : m} ${of} ${m === 1 ? 'meets' : 'meet'} every requirement at one landing time or more; ${which}, best first.`;
  } else {
    shown = withBest.slice(0, Math.min(2, spec.top));
    const fails = failsEverywhere.map((f) => `${f.label} fails at every site and landing time: ${f.best}.`).join(' ');
    headline = `No site meets every requirement at any landing time tried.${fails ? ` ${fails}` : ''} The closest ${shown.length === 1 ? 'is' : `${shown.length} are`} shown.`;
  }
  const why = shown.map((f) => whyFirst(f, ranked[ranked.indexOf(f) + 1], spec.objective, spec.priorities));
  return { ranked, shown, meetingSites: meeting.length, requirements, failsEverywhere, headline, why };
}

/** The scope of a search, said wherever its results are: what was tried, at what step, for what lander and stay. */
export interface SearchStats {
  sites: number;
  /** Landing times tried, over every site. */
  landingTimes: number;
  ms: number;
}

const count = (n: number) => n.toLocaleString('en-GB');

/** Luna's summary of an answer, in whole words for speech. */
export function spokenSummary(answer: PlanAnswer, spec: MissionSpec, stats: SearchStats): string {
  const searched = `I searched ${stats.sites} site${stats.sites === 1 ? '' : 's'} and ${count(stats.landingTimes)} landing times in ${(stats.ms / 1000).toFixed(1)} seconds.`;
  const first = answer.shown[0];
  if (!first?.best) return `${searched} ${answer.headline}`;
  const b = first.best;
  const when = dateTimeUtc(spec.fromUtc, b.item.hour).replace(/ (\d{4}), /, ' $1 at ');
  const verdict = answer.requirements === 0 ? '' : b.failed === 0 ? ', every requirement met' : `, failing ${b.failed === 1 ? 'one requirement' : `${b.failed} requirements`}`;
  const lead = answer.meetingSites === 0 && answer.requirements > 0 ? 'No site meets every requirement. The closest is' : 'The best is';
  const more = answer.shown.length > 1 ? ` ${answer.shown.length} sites are on the page.` : '';
  return `${searched} ${lead} ${siteLabel(first.site)}, landing on ${when}: power for ${spanWords(b.outcome.poweredH)}${verdict}.${more} Say plan this landing to open it in Explore.`;
}
