/**
 * The parts of the data a page can find missing, as data/manifest.json groups them (the pipeline's check-data says
 * which a folder holds): the height tiles and the terrain are optional, and a copy of Earthrise made from the
 * committed data alone has neither of them. A page that misses one says so in these words and names what it does
 * instead, rather than showing a raw error or degrading without a word.
 */

export type DataPart = 'tiles' | 'terrain' | 'sky';

const FILES: Record<DataPart, string> = { tiles: 'height tiles', terrain: 'terrain files', sky: 'sky files' };

/**
 * The part a failed load belongs to, when it failed because the file is not there (a DataError's "could not load
 * <base>/<part>/... (HTTP 404)"); null for any other failure, which stays an error.
 */
export function missingPart(error: unknown): DataPart | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const m = /could not load \S*?\/(tiles|terrain|sky)\/\S+ \(HTTP 404\)/.exec(message);
  return m ? (m[1] as DataPart) : null;
}

/** What the part's files are called on a page: "terrain files", "height tiles". */
export function partFiles(part: DataPart): string {
  return FILES[part];
}

/** "this copy of Earthrise has no terrain files": true of a laptop set up with the committed data and of a website alike. */
export function hasNo(part: DataPart): string {
  return `this copy of Earthrise has no ${partFiles(part)}`;
}
