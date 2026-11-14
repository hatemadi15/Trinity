import { versionsResult, type VersionsInput, type VersionsResult } from './figures';

/** What the versions' worker is asked: one landing and period under every version of a site's ground. */
export type VersionsRequest = { type: 'versions'; id: number; input: VersionsInput };

/** What it answers: the result with the time taken, or why there is none. */
export type VersionsResponse = { type: 'done'; id: number; result: VersionsResult; ms: number } | { type: 'error'; id: number; message: string };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The work of the versions' worker (or the same work inline, where there are no workers): pure, from its request alone. */
export function handleVersions(req: VersionsRequest): VersionsResponse {
  const t0 = now();
  try {
    return { type: 'done', id: req.id, result: versionsResult(req.input), ms: now() - t0 };
  } catch (err) {
    return { type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) };
  }
}
