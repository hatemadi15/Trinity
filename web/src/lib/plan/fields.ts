import type { PanelModel } from '../engine/power';
import { PANEL_MODELS } from '../planner-ranges';
import type { Objective, SpecField, SpecPatch, Where } from './spec';

/**
 * The fields a model may fill in a mission's specification, checked as every action is: the right type, a known site or
 * category, a date in the Sun and Earth table. Then each number must be one the person said (in the words or a unit away:
 * days as hours, kilowatts as watts), so the model can only carry the person's numbers, never invent one.
 */

const NUMERIC: SpecField[] = ['minPoweredH', 'contactWithinH', 'maxOutageH', 'minPoweredContactH', 'loadW', 'batteryWh', 'areaM2', 'mastM', 'earthClearanceDeg', 'stayH', 'stepH', 'top'];
const NULLABLE = new Set<SpecField>(['minPoweredH', 'contactWithinH', 'maxOutageH', 'minPoweredContactH']);
const OBJECTIVES: Objective[] = ['power', 'contact', 'earliest'];
/** The catalogue's categories a specification may name. */
export const KNOWN_CATEGORIES: ReadonlySet<string> = new Set(['artemis3', 'clps_landed', 'clps_planned', 'apollo', 'international', 'classic', 'reference']);

const asNumber = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null);

/** `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM(:SS)` inside the table's years, as the full form; null otherwise. */
function utcOf(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const m = x.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?Z?$/);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2024 || y > 2036) return null;
  const t = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)));
  return Number.isNaN(t.getTime()) || t.getUTCDate() !== Number(m[3]) ? null : t.toISOString().slice(0, 19);
}

function whereOf(x: unknown, siteIds: ReadonlySet<string>, categories: ReadonlySet<string>): Where | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (o.kind === 'all') return { kind: 'all' };
  if (o.kind === 'category' && typeof o.category === 'string' && categories.has(o.category)) return { kind: 'category', category: o.category };
  if (o.kind === 'sites' && Array.isArray(o.ids)) {
    const ids = o.ids.filter((i): i is string => typeof i === 'string' && siteIds.has(i));
    return ids.length > 0 && ids.length === o.ids.length ? { kind: 'sites', ids } : null;
  }
  const km = asNumber(o.km);
  if (o.kind === 'near' && typeof o.id === 'string' && siteIds.has(o.id) && km !== null && km > 0 && km <= 2000) return { kind: 'near', id: o.id, km };
  return null;
}

/** The specification fields that fit the schema, and why the others were dropped. */
export function validateSpecPatch(raw: unknown, siteIds: ReadonlySet<string>, categories: ReadonlySet<string>): { patch: SpecPatch; dropped: string[] } {
  const patch: SpecPatch = {};
  const dropped: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { patch, dropped: ['plan_mission: spec is not an object'] };
  const o = raw as Record<string, unknown>;
  for (const f of NUMERIC) {
    if (o[f] === undefined) continue;
    if (o[f] === null && NULLABLE.has(f)) {
      (patch as Record<string, unknown>)[f] = null;
      continue;
    }
    const n = asNumber(o[f]);
    if (n === null || n < 0) dropped.push(`plan_mission: ${f} is not a number (${String(o[f])})`);
    else (patch as Record<string, unknown>)[f] = n;
  }
  if (o.panel !== undefined) {
    if (typeof o.panel === 'string' && (PANEL_MODELS as readonly string[]).includes(o.panel)) patch.panel = o.panel as PanelModel;
    else dropped.push(`plan_mission: unknown panel "${String(o.panel)}"`);
  }
  for (const f of ['fromUtc', 'toUtc'] as const) {
    if (o[f] === undefined) continue;
    const u = utcOf(o[f]);
    if (u) patch[f] = u;
    else dropped.push(`plan_mission: bad date "${String(o[f])}"`);
  }
  if (o.where !== undefined) {
    const w = whereOf(o.where, siteIds, categories);
    if (w) patch.where = w;
    else dropped.push('plan_mission: unknown sites or category in where');
  }
  if (o.objective !== undefined) {
    if (OBJECTIVES.includes(o.objective as Objective)) patch.objective = o.objective as Objective;
    else dropped.push(`plan_mission: unknown objective "${String(o.objective)}"`);
  }
  return { patch, dropped };
}

/** How a number said can reach each field: as said, or a unit away (days and weeks as hours, kilo- as the unit). */
const FACTORS: Partial<Record<SpecField, number[]>> = {
  minPoweredH: [1, 24, 168],
  contactWithinH: [1, 24, 168],
  maxOutageH: [1, 24, 168],
  minPoweredContactH: [1, 24, 168],
  stayH: [1, 24, 168],
  loadW: [1, 1000],
  batteryWh: [1, 1000],
};

/**
 * Keeps the fields whose numbers are in the words (`numbers`, from the words as the parser tidied them), and the
 * dates whose year is; a model's other numbers are dropped. "At landing" (0 hours to Earth in view) needs no number.
 */
export function groundPatch(patch: SpecPatch, numbers: number[]): { patch: SpecPatch; dropped: string[] } {
  const kept: SpecPatch = {};
  const dropped: string[] = [];
  const said = (v: number, factors: number[]) => numbers.some((n) => factors.some((k) => Math.abs(n * k - v) < 1e-6));
  for (const [key, value] of Object.entries(patch) as [SpecField, SpecPatch[SpecField]][]) {
    if (typeof value === 'number' && !(key === 'contactWithinH' && value === 0) && !said(value, FACTORS[key] ?? [1])) {
      dropped.push(`${key} ${value} is not a number you said`);
      continue;
    }
    if ((key === 'fromUtc' || key === 'toUtc') && typeof value === 'string' && !numbers.includes(Number(value.slice(0, 4)))) {
      dropped.push(`${key} ${value.slice(0, 10)}: you did not say the year`);
      continue;
    }
    if (key === 'where' && value && typeof value === 'object' && (value as Where).kind === 'near' && !said((value as { km: number }).km, [1])) {
      dropped.push(`where: ${(value as { km: number }).km} km is not a number you said`);
      continue;
    }
    (kept as Record<string, unknown>)[key] = value;
  }
  return { patch: kept, dropped };
}

/** The numbers in tidied words. */
export function numbersOf(tidied: string): number[] {
  return (tidied.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}
