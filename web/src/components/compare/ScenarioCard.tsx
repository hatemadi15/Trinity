'use client';
import { Fold } from '../Fold';
import type { ScenarioRun } from '@/lib/store/scenarios';
import { landingShort, type Column } from '@/lib/viz/compare';
import { terrainLimitation } from '@/lib/viz/terrain';
import { landingColor, landingTitle } from './identity';

const QUIET = 'min-h-10 text-left font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink disabled:text-ink-3 disabled:no-underline';

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
  reason,
  power,
  contact,
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
  /** For the landing that works best: the figure that decided it, in a few words. */
  reason?: string;
  /** Its time with power and its radio contact while it has power, as the table words them; null until worked out. */
  power: string | null;
  contact: string | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onBaseline: () => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  const s = col.scenario;
  const own = index === 0;
  return (
    <div
      role="group"
      aria-label={`${landingTitle(index)}: ${s.label}`}
      data-best={best ? '' : undefined}
      className={`panel relative flex min-w-0 flex-col gap-1.5 !pt-4 ${best ? '!border-good outline-2 outline-good' : ''}`}
      style={{ borderTop: `6px solid ${landingColor(index)}` }}
    >
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[15px] font-semibold text-ink">
        <span className="flex items-center gap-2">
          <i aria-hidden="true" className="block size-3.5 rounded-full" style={{ background: landingColor(index) }} />
          {landingTitle(index)}
        </span>
        {best && <span className="rounded-full bg-good px-2.5 py-0.5 font-semibold text-page">Works best</span>}
      </p>
      <h3 className="text-[15px] leading-snug text-ink-2">
        <span className="block font-semibold text-ink">{s.label}</span>
        {/* The place and the date, so a card reads on its own; every other setting is in the table under "All figures". */}
        <span className="block font-normal">{col.siteName}</span>
        <span className="block font-normal tabular-nums">{landingShort(s.startUtc)}</span>
      </h3>
      {power !== null && (
        <div className="mt-1 border-t border-line pt-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <b className="display text-[32px] leading-none tabular-nums" style={{ color: landingColor(index) }}>
              {power}
            </b>
            <span className="text-[15px] text-ink-2">with power</span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <b className="text-[19px] font-semibold leading-none tabular-nums text-ink">{contact}</b>
            <span className="text-[15px] text-ink-2">radio contact</span>
          </p>
        </div>
      )}
      {best && reason && <p className="text-[15px] font-medium text-good">{reason}</p>}
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
          Edit
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
