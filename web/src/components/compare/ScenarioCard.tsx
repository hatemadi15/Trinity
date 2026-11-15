'use client';
import { Fold } from '../Fold';
import type { ScenarioRun } from '@/lib/store/scenarios';
import { landingShort, type Column } from '@/lib/viz/compare';
import { terrainLimitation } from '@/lib/viz/terrain';

const QUIET = 'min-h-10 text-left font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink disabled:text-ink-3 disabled:no-underline';

/** What a column is called on the page: the first is the visitor's own landing, the others are numbered. */
export const landingTitle = (index: number) => (index === 0 ? 'Your landing' : `Landing ${index + 1}`);

/**
 * One landing above the table: whether it is the visitor's own, its name, where and when it lands, whether its figures
 * are ready and whether it works best, and what to do with it: edit it and, folded, copy, save or remove it.
 */
export function ScenarioCard({
  col,
  index,
  run,
  full,
  best,
  onEdit,
  onDuplicate,
  onBaseline,
  onRemove,
  onSave,
}: {
  col: Column;
  index: number;
  run: ScenarioRun | undefined;
  full: boolean;
  /** The summary names it as the landing that works best. */
  best: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onBaseline: () => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  const s = col.scenario;
  const own = index === 0;
  return (
    <div role="group" aria-label={`${landingTitle(index)}: ${s.label}`} className={`panel flex min-w-0 flex-col gap-1.5 ${own ? 'border-ink' : ''}`}>
      <p className="flex flex-wrap items-center justify-between gap-x-3 text-[15px] text-ink-2">
        {landingTitle(index)}
        {best && <span className="rounded-full border border-good px-2.5 py-0.5 font-semibold text-good">Works best</span>}
      </p>
      <h3 className="font-semibold leading-snug text-ink">{s.label}</h3>
      {/* The place and the date, so a card reads on its own; every other setting is in the table under the cards. */}
      <p className="text-[15px] text-ink-2">
        <span className="block">{col.siteName}</span>
        <span className="block tabular-nums">{landingShort(s.startUtc)}</span>
      </p>
      {run?.status === 'busy' && <p className="text-[15px] text-ink-2">Working out…</p>}
      {run?.status === 'error' && (
        <p role="status" className="text-[15px] text-bad">
          {run.error}
        </p>
      )}
      {/* What limits the terrain behind its figures, in the integrity part's words: nothing when it is complete. */}
      {col.terrain && terrainLimitation(col.terrain) && <p className={`text-[15px] ${col.terrain.quality === 'incomplete' ? 'text-bad' : 'text-ink-2'}`}>{terrainLimitation(col.terrain)}</p>}
      <div className="mt-auto flex flex-wrap items-start gap-x-5 gap-y-1 pt-1">
        <button type="button" onClick={onEdit} aria-label={`Edit “${s.label}”: its place, date and lander`} className={QUIET}>
          Edit place, date or lander
        </button>
        <Fold label="More">
          <div className="flex flex-col items-start gap-1">
            {!full && (
              <button type="button" onClick={onDuplicate} className={QUIET}>
                Copy this landing
              </button>
            )}
            {!own && (
              <button type="button" onClick={onBaseline} className={QUIET}>
                Make this your landing
              </button>
            )}
            <button type="button" onClick={onSave} className={QUIET}>
              Save as a file
            </button>
            {!own && (
              <button type="button" onClick={onRemove} aria-label={`Remove “${s.label}”`} className={QUIET}>
                Remove
              </button>
            )}
          </div>
        </Fold>
      </div>
    </div>
  );
}
