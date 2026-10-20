/** Where the data files live when nothing else is set: `web/public/data`, served by the app itself. */
export const DEFAULT_DATA_BASE = '/data';

/**
 * The data base as the loaders join it (`${base}/sites.json`): trimmed, with no trailing slash, and read as
 * `/data` when empty or unset, so a blank value in a hosting dashboard or a pasted trailing slash never
 * turns every address into `/sites.json` or `//sites.json`.
 */
export function normalizeDataBase(raw: string | undefined): string {
  const base = (raw ?? '').trim().replace(/\/+$/, '');
  return base === '' ? DEFAULT_DATA_BASE : base;
}

/** The base every loader reads; Next inlines the variable at build time, so the rule runs on the literal here. */
export function dataBase(): string {
  return normalizeDataBase(process.env.NEXT_PUBLIC_DATA_BASE);
}
