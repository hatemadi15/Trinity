import type { PanelModel, PowerConfig } from '../engine/power';
import { oneSet, type Requirements } from '../plan/requirements';
import { PARAM_RANGES, POWER_RANGES, type NumberRange } from '../planner-ranges';
import { parseRequirements, requirementEntries } from '../share/settings';
import { customPoint } from '../store/query';
import { periodDays, periodProblem } from './period';
import type { Scenario, Timing } from './scenario';

/**
 * A comparison in a link: `/compare?v=1&s=…&l=…&s=…&l=…`, the baseline first. `v` is the link's version; each `s` is one
 * scenario's settings, every one of them, as short fields joined by "~" (the site, the landing to the hour in UTC, the
 * length, the lander's seven numbers, the mast, the clearance for Earth, how the landing time was chosen, and which
 * scenario it was made from); each `l` is that scenario's label. Every setting is written out, so a colleague's
 * browser works out the same figures even if the app's defaults change. The mission's requirements that are set follow,
 * in hours, named as Explore's link names them (`minpower`, `earthby`, `maxgap`, `mincontact`), so every scenario is
 * checked against the same ones; a link of this version without them still reads. An address without `v` is an old
 * /compare link, left to the page as it was.
 */

export const LINK_VERSION = 1;
/** A comparison has a baseline and up to three more scenarios. */
export const SCENARIO_MAX = 4;

const PANELS: Record<PanelModel, string> = { horizontal: 'h', vertical: 'v', vertical_tracking: 'vt', full_tracking: 'ft' };
const PANEL_OF = new Map(Object.entries(PANELS).map(([k, v]) => [v, k as PanelModel]));
const TIMING: Record<Timing, string> = { set: 's', 'site-best': 'b' };
const TIMING_OF = new Map(Object.entries(TIMING).map(([k, v]) => [v, k as Timing]));
const SITE_ID = /^[a-z0-9_]{1,64}$/;
const LABEL_MAX = 80;

/** A number as short as it reads back exactly: 0.3, 2000, 1.5. */
const num = (x: number) => String(x);

function fieldsOf(s: Scenario, index: Map<string, number>): string {
  const p = s.power;
  const start = startCode(s.startUtc);
  const from = s.from !== undefined && index.has(s.from) ? String(index.get(s.from)) : '';
  return [s.siteId, start, s.days, PANELS[p.panel], num(p.panelAzimuthDeg), num(p.areaM2), num(p.efficiency), num(p.loadW), num(p.batteryWh), num(p.initialSocFraction), num(s.mastM), num(s.minEarthElDeg), TIMING[s.timing], from].join('~');
}

/** The query of a comparison's link, without the question mark, with the requirements set in `req`; empty for no scenarios. */
export function writeComparison(list: Scenario[], req: Requirements | null = null): string {
  const kept = list.slice(0, SCENARIO_MAX);
  if (kept.length === 0) return '';
  const index = new Map(kept.map((s, i) => [s.id, i]));
  const needs = req ? requirementEntries(req).map(([k, v]) => `${k}=${encodeURIComponent(v)}`) : [];
  return [`v=${LINK_VERSION}`, ...kept.map((s) => `s=${fieldsOf(s, index)}&l=${encodeURIComponent(s.label)}`), ...needs].join('&');
}

/** The address of Compare showing this comparison, checked against the requirements set in `req`. */
export function comparisonHref(list: Scenario[], path = '/compare', req: Requirements | null = null): string {
  const q = writeComparison(list, req);
  return q ? `${path}?${q}` : path;
}

export interface ReadComparison {
  /** The scenarios read, the baseline first, with fresh ids ("s1", "s2", …). */
  scenarios: Scenario[];
  /** What could not be read, in plain words; null when all of it could. */
  problem: string | null;
  /** True when the address carries a comparison at all (an old /compare link does not). */
  found: boolean;
  /**
   * The mission's requirements the link names, as one set (those it leaves out are none); absent when it names none it
   * can read, so the visit keeps its own.
   */
  requirements?: Requirements;
}

/** A number within a range, or null. */
function inRange(raw: string, r: NumberRange): number | null {
  if (raw.trim() === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= r.min && v <= r.max ? v : null;
}

/** "2027010600" as the landing it names, "2027-01-06T00:00:00", or null. */
function startOf(raw: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:00:00`;
  const t = Date.parse(`${iso}Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 19) !== iso ? null : iso;
}

/** A scenario's settings as text, from a link's fields or a file's values: each is checked as the app's own fields check it. */
export interface RawScenario {
  site: string;
  /** The landing to the hour, "2027010600". */
  start: string;
  days: string;
  /** The panel's short code: h, v, vt or ft. */
  panel: string;
  az: string;
  area: string;
  eff: string;
  load: string;
  battery: string;
  soc: string;
  mast: string;
  minEl: string;
  /** s (set) or b (the site's own best). */
  timing: string;
  label: string | null;
}

/** A scenario from text, every setting within the app's own ranges and its period inside the Sun and Earth table; null otherwise. */
export function checkScenario(r: RawScenario, position: number): Omit<Scenario, 'from'> | null {
  if (!(r.site.startsWith('custom_') ? customPoint(r.site) !== null : SITE_ID.test(r.site))) return null;
  const startUtc = startOf(r.start);
  const length = periodDays(r.days);
  const panelModel = PANEL_OF.get(r.panel);
  const t = TIMING_OF.get(r.timing);
  const numbers = {
    panelAzimuthDeg: inRange(r.az, POWER_RANGES.panelAzimuthDeg),
    areaM2: inRange(r.area, POWER_RANGES.areaM2),
    efficiency: inRange(r.eff, POWER_RANGES.efficiency),
    loadW: inRange(r.load, POWER_RANGES.loadW),
    batteryWh: inRange(r.battery, POWER_RANGES.batteryWh),
    initialSocFraction: inRange(r.soc, POWER_RANGES.initialSocFraction),
  };
  const mastM = inRange(r.mast, PARAM_RANGES.mastM);
  const minEarthElDeg = inRange(r.minEl, PARAM_RANGES.minEarthElDeg);
  if (!startUtc || length === null || !panelModel || !t || mastM === null || minEarthElDeg === null) return null;
  if (Object.values(numbers).some((v) => v === null)) return null;
  if (periodProblem(startUtc, length) !== null) return null;
  const power = { panel: panelModel, ...numbers } as PowerConfig;
  const named = (r.label ?? '').trim().slice(0, LABEL_MAX);
  return { id: '', label: named || `Scenario ${position + 1}`, siteId: r.site, startUtc, days: length, power, mastM, minEarthElDeg, timing: t };
}

/** The short codes a link and a file write. */
export const panelCode = (p: PanelModel) => PANELS[p];
export const timingCode = (t: Timing) => TIMING[t];
export const startCode = (startUtc: string) => startUtc.slice(0, 13).replace(/[-T]/g, '');

function scenarioOf(fields: string, label: string | null, position: number): (Omit<Scenario, 'from'> & { fromIndex: number | null }) | null {
  const f = fields.split('~');
  if (f.length !== 14) return null;
  const [site, start, days, panel, az, area, eff, load, battery, soc, mast, minEl, timing, from] = f;
  const s = checkScenario({ site, start, days, panel, az, area, eff, load, battery, soc, mast, minEl, timing, label }, position);
  if (!s) return null;
  const fromIndex = /^\d+$/.test(from) && Number(from) < position ? Number(from) : null;
  return { ...s, fromIndex };
}

/** Gives each scenario read an id by its position, and joins each to the one it was made from, when that was read too. */
export function withIds(read: ((Omit<Scenario, 'from'> & { fromIndex: number | null }) | null)[]): Scenario[] {
  const idAt = new Map<number, string>();
  const scenarios: Scenario[] = [];
  read.forEach((r, i) => {
    if (!r) return;
    const id = `s${scenarios.length + 1}`;
    idAt.set(i, id);
    const { fromIndex, ...rest } = r;
    const from = fromIndex !== null ? idAt.get(fromIndex) : undefined;
    scenarios.push(from ? { ...rest, id, from } : { ...rest, id });
  });
  return scenarios;
}

/** "One scenario … could not be read", or as many as there are; null for none. */
export function unreadWords(bad: number, where: string): string | null {
  return bad === 0 ? null : bad === 1 ? `One scenario in ${where} could not be read and is left out.` : `${bad} scenarios in ${where} could not be read and are left out.`;
}

/** Reads a comparison from an address's query; see the format above. */
export function readComparison(search: string | URLSearchParams): ReadComparison {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const version = q.get('v');
  const all = q.getAll('s');
  if (version === null && all.length === 0) return { scenarios: [], problem: null, found: false };
  if (version !== String(LINK_VERSION)) {
    return { scenarios: [], problem: 'This comparison link is from a newer version of Earthrise, or is not a comparison link: it cannot be read here.', found: true };
  }
  const labels = q.getAll('l');
  const read = all.slice(0, SCENARIO_MAX).map((fields, i) => scenarioOf(fields, labels[i] ?? null, i));
  const scenarios = withIds(read);
  const problem = unreadWords(read.filter((r) => r === null).length, 'this link');
  const needs = parseRequirements(q);
  return { scenarios, problem, found: true, ...(Object.keys(needs).length > 0 ? { requirements: oneSet(needs) } : {}) };
}
