import { version as packageVersion } from '../../../package.json';
import { dataBase, fetchJson } from '../data/loaders';
import { appVersion, loadDataVersions as loadSharedVersions } from '../share/versions';

/**
 * The app's and the data's versions, for scenario files and the comparison brief: what a colleague needs to know that
 * the figures they work out again come from the same model and the same data. They come from the sharing part's
 * versions (share/versions.ts), the one source the single brief and Explore's files use too; this adapter words them
 * for scenario files and the comparison brief.
 */
const stamp = appVersion();

/** The app's name, its version (package.json's outside a build) and the commit the build was made from (null outside one). */
export const APP = { name: 'Earthrise', version: stamp.version ?? packageVersion, commit: stamp.commit };

export interface DataVersions {
  /** The data manifest's version: a date and a hash over every data file. */
  data: string | null;
  /** The Sun and Earth table: the first 12 characters of its SHA-256, and when the pipeline made it. */
  ephemeris: string | null;
  /** The catalogue files' own version numbers. */
  sites: string | null;
  /** The terrain files: their manifest's version, and when the pipeline made them. */
  terrain: string | null;
}

export const UNKNOWN_VERSIONS: DataVersions = { data: null, ephemeris: null, sites: null, terrain: null };

type Fetch = <T>(path: string) => Promise<T>;

/** Reads the versions from the data's own headers, through the shared reader; any one that cannot be read is null, never guessed. */
export async function loadDataVersions(get: Fetch = (path) => fetchJson(`${dataBase()}/${path}`)): Promise<DataVersions> {
  // The shared reader asks for `${base}/file`; with no base, the path is the file's own, as `get` takes it.
  const v = await loadSharedVersions('', <T,>(url: string) => get<T>(url.replace(/^\//, '')));
  const made = (utc?: string | null) => (utc ? `, made ${utc.slice(0, 10)}` : '');
  return {
    data: v.data ? `data version ${v.data}` : null,
    ephemeris: v.ephemeris ? `DE440 table ${v.ephemeris.sha256}${made(v.ephemeris.generatedUtc)}` : null,
    sites: v.sites,
    terrain: v.terrain ? `terrain version ${v.terrain.version}${made(v.terrain.generatedUtc)}` : null,
  };
}
