import { PANEL_LABELS } from '../engine/power';
import { hoursLabel, pct } from '../viz/format';
import type { ChatMessage } from './openrouter';
import type { StateSummary } from './state-summary';

/** Numbers as the check compares them: no sign, no thousands separators, no trailing zeros ("67.0" and "67" agree). */
const canon = (s: string): string => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? String(Math.abs(n)) : s;
};

/** Every number in a text, canonicalised, in order. */
export function numbersIn(text: string): string[] {
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  return Array.from(text.matchAll(re), (m) => canon(m[0]));
}

function fractionForms(f: number): string[] {
  const p = f * 100;
  return [String(f), f.toFixed(2), p.toFixed(1), p.toFixed(0)].map(canon);
}

function hourForms(h: number): string[] {
  const d = h / 24;
  return [String(h), String(Math.floor(d)), String(Math.round(d)), d.toFixed(1), String(h % 24)].map(canon);
}

function decimalForms(x: number): string[] {
  return [0, 1, 2, 3, 4, 5].map((k) => canon(x.toFixed(k)));
}

/** The set of numbers a narration may use: every figure in the state, in the forms a reader would write them. */
export function allowedNumbers(s: StateSummary): Set<string> {
  const out = new Set<string>();
  const add = (list: string[]) => list.forEach((x) => out.add(x));
  add(numbersIn(s.site.name));
  add(decimalForms(s.site.lat));
  add(decimalForms(s.site.lon));
  add([String(s.window.days)]);
  const start = s.window.startUtc.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (start) add([start[1], canon(start[2]), canon(start[3])]);
  const startDate = new Date(`${s.window.startUtc}Z`);
  if (!Number.isNaN(startDate.getTime())) {
    // "from 1 to 15 March": the window's last day is a number a reader will write.
    const end = new Date(startDate.getTime() + s.window.days * 86_400_000);
    add([String(end.getUTCFullYear()), String(end.getUTCMonth() + 1), String(end.getUTCDate())]);
  }
  add([String(s.summary.hours), canon(String(s.summary.hours / 24))]);
  for (const f of [s.summary.illumFraction, s.summary.meanSunFraction, s.summary.earthVisFraction, s.summary.jointFraction, s.power.socMin]) add(fractionForms(f));
  for (const h of [s.summary.longestDarkH, s.summary.longestEarthGapH, s.power.brownoutHours]) add(hourForms(h));
  add([canon(s.power.meanPowerW.toFixed(1)), canon(s.power.meanPowerW.toFixed(0))]);
  const p = s.params.power;
  add([String(p.loadW), String(p.batteryWh), String(p.areaM2), String(p.panelAzimuthDeg), String(s.params.minEarthElDeg), String(s.params.mastM)]);
  // Readers write "1.1 kW" and "2 kWh" as readily as "1118 W" and "2000 Wh".
  const kiloForms = (x: number) => [canon((x / 1000).toFixed(1)), canon((x / 1000).toFixed(2))];
  add(kiloForms(s.power.meanPowerW));
  add(kiloForms(p.loadW));
  add(kiloForms(p.batteryWh));
  add(fractionForms(p.efficiency));
  add(fractionForms(p.initialSocFraction));
  add([String(s.compare.length), String(s.compare.length + 1)]);
  for (const c of s.compare) {
    add(numbersIn(c.name));
    add(fractionForms(c.illumFraction));
    add(fractionForms(c.earthVisFraction));
  }
  return out;
}

/** True when every number in the reply is one the state can vouch for. */
export function checkNumbers(reply: string, s: StateSummary): boolean {
  const allowed = allowedNumbers(s);
  return numbersIn(reply).every((n) => allowed.has(n));
}

/**
 * Keeps only the sentences whose numbers the state (or the caller's `extra` list, such as the numbers
 * the user typed) can vouch for; '' when nothing survives.
 */
export function stripForeignNumbers(reply: string, s: StateSummary, extra: Iterable<string> = []): string {
  const allowed = allowedNumbers(s);
  for (const n of extra) allowed.add(canon(n));
  return reply
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => numbersIn(sentence).every((n) => allowed.has(n)))
    .join(' ')
    .trim();
}

/** The numbers in a reply that the state cannot vouch for (for the retry nudge). */
export function foreignNumbers(reply: string, s: StateSummary): string[] {
  const allowed = allowedNumbers(s);
  return Array.from(new Set(numbersIn(reply).filter((n) => !allowed.has(n))));
}

const hemi = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(3)}°${v < 0 ? neg : pos}`;

/** The deterministic paragraph: the same numbers as the tiles, in one breath. Shown by default and whenever the model's paragraph fails the check. */
export function templateBrief(s: StateSummary): string {
  const { summary, power, params } = s;
  const p = params.power;
  const verdict = power.survives
    ? `survives the window; the battery never drops below ${pct(power.socMin)}`
    : `does not survive the window: ${power.brownoutHours} h of brownout, and the battery bottoms out at ${pct(power.socMin)}`;
  return (
    `${s.site.name} (${hemi(s.site.lat, 'N', 'S')}, ${hemi(s.site.lon, 'E', 'W')}), ${s.window.days}-day window from ${s.window.startUtc.slice(0, 10)}: ` +
    `the Sun is above the skyline ${pct(summary.illumFraction)} of the time with a longest night of ${hoursLabel(summary.longestDarkH)}; ` +
    `Earth is in view ${pct(summary.earthVisFraction)} of the time with a longest gap of ${hoursLabel(summary.longestEarthGapH)}, and both at once ${pct(summary.jointFraction)}. ` +
    `With ${PANEL_LABELS[p.panel].toLowerCase()} panels, ${p.areaM2} m² at ${Math.round(p.efficiency * 100)} % efficiency, a ${p.loadW} W load and a ${p.batteryWh} Wh battery starting at ${Math.round(p.initialSocFraction * 100)} %, ` +
    `the lander ${verdict}, with a mean power of ${power.meanPowerW.toFixed(0)} W.`
  );
}

/** System and user messages for the model's version of the paragraph. */
export function narrationPrompt(s: StateSummary): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You write the one-paragraph mission summary for a lunar landing-site brief. Use only numbers that appear in the STATE JSON, copied as they are: fractions as percentages with one decimal, hours as given or as whole days and hours. Never compute, convert further, or add figures; if unsure, leave the number out. Write 80 to 140 words of plain prose for mission planners: the site and window, sunlight and the longest night, Earth visibility and the longest gap, then the power verdict. No markdown, no headings, no lists, no code fences. Answer with the paragraph only.',
    },
    { role: 'user', content: `STATE:\n${JSON.stringify(s, null, 1)}\n\nWrite the paragraph.` },
  ];
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
