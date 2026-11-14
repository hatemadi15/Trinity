import { fetchJson } from '../data/loaders';

/** The app's version and the commit it was built from, stamped at build time by next.config.ts. */
export interface AppVersion {
  /** package.json's version. */
  version: string | null;
  /** The commit the build was made from, with "-dirty" when the working tree had changes; null outside a build. */
  commit: string | null;
}

/** Read where Next inlines them (each name spelt out in full); a test or a development server has neither. */
export function appVersion(): AppVersion {
  return { version: process.env.NEXT_PUBLIC_APP_VERSION || null, commit: process.env.NEXT_PUBLIC_GIT_COMMIT || null };
}

/** The versions the data files give for themselves; each one null when its file does not say or cannot be read. */
export interface DataVersions {
  /** The site catalogue's version: sites.json, and sites_derived.json beside it. */
  sites: string | null;
  /** When the hourly Sun and Earth table was made, and the start of its SHA-256. */
  ephemeris: { generatedUtc: string; sha256: string } | null;
}

type Fetch = <T>(url: string) => Promise<T>;

/** Reads the catalogue's and the ephemeris table's own version lines; the browser has both files cached by then. */
export async function loadDataVersions(base: string, get: Fetch = fetchJson): Promise<DataVersions> {
  const version = (doc: { version?: unknown } | null) => (doc && (typeof doc.version === 'number' || typeof doc.version === 'string') ? String(doc.version) : null);
  const [featured, derived, header] = await Promise.all([
    get<{ version?: unknown }>(`${base}/sites.json`).catch(() => null),
    get<{ version?: unknown }>(`${base}/sites_derived.json`).catch(() => null),
    get<{ generated_utc?: unknown; table_sha256?: unknown }>(`${base}/ephemeris/moon_me_2024_2036_1h.json`).catch(() => null),
  ]);
  const a = version(featured);
  const b = version(derived);
  const sites = a === null ? null : b === null ? `sites.json version ${a}` : `sites.json version ${a}, sites_derived.json version ${b}`;
  const ephemeris =
    header && typeof header.generated_utc === 'string' && typeof header.table_sha256 === 'string' ? { generatedUtc: header.generated_utc, sha256: header.table_sha256.slice(0, 12) } : null;
  return { sites, ephemeris };
}
