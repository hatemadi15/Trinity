import type { TerrainReason, TerrainReport } from '../engine/completeness';
import type { Answer } from './answer';
import { dateLong } from './format';

/** The pixel size of each elevation grid, as the words call it. */
const GRID_M: Record<string, string> = { L0: '20 m', L1: '80 m', L2: '240 m' };
const gridWords = (level: string) => GRID_M[level] ?? level;

/** "3.9 km", "6 km", "100 km": one decimal under 10 km. */
function km(m: number): string {
  const k = m / 1000;
  return `${k < 10 ? Math.round(k * 10) / 10 : Math.round(k)} km`;
}

/** "28 September 2026" from a UTC timestamp, or null. */
function day(iso: string | null): string | null {
  return iso ? `${dateLong(iso.slice(0, 19), 0)} ${iso.slice(0, 4)}` : null;
}

/** A share as a percentage to three decimals, for a planner: "99.993 %". */
const pct3 = (x: number) => `${(Math.round(x * 100_000) / 1000).toFixed(3)} %`;

function find<K extends TerrainReason['kind']>(report: TerrainReport, kind: K): Extract<TerrainReason, { kind: K }> | undefined {
  return report.reasons.find((r): r is Extract<TerrainReason, { kind: K }> => r.kind === kind);
}

/** The coarser grid that stood in, from where to where, and why: the finer map's end, or tiles missing from it. */
function coarserSentence(report: TerrainReport, r: Extract<TerrainReason, { kind: 'coarser' }>): string {
  const b = r.bands[0];
  const finer = b.rMaxM <= 6_000 ? 'L0' : 'L1';
  const lost = report.findings?.coverage.absentTiles.some((t) => t.startsWith(`${finer}/`)) || report.findings?.coverage.failedTiles.some((t) => t.startsWith(`${finer}/`));
  return `Part of the horizon comes from a coarser map: ${gridWords(b.grid)} pixels from ${km(b.rMinM)} to ${km(b.rMaxM)} out, where ${lost ? `tiles of the ${gridWords(finer)} map are missing` : `the ${gridWords(finer)} map ends`}.`;
}

/**
 * What limits a result's terrain, in one or two plain sentences for the verdict, a compared row and the brief; null
 * when the terrain is complete. An incomplete terrain says what is missing, where, and that its figures can only be
 * too high: a missing piece of map counts as no hill.
 */
export function terrainLimitation(report: TerrainReport | undefined): string | null {
  if (!report || report.quality === 'complete') return null;
  const open = find(report, 'open');
  if (open) return `Terrain incomplete: the elevation map is missing in ${open.azimuths} of ${open.nAz} directions, from ${km(open.nearestM)} out. Hills there are left out, so the Sun and Earth may be in view less than these figures say.`;
  if (find(report, 'unreported')) return 'Terrain unchecked: these hills came without a record of how much of the elevation map was found, so some may be left out.';
  if (find(report, 'flat')) return 'Flat horizon assumed: the elevation maps used here reach only south of 60° S, so the hills around this place are left out.';
  const coarser = find(report, 'coarser');
  if (coarser) return coarserSentence(report, coarser);
  const site = find(report, 'site-grid');
  if (site) return `The site’s own height comes from the ${gridWords(site.grid)} map: the ${gridWords(site.planned)} map has no data under it.`;
  const gaps = find(report, 'gaps');
  if (gaps) return `Some of the elevation map is missing from ${km(gaps.nearestM)} out, but no hill there could rise above the horizon found, so the figures stand.`;
  return null;
}

/**
 * The verdict's share of a terrain limit, so the answer keeps to its words (spec 20.1): a short line for what a reader
 * must see at once (an incomplete terrain, a flat horizon assumed), and the whole limit one tap away under `label`.
 */
export function verdictLimitation(report: TerrainReport | undefined): { line: string | null; label: string; detail: string } | null {
  const detail = terrainLimitation(report);
  if (!report || !detail) return null;
  if (find(report, 'open')) return { line: 'Terrain incomplete: these figures may be too high.', label: 'What is missing', detail };
  if (find(report, 'unreported')) return { line: 'Terrain unchecked: these figures may be too high.', label: 'What is missing', detail };
  if (find(report, 'flat')) return { line: 'Flat horizon assumed: the hills around this place are left out.', label: 'About the terrain', detail };
  return { line: null, label: 'About the terrain', detail };
}

/** What is missing from an incomplete terrain, in a few words for a refusal to name a best; null when nothing is. */
export function missingWords(report: TerrainReport | undefined): string | null {
  if (!report) return null;
  const open = find(report, 'open');
  if (open) return `the elevation map is missing in ${open.azimuths} of ${open.nAz} directions, from ${km(open.nearestM)} out`;
  if (find(report, 'unreported')) return 'no record of how much of the elevation map was found';
  return null;
}

/** A short tag for a row of the site list or of the comparison; null where nothing material limits the terrain. */
export function terrainTag(report: TerrainReport | undefined): string | null {
  if (!report || report.quality === 'complete') return null;
  if (report.quality === 'incomplete') return 'terrain incomplete';
  if (find(report, 'flat')) return 'flat horizon assumed';
  if (find(report, 'coarser') || find(report, 'site-grid')) return 'coarser map in places';
  return null;
}

/**
 * Every number behind the terrain, for a planner (the brief): the share of the steps with terrain, the missing share
 * by distance, the directions left open and the tiles that were absent or failed.
 */
export function terrainDetails(report: TerrainReport): string {
  const lead = terrainLimitation(report);
  if (report.source.kind === 'featured') {
    const made = report.source.method
      ? `The pipeline made the file (${report.source.method}) from the whole maps, so no piece of them could be missing.`
      : 'The file was made from the whole maps, so no piece of them could be missing.';
    return lead ? `${lead} ${made}` : `Terrain complete: ${made.charAt(0).toLowerCase()}${made.slice(1)}`;
  }
  if (report.source.kind === 'flat' || !report.findings) return lead ?? '';
  const c = report.findings.coverage;
  const reach = `${c.nAz} directions out to ${km(c.ranges[c.ranges.length - 1]?.toM ?? 220_000)}`;
  if (c.missing === 0 && report.quality === 'complete') return `Terrain complete: terrain found at every step along ${reach}.`;
  const parts: string[] = [];
  parts.push(report.quality === 'incomplete' ? 'Terrain incomplete.' : (lead ?? 'Terrain degraded.'));
  const by = c.ranges.map((r) => `${r.missing === 0 ? 'none' : pct3(r.samples > 0 ? r.missing / r.samples : 0)} ${r.fromM === 0 ? `within ${km(r.toM)}` : `from ${km(r.fromM).replace(' km', '')} to ${km(r.toM)}`}`);
  parts.push(`Terrain found at ${pct3(c.samples > 0 ? 1 - c.missing / c.samples : 0)} of the steps along ${reach}; missing: ${by.join(', ')}.`);
  if (c.openAzimuths > 0) parts.push(`${c.openAzimuths} direction${c.openAzimuths === 1 ? '' : 's'} may have hills the map lacks.`);
  if (c.absentTiles.length > 0) parts.push(`Tiles not on the server: ${c.absentTiles.join(', ')}.`);
  if (c.failedTiles.length > 0) parts.push(`Tiles that failed to load: ${c.failedTiles.join(', ')}.`);
  return parts.join(' ');
}

/** Where the hills come from and the height they are seen from, for the brief's method. */
export function provenanceWords(report: TerrainReport): string {
  const s = report.source;
  if (s.kind === 'flat') return 'a flat horizon, assumed: no polar height data there, and no mast height changes it';
  if (s.kind === 'featured') {
    const made = day(s.generatedUtc);
    return `hills measured from NASA elevation data ahead of time (${s.file}${made ? `, made ${made}` : ''}, from a ${report.mastM} m mast)`;
  }
  const cut = day(s.generatedUtc);
  return `hills worked out in your browser from NASA elevation data, from a ${report.mastM} m mast${cut ? ` (tiles cut ${cut})` : ''}`;
}

/** The line while the hills for a new mast height are worked out: "… for 3 sites…". */
export function pendingWords(mastM: number, sites: number): string {
  return `Working out the hills seen from a ${mastM} m mast${sites > 1 ? ` for ${sites} sites` : ''}…`;
}

/** What actually failed when hills could not be worked out, from the engine's or the loader's message. */
export function skylineProblem(raw: string): string {
  if (/tiles\/manifest\.json \(HTTP 404\)/.test(raw)) return 'the elevation map tiles are not on this server';
  if (/no grid covers site/.test(raw)) return 'no elevation map has data at this point: its tiles are missing or failed to load';
  if (/north of 60S/.test(raw)) return 'this tool covers the Moon south of 60° S';
  if (/worked out in the browser|only runs in the browser|need the skyline worker/.test(raw)) return 'the hills are worked out in the browser, which is not available here';
  if (/HTTP \d{3}|fetch|network|load failed/i.test(raw)) return 'a piece of the elevation map failed to load; try again in a minute';
  return raw;
}

/** The sentence for a place that cannot be worked out, with the reason that applies. */
export function pickProblem(raw: string): string {
  return `That place cannot be worked out: ${skylineProblem(raw)}.`;
}

/**
 * The verdict with its recommendation kept only where the terrain supports it: an incomplete terrain can only
 * overstate the power, so it names no better day; nor does a result whose hills for the chosen mast are still on
 * their way. The title and the reasons stay, as the figures they describe are shown.
 */
export function trustedAnswer(answer: Answer, report: TerrainReport | undefined, pending: boolean): Answer {
  if (!answer.better) return answer;
  if (pending) return { ...answer, better: null, hint: 'The better landing day waits for the hills seen from the new mast height.' };
  if (report?.quality === 'incomplete') return { ...answer, better: null, hint: 'No better landing day is named: the terrain here is incomplete, so these figures may be too high.' };
  return answer;
}

/** The overview entries a recommendation may rest on: from the chosen mast height, with a terrain that is not incomplete. */
export function trustedOverview<T extends { mastM?: number; terrain?: TerrainReport }>(overview: Record<string, T | undefined>, mastM: number): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, o] of Object.entries(overview)) if (o && o.mastM === mastM && o.terrain && o.terrain.quality !== 'incomplete') out[id] = o;
  return out;
}

/** "A", "A and B", "A, B and C". */
function list(words: string[], last = 'and'): string {
  return words.length < 3 ? words.join(` ${last} `) : `${words.slice(0, -1).join(', ')} ${last} ${words[words.length - 1]}`;
}

/** Why some measures name no best site: the sites that would win them have an incomplete terrain. */
export function withheldNote(names: string[], measures: string[]): string {
  return `The terrain at ${list(names)} is incomplete, so no site is named for ${list(measures, 'or')}: ${names.length > 1 ? 'their' : 'its'} figures may be too high.`;
}

/** The parts of the store's state the status line reads. */
export interface StatusState {
  params: { mastM: number };
  pendingSkylines: string[];
  skylineProblems: Record<string, string>;
  site: { id: string } | null;
  maskMeta: { source: 'featured' | 'computed' | 'flat'; mastM?: number } | null;
}

/**
 * What a page says while the hills behind its figures are worked out for the chosen mast, or when they could not
 * be: how many of the page's sites (`ids`) still wait, what failed, and, where the page shows the selected site
 * (`selected`), the height its figures are still from. Nothing once every figure is from the chosen mast.
 */
export function statusLines(s: StatusState, ids: string[], selected: boolean): string[] {
  const mastM = s.params.mastM;
  const lines: string[] = [];
  const shown = s.maskMeta && s.maskMeta.source !== 'flat' ? (s.maskMeta.mastM ?? 2) : mastM;
  const still = selected && s.site && ids.includes(s.site.id) && shown !== mastM ? ` The figures below are still from ${shown} m.` : '';
  const waiting = ids.filter((id) => s.pendingSkylines.includes(id));
  if (waiting.length > 0) lines.push(`${pendingWords(mastM, waiting.length)}${still}`);
  const failed = ids.filter((id) => s.skylineProblems[id] && !waiting.includes(id));
  if (failed.length > 0) {
    const reason = skylineProblem(s.skylineProblems[failed[0]]);
    const own = selected && s.site !== null && failed.length === 1 && failed[0] === s.site.id;
    const mine = s.site !== null && failed.includes(s.site.id) && !waiting.length ? still : '';
    lines.push(own ? `The hills seen from a ${mastM} m mast could not be worked out: ${reason}.${still}` : `The hills seen from a ${mastM} m mast could not be worked out for ${failed.length} site${failed.length === 1 ? '' : 's'}: ${reason}.${mine}`);
  }
  return lines;
}
