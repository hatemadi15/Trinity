'use client';
import { statusLines, type StatusState } from '@/lib/viz/terrain';

/**
 * The line a page shows while the hills behind its figures are worked out for the chosen mast height, or when they
 * could not be: how many of its sites (`ids`) wait, what failed, and, with `selected`, the height the selected
 * site's figures are still from. Nothing once every figure is from the chosen mast.
 */
export function SkylineNote({ state, ids, selected = false, className = '' }: { state: StatusState; ids: string[]; selected?: boolean; className?: string }) {
  const lines = statusLines(state, ids, selected);
  if (lines.length === 0) return null;
  return (
    <div role="status" aria-label="The hills behind these figures" className={`text-[15px] text-ink-2 ${className}`}>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
