'use client';
import Link from 'next/link';
import type { VersionsState } from '@/lib/ensemble/useTerrainVersions';
import { VERSIONS_LABEL, versionsView } from '@/lib/ensemble/words';
import { Fold } from '../Fold';

/** The waiting line while the versions load and run, said the same way wherever they are shown. */
export const VERSIONS_WAITING = 'Working out this landing over every version of the ground…';

/**
 * How the key results move across the terrain versions, one tap away beside the margins: how often the landing still
 * gives its answer, each result's range with the app's own figure, what the versions are and what they cannot show.
 * An addition only: the verdict's own figures stay those of the app's skyline.
 */
export function VersionsFold({ state, startUtc, days, className = 'mt-1' }: { state: VersionsState; startUtc: string; days: number; className?: string }) {
  if (state.status === 'none' && state.reason === null) return null;
  return (
    <Fold label={VERSIONS_LABEL} className={className}>
      <VersionsBody state={state} startUtc={startUtc} days={days} />
      <p className="mt-2">
        <Link href="/validate#versions" className="text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          How the versions were made
        </Link>
      </p>
    </Fold>
  );
}

/** The versions' words for any page: the fold's content on Explore, a printed section in the brief. */
export function VersionsBody({ state, startUtc, days }: { state: VersionsState; startUtc: string; days: number }) {
  if (state.status === 'working') {
    return (
      <p role="status" className="max-w-[42em] text-[15px] text-ink-2">
        {VERSIONS_WAITING}
      </p>
    );
  }
  if (state.status === 'none') return <p className="max-w-[42em] text-[15px] text-ink-2">{state.reason}</p>;
  if (state.status === 'error') return <p className="max-w-[42em] text-[15px] text-ink-2">The terrain versions could not be worked out ({state.message}).</p>;
  const v = versionsView(state.result.summary, { startUtc, days });
  return (
    <div className="flex max-w-[42em] flex-col gap-2">
      <p className="text-[17px] font-medium leading-relaxed text-ink">{v.held}</p>
      <ul className="text-[15px] leading-relaxed text-ink">
        {v.ranges.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="text-[15px] leading-relaxed text-ink-2">{v.about}</p>
      <p className="text-[15px] leading-relaxed text-ink-2">{v.limits}</p>
    </div>
  );
}
