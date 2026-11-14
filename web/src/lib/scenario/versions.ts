import { version } from '../../../package.json';
import { dataBase, fetchJson } from '../data/loaders';

/**
 * The app's and the data's versions, for scenario files and the comparison brief: what a colleague needs to know that
 * the figures they work out again come from the same model and the same data. The sharing part of the app owns the
 * single brief's provenance; this small adapter is where its versions can take over.
 */
export const APP = { name: 'Earthrise', version };

export interface DataVersions {
  /** The Sun and Earth table: the first 12 characters of its SHA-256, and when the pipeline made it. */
  ephemeris: string | null;
  /** The catalogue file's own version number. */
  sites: string | null;
  /** The terrain files: their manifest's version, and when the pipeline made them. */
  terrain: string | null;
}

export const UNKNOWN_VERSIONS: DataVersions = { ephemeris: null, sites: null, terrain: null };

type Fetch = <T>(path: string) => Promise<T>;

/** Reads the versions from the data's own headers; any one that cannot be read is null, never guessed. */
export async function loadDataVersions(get: Fetch = (path) => fetchJson(`${dataBase()}/${path}`)): Promise<DataVersions> {
  const [eph, sites, terrain] = await Promise.all([
    get<{ table_sha256?: string; generated_utc?: string }>('ephemeris/moon_me_2024_2036_1h.json').catch(() => null),
    get<{ version?: number }>('sites.json').catch(() => null),
    get<{ version?: number; generated_utc?: string }>('terrain/manifest.json').catch(() => null),
  ]);
  const made = (utc?: string) => (utc ? `, made ${utc.slice(0, 10)}` : '');
  return {
    ephemeris: eph?.table_sha256 ? `DE440 table ${eph.table_sha256.slice(0, 12)}${made(eph.generated_utc)}` : null,
    sites: sites?.version !== undefined ? `catalogue version ${sites.version}` : null,
    terrain: terrain?.version !== undefined ? `terrain version ${terrain.version}${made(terrain.generated_utc)}` : null,
  };
}
