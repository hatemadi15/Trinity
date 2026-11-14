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

/**
 * The way out on every page that reads the Explore store's files: `sync-local` copies the committed data into
 * `web/public/data`, which is all these pages need, and works on a fresh clone; `--tiles` adds the tiles, the terrain
 * and the globe once the pipeline has built them (it stops without the tiles), so it comes second.
 */
export const SYNC_HINT = (
  <>
    Run <code className="text-ink">uv run python -m lunar_pipeline.cli sync-local</code> inside <code className="text-ink">pipeline/</code> and reload this page. Once the tiles are built (the full data in the README),{' '}
    <code className="text-ink">sync-local --tiles</code> copies them too.
  </>
);
