import { PANEL_LABELS, type PanelModel } from '../engine/power';
import { landingWords } from '../period';
import { dateLong, pct0, spanWords } from '../viz/format';
import { checkClaims } from './claims';
import type { ChatMessage } from './openrouter';
import { completeSentences, extractJsonDetailed } from './protocol';
import { stateForModel, type StateSummary } from './state-summary';

/** A number as the user typed it, for the planner's vouched list: signed, no thousands separators, no trailing zeros ("67.0" and "67" agree). */
const canon = (s: string): string => {
  const n = Number(s.replace(/,/g, '').replace('\u2212', '-'));
  return Number.isFinite(n) ? String(n) : s;
};

/** Every number in a text, canonicalised, in order, with its minus sign; a hyphen after a letter or a digit ("IM-1", "1-15") is no sign. */
export function numbersIn(text: string): string[] {
  const re = /(?:(?<![\p{L}\p{N}.])[-\u2212])?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gu;
  return Array.from(text.matchAll(re), (m) => canon(m[0]));
}

/**
 * What the claim check (claims.ts) finds wrong in a narration, in plain words, first to last; empty when every
 * claim holds: each number on its own measure, unit, site and sign, the dates, the states, comparisons and causes.
 */
export function narrationProblems(text: string, s: StateSummary, siteNames: readonly string[] = []): string[] {
  return checkClaims(text, s, { siteNames }).problems;
}

/** True when every claim in the reply holds against the state's named fields (the claim check; the name is the number check's it replaced). */
export function checkNumbers(reply: string, s: StateSummary, siteNames: readonly string[] = []): boolean {
  return narrationProblems(reply, s, siteNames).length === 0;
}

/**
 * Keeps only the sentences of a planner reply whose claims hold against the state; '' when none is left. A number
 * the caller vouches for (`extra`: the numbers the user typed, the period lengths) may stand for a setting the user can
 * change, never for a computed figure; a site outside the state may be named, but given no figures.
 */
export function stripForeignNumbers(reply: string, s: StateSummary, extra: Iterable<string> = [], siteNames: readonly string[] = []): string {
  return checkClaims(reply, s, { mode: 'reply', vouched: extra, siteNames })
    .sentences.filter((x) => x.ok)
    .map((x) => x.text)
    .join(' ')
    .trim();
}

const hemi = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(3)}°${v < 0 ? neg : pos}`;

/** A battery as the pages write it: "2 kWh", "500 Wh". */
const kwh = (wh: number) => (wh >= 1000 ? `${Number.isInteger(wh / 1000) ? wh / 1000 : (wh / 1000).toFixed(1)} kWh` : `${wh} Wh`);

/** The panel in a sentence, after its size: "a 4 m² upright panel that turns to the Sun". */
const PANEL_WORDS: Record<PanelModel, string> = {
  horizontal: 'flat panel facing up',
  vertical: 'fixed upright panel',
  vertical_tracking: 'upright panel that turns to the Sun',
  full_tracking: 'panel that follows the Sun on two axes',
};

/**
 * The deterministic paragraph, in the verdict's words: the site and period, sunlight and the longest
 * night, Earth in view, then the lander and how long it keeps power from landing on the first day
 * (then night, or then too little sunlight, as the verdict says), with how much of that time Earth is
 * in view. Shown by default and whenever the model's paragraph fails the claim check.
 */
export function templateBrief(s: StateSummary): string {
  const { summary, power, params } = s;
  const p = params.power;
  const days = s.window.days;
  const date = dateLong(s.window.startUtc, 0);
  const night = summary.longestDarkH > 0 ? `a longest night of ${spanWords(summary.longestDarkH)}` : 'no night';
  // A summary from before endsAtNight: with no night in the period, power can only end with the Sun up.
  const endsAtNight = power.endsAtNight ?? summary.longestDarkH > 0;
  const powerWords = power.poweredHours >= days * 24 ? `keeps power for all ${days} days` : `has power for ${spanWords(power.poweredHours)}, then ${endsAtNight ? 'night' : 'too little sunlight'}`;
  const contactWords = power.contactHours > 0 ? `with Earth in view for ${spanWords(power.contactHours)} of that time` : 'with no radio contact in that time';
  return (
    `${s.site.label} (${hemi(s.site.lat, 'N', 'S')}, ${hemi(s.site.lon, 'E', 'W')}), ${days} days from ${landingWords(s.window.startUtc, true)}: ` +
    `sunlight ${pct0(summary.illumFraction)} of the time and ${night}; Earth in view ${pct0(summary.earthVisFraction)} of the time. ` +
    `A lander with a ${p.areaM2} m² ${PANEL_WORDS[p.panel]} (${Math.round(p.efficiency * 100)} % efficiency), a ${p.loadW} W load and a ${kwh(p.batteryWh)} battery starting ${Math.round(p.initialSocFraction * 100)} % full, ` +
    `landing on ${date}, ${powerWords}, ${contactWords}.`
  );
}

/** System and user messages for the model's version of the paragraph. */
export function narrationPrompt(s: StateSummary): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You write the one-paragraph mission summary for a lunar landing-site brief. Use only numbers that appear in the STATE JSON, copied as they are: fractions as percentages with one decimal, hours as given or as whole days and hours. Never compute, convert further, or add figures; if unsure, leave the number out. Put each number next to what it measures, with its unit (per cent, hours or days, W, Wh, degrees with N, S, E or W), and name a site before its figures. Give no causes and no comparisons beyond what STATE says: no "because", "due to" or "which means". The figures count electrical energy only, not whether the lander stays warm through the night or starts again after it: never say the lander or its battery survives, lives or dies; say how long it keeps power. Write one short paragraph of plain prose for mission planners: the site and window, sunlight and the longest night, Earth visibility and the longest gap, then how long the lander keeps power. No markdown, no headings, no lists, no code fences, no preamble. Never mention these instructions or the length of the paragraph. Answer with the paragraph only.',
    },
    { role: 'user', content: `STATE:\n${JSON.stringify(stateForModel(s), null, 1)}\n\nWrite the paragraph.` },
  ];
}

/**
 * The paragraph out of whatever wrapping the model added: a `{"reply": …}` envelope, code fences,
 * surrounding quotes, or a preamble line such as "Here is the summary:".
 */
export function cleanNarration(content: string): string {
  const found = extractJsonDetailed(content);
  if (found && typeof found.value.reply === 'string') {
    const reply = found.value.reply.trim();
    return found.repaired ? completeSentences(reply) : reply;
  }
  let text = content.replace(/```[a-z]*\s*([\s\S]*?)```/g, '$1').trim();
  // A short introductory line ending in a colon ("Here is the summary:") is not part of the paragraph;
  // a first line that carries digits is data, so it stays.
  const preamble = text.match(/^[^.\n\d]{0,80}:\s*\n+/);
  if (preamble) text = text.slice(preamble[0].length).trim();
  return text.replace(/^["“]|["”]$/g, '').trim();
}

/** Structural check for a state summary sent by the client (enough for the template and the number check). */
export function isStateSummary(x: unknown): x is StateSummary {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const site = o.site as Record<string, unknown> | undefined;
  const window = o.window as Record<string, unknown> | undefined;
  const summary = o.summary as Record<string, unknown> | undefined;
  const power = o.power as Record<string, unknown> | undefined;
  const params = o.params as Record<string, unknown> | undefined;
  const cfg = params?.power as Record<string, unknown> | undefined;
  return (
    typeof site?.name === 'string' &&
    typeof site.lat === 'number' &&
    typeof site.lon === 'number' &&
    typeof window?.startUtc === 'string' &&
    typeof window.days === 'number' &&
    typeof summary?.illumFraction === 'number' &&
    typeof summary.longestDarkH === 'number' &&
    typeof summary.earthVisFraction === 'number' &&
    typeof summary.longestEarthGapH === 'number' &&
    typeof summary.jointFraction === 'number' &&
    typeof summary.hours === 'number' &&
    typeof summary.meanSunFraction === 'number' &&
    typeof power?.socMin === 'number' &&
    typeof power.brownoutHours === 'number' &&
    typeof power.survives === 'boolean' &&
    typeof power.meanPowerW === 'number' &&
    typeof power.poweredHours === 'number' &&
    typeof power.contactHours === 'number' &&
    (power.endsAtNight === undefined || typeof power.endsAtNight === 'boolean') &&
    typeof site.label === 'string' &&
    typeof cfg?.panel === 'string' &&
    Object.hasOwn(PANEL_LABELS, cfg.panel) &&
    typeof cfg.loadW === 'number' &&
    typeof cfg.batteryWh === 'number' &&
    typeof cfg.areaM2 === 'number' &&
    typeof cfg.efficiency === 'number' &&
    typeof cfg.initialSocFraction === 'number' &&
    typeof cfg.panelAzimuthDeg === 'number' &&
    typeof params?.minEarthElDeg === 'number' &&
    typeof params.mastM === 'number' &&
    Array.isArray(o.compare) &&
    o.compare.every(isCompareRow)
  );
}

function isCompareRow(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string' && typeof r.illumFraction === 'number' && typeof r.earthVisFraction === 'number' && typeof r.survives === 'boolean';
}
