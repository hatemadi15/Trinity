import { ENERGY_ONLY, POWER_ASSUMPTIONS } from '@/components/PowerScope';
import type { Site } from '../data/loaders';
import type { Ephemeris } from '../engine/ephemeris';
import { etToIso, utcToEt } from '../engine/time';
import type { MaskMeta, PlannerParams } from '../store/explore';
import type { AppVersion, DataVersions } from './versions';

/** South of this latitude a site's skyline starts on the 20 m grid, as the engine's bandsForSite and the pipeline's masks read it. */
const FINE_GRID_LAT = -87.55;

/** Where one site's figures come from and what they take as given, for the brief and the files that go with it. */
export interface Provenance {
  site: { id: string; name: string; lat: number; lon: number; catalogue: string; approximate: boolean };
  /** The period in UTC, as ISO times with a Z: its first hour and the hour after its last. */
  period: { startUtc: string; endUtc: string; days: number; hours: number };
  /** Every setting the figures depend on, as the store holds them. */
  settings: PlannerParams;
  terrain: {
    kind: MaskMeta['source'] | 'unknown';
    /** Which skyline, made how and from what mast, in words. */
    mask: string;
    /** The LOLA grids the skyline is traced through, the nearest first, each with the distances it covers. */
    grids: string[];
    mastM: number;
    siteHeightM: number | null;
    missingTiles: number;
    /** How far the skyline can be trusted, from the terrain report when the store carries one; null without it. */
    quality: string | null;
  };
  ephemeris: { name: string; firstUtc: string; lastUtc: string; stepH: number };
  /** What the figures take as given, with the settings they ran with. */
  assumptions: string[];
  versions: { app: string | null; commit: string | null; data: string | null; sites: string | null; ephemeris: string | null };
}

export interface ProvenanceInput {
  site: Site;
  maskMeta: MaskMeta | null;
  params: PlannerParams;
  eph: Ephemeris;
  startUtc: string;
  days: number;
}

const z = (iso: string) => `${iso.slice(0, 19)}Z`;
const num = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

/** The LOLA polar grids a skyline is traced through, as the engine bands them by latitude; none for a flat horizon. */
export function lolaGrids(site: Pick<Site, 'lat' | 'polar'>): string[] {
  if (!site.polar) return [];
  if (site.lat <= FINE_GRID_LAT) {
    return ['LOLA LDEM 20 m (ldem_875s_20m) from 40 m to 6 km', 'LOLA LDEM 80 m (ldem_80s_80m) from 6 to 100 km', 'LOLA LDEM 240 m (ldem_60s_240m) from 100 to 220 km'];
  }
  return ['LOLA LDEM 80 m (ldem_80s_80m) from 40 m to 100 km', 'LOLA LDEM 240 m (ldem_60s_240m) from 100 to 220 km'];
}

/**
 * What a terrain report adds to a skyline's provenance (the integrity part's MaskMeta.terrain, when the store carries one):
 * how far the skyline can be trusted, and when and how it was made. Read by its shape, so a store without one gives none.
 */
interface TerrainNote {
  quality?: string;
  source?: { kind?: string; generatedUtc?: string | null; method?: string | null; version?: number | null };
}

const noteOf = (meta: MaskMeta | null): TerrainNote | null => (meta as (MaskMeta & { terrain?: TerrainNote }) | null)?.terrain ?? null;

function maskWords(site: Site, meta: MaskMeta | null, mastM: number): string {
  const missing = meta && meta.failedTiles > 0 ? `; ${meta.failedTiles} tiles could not be loaded, so some hills may be missing` : '';
  const from = noteOf(meta)?.source;
  switch (meta?.source) {
    case 'featured': {
      const made = from?.generatedUtc ? `, made ${from.generatedUtc.slice(0, 10)}${from.method ? ` by ${from.method}` : ''}` : '';
      return `the precomputed skyline file masks/${site.id}.json, worked out ahead of time from a ${num(mastM)} m mast in 720 directions${made}${missing}`;
    }
    case 'computed': {
      const set = typeof from?.version === 'number' ? ` (tile set version ${from.version}${from.generatedUtc ? `, cut ${from.generatedUtc.slice(0, 10)}` : ''})` : '';
      return `worked out in the browser from the LOLA tiles${set} from a ${num(mastM)} m mast in 720 directions${missing}`;
    }
    case 'flat':
      return 'none: the site lies outside the polar elevation grids, so its horizon is taken as flat';
    default:
      return 'not loaded yet';
  }
}

/** What the model takes as given: each one a plain sentence, the settings it ran with in their place. */
function assumptions(params: PlannerParams): string[] {
  const p = params.power;
  const clear = params.minEarthElDeg > 0 ? `at least ${num(params.minEarthElDeg)}° above the skyline` : 'above the skyline';
  return [
    'The Sun and Earth are placed once an hour, on the hour (UTC); a sunrise or an Earthrise falls within the hour before the first hour that shows it.',
    'The Sun counts as up while any part of its disc clears the skyline, and the panel gets the part in view.',
    `Earth counts as in view while the centre of its disc is ${clear}: a clear line of sight to Earth, not a working radio link, which also needs antennas, power for the radio and a ground station.`,
    `The panel makes ${Math.round(p.efficiency * 100)} % of the sunlight on its ${num(p.areaM2)} m² (1361 W/m² at 1 au, scaled by the Sun's distance) times the cosine of the Sun's angle to it.`,
    `The battery starts ${Math.round(p.initialSocFraction * 100)} % full, charges with the surplus over the ${num(p.loadW)} W load and empties on the deficit, hour by hour; the lander is off while it is empty and the panel makes less than the load.`,
    // The power model's scope, in the words the lander dialog, the numbers and the brief use (PowerScope).
    ...POWER_ASSUMPTIONS,
    ENERGY_ONLY,
    `The skyline is traced through the LOLA elevation grids from a ${num(params.mastM)} m mast; hills smaller than a grid's spacing and boulders are not in it.`,
  ];
}

/** Collects where the figures come from: the site, the period in UTC, the skyline, the ephemeris, the assumptions and the versions. */
export function collectProvenance(input: ProvenanceInput, versions: { app: AppVersion; data: DataVersions }): Provenance {
  const { site, maskMeta, params, eph, startUtc, days } = input;
  const hours = days * 24;
  const startEt = utcToEt(startUtc);
  const mastM = maskMeta?.mastM ?? params.mastM;
  return {
    site: {
      id: site.id,
      name: site.label ?? site.name,
      lat: site.lat,
      lon: site.lon,
      catalogue: site.source === 'user' ? 'coordinates picked on the Earthrise map' : site.source,
      approximate: site.approximate === true,
    },
    period: { startUtc: z(etToIso(startEt)), endUtc: z(etToIso(startEt + hours * 3600)), days, hours },
    settings: params,
    terrain: {
      kind: maskMeta?.source ?? 'unknown',
      mask: maskWords(site, maskMeta, mastM),
      grids: maskMeta?.source === 'flat' ? [] : lolaGrids(site),
      mastM,
      siteHeightM: maskMeta ? maskMeta.siteHeightM : null,
      missingTiles: maskMeta?.failedTiles ?? 0,
      quality: noteOf(maskMeta)?.quality ?? null,
    },
    ephemeris: {
      name: 'JPL DE440 through NAIF SPICE, the Sun and Earth seen from the Moon',
      firstUtc: z(etToIso(eph.t0Et)),
      lastUtc: z(etToIso(eph.t0Et + (eph.n - 1) * eph.stepS)),
      stepH: eph.stepS / 3600,
    },
    assumptions: assumptions(params),
    versions: {
      app: versions.app.version,
      commit: versions.app.commit,
      data: versions.data.data,
      sites: versions.data.sites,
      ephemeris: versions.data.ephemeris ? `made ${versions.data.ephemeris.generatedUtc}, SHA-256 ${versions.data.ephemeris.sha256}` : null,
    },
  };
}

const PANEL_WORDS: Record<PlannerParams['power']['panel'], (facing: number) => string> = {
  horizontal: () => 'flat on the deck (horizontal)',
  vertical: (facing) => `upright, facing ${num(facing)}° from north (vertical)`,
  vertical_tracking: () => 'turns to the Sun (vertical_tracking)',
  full_tracking: () => 'follows the Sun in two axes (full_tracking)',
};

/** Every setting in one line, with its exact number: the panel, the load, the battery, the mast and Earth's clearance. */
export function settingsLine(params: PlannerParams): string {
  const p = params.power;
  const earth = params.minEarthElDeg > 0 ? `Earth counts from ${num(params.minEarthElDeg)}° above the skyline` : 'Earth counts whenever it is above the skyline';
  return `panel ${PANEL_WORDS[p.panel](p.panelAzimuthDeg)}, ${num(p.areaM2)} m², ${num(p.efficiency * 100)} % efficient; load ${num(p.loadW)} W; battery ${num(p.batteryWh)} Wh, ${num(p.initialSocFraction * 100)} % full at landing; mast ${num(params.mastM)} m; ${earth}`;
}

/** "88.2800° S, 64.3100° W", as the brief's header writes a place. */
const latLon = (lat: number, lon: number) => `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;

/** "2027-01-01 00:00" from "2027-01-01T00:00:00Z". */
const minute = (isoZ: string) => isoZ.slice(0, 16).replace('T', ' ');

/** The provenance as named lines, for the brief's list and the head of the settings file. */
export function provenanceLines(p: Provenance): [string, string][] {
  const t = p.terrain;
  const height = t.siteHeightM === null ? '' : `site ${Math.abs(Math.round(t.siteHeightM))} m ${t.siteHeightM < 0 ? 'below' : 'above'} the Moon's mean radius`;
  const skyline = [t.mask, t.grids.join(', '), height, t.quality && `its terrain record: ${t.quality}`].filter(Boolean).join('; ');
  const v = p.versions;
  const versions = [`Earthrise ${v.app ?? '(a development build)'}${v.commit ? `, commit ${v.commit}` : ''}`, v.data && `data version ${v.data}`, v.sites && `site catalogue ${v.sites}`, v.ephemeris && `Sun and Earth table ${v.ephemeris}`].filter(Boolean).join('; ');
  return [
    ['Period (UTC)', `${minute(p.period.startUtc)} to ${minute(p.period.endUtc)} UTC, ${p.period.days} days, one value per hour`],
    ['Settings', settingsLine(p.settings)],
    ['Site', `${p.site.name} (${p.site.id}) at ${latLon(p.site.lat, p.site.lon)}: ${p.site.catalogue}${p.site.approximate && !/digitised/.test(p.site.catalogue) ? '; the centre of a region drawn on NASA’s map, to about 5 km' : ''}`],
    ['Skyline', skyline],
    ['Sun and Earth', `${p.ephemeris.name}, hourly from ${minute(p.ephemeris.firstUtc)} to ${minute(p.ephemeris.lastUtc)} UTC`],
    ['Versions', versions],
  ];
}
