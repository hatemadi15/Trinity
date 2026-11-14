import type { BandInfo, Coverage } from './horizon';

/**
 * How far a skyline can be trusted, from what its terrain was:
 * - complete: every 120 m step of every ray out to 220 km had a height, each from the grid planned for its distance,
 *   and no tile was absent or failed.
 * - degraded: the skyline is established everywhere, but something stood in: a coarser grid for part of a ray or for
 *   the site's own height, a tile filled from a coarser grid, steps missing only where no hill could rise above the
 *   skyline found, or a flat horizon assumed where no elevation map reaches.
 * - incomplete: on at least one ray a step has no height on any grid and a hill there could stand above the skyline
 *   found (the highest ground on the Moon, 10,786 m, placed at that step), or a computed skyline came without the
 *   march's own record. A missing step counts as no hill, so it can only lower the skyline: an incomplete result can
 *   only overstate the hours of sunlight and of Earth in view, never understate them.
 *
 * The threshold for incomplete is one open ray, not a share: a hill in the Sun's path shortens the sunlight by hours,
 * and a missing tile opens rays by the dozen at once (a 240 m tile is 123 km wide), so in practice a skyline has
 * none or many. Missing steps that no hill could rise above leave the skyline exactly as computed, so they only
 * degrade it.
 */
export type TerrainQuality = 'complete' | 'degraded' | 'incomplete';

/** Where a skyline comes from. */
export type SkylineSource =
  /** A file the pipeline made ahead of time from the whole LOLA grids on disk. */
  | { kind: 'featured'; file: string; generatedUtc: string | null; method: string | null }
  /** Worked out in the browser from the elevation tiles: the tile set's version and when it was cut. */
  | { kind: 'computed'; version: number | null; generatedUtc: string | null }
  /** A flat horizon assumed: the polar grids do not reach the site. */
  | { kind: 'flat' };

/** What the march reported, for a skyline traced through the tiles. */
export interface TerrainFindings {
  coverage: Coverage;
  fallbackBands: BandInfo[];
  /** The grid the site's own height came from, and the grid planned for it (the first band's). */
  siteGrid: string;
  plannedSiteGrid: string;
  terrain: { version: number; generatedUtc: string | null };
}

/** Why a skyline is not complete; each reason says what stood in or what is missing. */
export type TerrainReason =
  | { kind: 'flat' }
  | { kind: 'unreported' }
  | { kind: 'open'; azimuths: number; nAz: number; nearestM: number; missingShare: number }
  | { kind: 'gaps'; missingShare: number; nearestM: number }
  | { kind: 'coarser'; bands: BandInfo[] }
  | { kind: 'site-grid'; grid: string; planned: string }
  | { kind: 'tiles'; absent: string[]; failed: string[] };

/** A skyline's provenance, coverage and quality, carried with every result made from it. */
export interface TerrainReport {
  source: SkylineSource;
  /** The mast height the skyline is seen from (m); null for a flat horizon, which no height changes. */
  mastM: number | null;
  /** The march's record; null for a featured file (made from whole grids, with no tile to lose) and a flat horizon. */
  findings: TerrainFindings | null;
  quality: TerrainQuality;
  reasons: TerrainReason[];
}

/** The pipeline's grid names, as the tile levels call them. */
const LEVEL_OF: Record<string, string> = { ldem_875s_20m: 'L0', ldem_80s_80m: 'L1', ldem_60s_240m: 'L2' };

/** The worst quality among the reasons: one open ray, or no record at all, makes a skyline incomplete. */
function qualityOf(reasons: TerrainReason[]): TerrainQuality {
  if (reasons.some((r) => r.kind === 'open' || r.kind === 'unreported')) return 'incomplete';
  return reasons.length > 0 ? 'degraded' : 'complete';
}

/** The reasons a march's findings give, most serious first. */
export function findingReasons(f: TerrainFindings): TerrainReason[] {
  const c = f.coverage, reasons: TerrainReason[] = [];
  const share = c.samples > 0 ? c.missing / c.samples : 0;
  if (c.openAzimuths > 0) reasons.push({ kind: 'open', azimuths: c.openAzimuths, nAz: c.nAz, nearestM: c.nearestMissingM ?? 0, missingShare: share });
  else if (c.missing > 0) reasons.push({ kind: 'gaps', missingShare: share, nearestM: c.nearestMissingM ?? 0 });
  if (f.fallbackBands.length > 0) reasons.push({ kind: 'coarser', bands: f.fallbackBands });
  if (f.siteGrid !== f.plannedSiteGrid) reasons.push({ kind: 'site-grid', grid: f.siteGrid, planned: f.plannedSiteGrid });
  if (c.absentTiles.length > 0 || c.failedTiles.length > 0) reasons.push({ kind: 'tiles', absent: c.absentTiles, failed: c.failedTiles });
  return reasons;
}

/** A skyline worked out from the tiles at `mastM`, with what its march found. */
export function computedReport(f: TerrainFindings, mastM: number): TerrainReport {
  const reasons = findingReasons(f);
  return { source: { kind: 'computed', version: f.terrain.version, generatedUtc: f.terrain.generatedUtc }, mastM, findings: f, quality: qualityOf(reasons), reasons };
}

/** A computed skyline that came without the march's record (an old worker, a test double): never complete. */
export function unreportedReport(mastM: number): TerrainReport {
  const reasons: TerrainReason[] = [{ kind: 'unreported' }];
  return { source: { kind: 'computed', version: null, generatedUtc: null }, mastM, findings: null, quality: qualityOf(reasons), reasons };
}

/** The fields of a featured mask file the report reads. */
export interface FeaturedDoc {
  site_id: string;
  mast_m: number;
  fallback_bands: { grid: string; r_min_m: number; r_max_m: number; step_m: number }[];
  method?: string;
  generated_utc?: string;
}

/**
 * A featured file: the pipeline read the whole grids from disk, so no tile can be absent, and its fallback bands are
 * listed in the file. Worked out again from the tiles, every featured skyline has a height at every step
 * (engine/coverage.test.ts), so a file is complete unless it lists a coarser band.
 */
export function featuredReport(doc: FeaturedDoc): TerrainReport {
  const bands = doc.fallback_bands.map((b) => ({ grid: LEVEL_OF[b.grid] ?? b.grid, rMinM: b.r_min_m, rMaxM: b.r_max_m, stepM: b.step_m }));
  const reasons: TerrainReason[] = bands.length > 0 ? [{ kind: 'coarser', bands }] : [];
  return {
    source: { kind: 'featured', file: `masks/${doc.site_id}.json`, generatedUtc: doc.generated_utc ?? null, method: doc.method ?? null },
    mastM: doc.mast_m,
    findings: null,
    quality: qualityOf(reasons),
    reasons,
  };
}

/** A flat horizon, assumed where the polar grids do not reach: an assumption, never a measurement. */
export function flatReport(): TerrainReport {
  const reasons: TerrainReason[] = [{ kind: 'flat' }];
  return { source: { kind: 'flat' }, mastM: null, findings: null, quality: qualityOf(reasons), reasons };
}
