import type { ReactNode } from 'react';

/**
 * What a page says when its data did not load: plain words for a visitor, and, outside production, the
 * developer's way out (the pipeline command that fills `web/public/data`) with the error itself, so a
 * public page never prints a command or a raw message.
 */
export function DataProblem({ error, what = 'data', hint }: { error: string | null; what?: 'data' | 'checks'; hint?: ReactNode }) {
  const dev = process.env.NODE_ENV !== 'production';
  return (
    <div role="alert" className="max-w-prose border-l-2 border-bad pl-4 text-ink-2">
      <p className="text-ink">{what === 'checks' ? 'The checks could not be loaded.' : 'The data could not be loaded.'}</p>
      <p className="mt-2 text-[15px]">Reload the page, or try again in a minute.</p>
      {dev && (hint || error) && (
        <p className="mt-2 text-[15px]">
          {hint}
          {error && <> ({error})</>}
        </p>
      )}
    </div>
  );
}

/** The way out on every page that reads the Explore store's files (sites, sky, hills, terrain): one command copies them all into `web/public/data`. */
export const SYNC_HINT = (
  <>
    Run <code className="text-ink">uv run python -m lunar_pipeline.cli sync-local --tiles</code> inside <code className="text-ink">pipeline/</code> and reload this page.
  </>
);
