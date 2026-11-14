'use client';
import { useId, useState } from 'react';
import { Fold } from '../Fold';
import { slipLabel } from '@/lib/scenario/scenario';
import type { ScenarioRun } from '@/lib/store/scenarios';
import type { Column } from '@/lib/viz/compare';
import { terrainLimitation } from '@/lib/viz/terrain';

const QUIET = 'min-h-10 text-left font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink disabled:text-ink-3 disabled:no-underline';
const UNITS = { days: 24, hours: 1 } as const;

/** "Slip the landing…": a number of days or hours, later or earlier, five days later to begin with, so the usual slip is one press. */
function SlipForm({ label, onSlip, startOpen }: { label: string; onSlip: (hours: number) => void; startOpen: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(startOpen);
  const [n, setN] = useState('5');
  const [unit, setUnit] = useState<keyof typeof UNITS>('days');
  const [way, setWay] = useState<'later' | 'earlier'>('later');
  const count = Number(n);
  const valid = Number.isInteger(count) && count >= 1 && count <= (unit === 'days' ? 365 : 999);
  const hours = (way === 'later' ? 1 : -1) * count * UNITS[unit];
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={`${id}-slip`} onClick={() => setOpen((v) => !v)} className="btn btn-sm">
        Slip the landing…
      </button>
      <form
        id={`${id}-slip`}
        hidden={!open}
        aria-label={`Slip “${label}”`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSlip(hours);
          setOpen(false);
        }}
        className="mt-2 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-[15px] text-ink-2">
          By
          <input type="number" min={1} max={unit === 'days' ? 365 : 999} step={1} value={n} onChange={(e) => setN(e.target.value)} className="field h-11 w-[84px]" />
        </label>
        <label className="flex flex-col gap-1 text-[15px] text-ink-2">
          <span className="sr-only">Days or hours</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as keyof typeof UNITS)} className="field h-11">
            <option value="days">days</option>
            <option value="hours">hours</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[15px] text-ink-2">
          <span className="sr-only">Later or earlier</span>
          <select value={way} onChange={(e) => setWay(e.target.value as 'later' | 'earlier')} className="field h-11">
            <option value="later">later</option>
            <option value="earlier">earlier</option>
          </select>
        </label>
        <button type="submit" disabled={!valid} className="btn btn-sm">
          {valid ? `Add ${slipLabel(hours)}` : 'Add'}
        </button>
      </form>
    </div>
  );
}

/**
 * One scenario above the table: its name and whether it is the baseline, where and when it lands, whether its figures
 * are ready, and what to do with it: slip it, find a nearby alternative, change it, and, folded, copy, save or remove it.
 */
export function ScenarioCard({
  col,
  index,
  alone,
  run,
  full,
  searching,
  onSlip,
  onNearby,
  onChange,
  onDuplicate,
  onBaseline,
  onRemove,
  onSave,
}: {
  col: Column;
  index: number;
  /** The only scenario: its slip starts open, as the likely next step, so five days later is one press. */
  alone: boolean;
  run: ScenarioRun | undefined;
  full: boolean;
  searching: boolean;
  onSlip: (hours: number) => void;
  onNearby: () => void;
  onChange: () => void;
  onDuplicate: () => void;
  onBaseline: () => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  const s = col.scenario;
  const baseline = index === 0;
  return (
    <div role="group" aria-label={`${baseline ? 'Baseline' : `Scenario ${index + 1}`}: ${s.label}`} className={`panel flex min-w-0 flex-col gap-2 ${baseline ? 'border-ink' : ''}`}>
      {/* Where and when it lands is in the table just under the cards; the card keeps its name and what to do with it. */}
      <p className="text-[15px] text-ink-2">{baseline ? 'Baseline' : `Scenario ${index + 1}`}</p>
      <h3 className="font-semibold leading-snug text-ink">{s.label}</h3>
      {run?.status === 'busy' && <p className="text-[15px] text-ink-2">Working out…</p>}
      {run?.status === 'error' && (
        <p role="status" className="text-[15px] text-bad">
          {run.error}
        </p>
      )}
      {/* What limits the terrain behind its figures, in the integrity part's words: nothing when it is complete. */}
      {col.terrain && terrainLimitation(col.terrain) && <p className={`text-[15px] ${col.terrain.quality === 'incomplete' ? 'text-bad' : 'text-ink-2'}`}>{terrainLimitation(col.terrain)}</p>}
      <div className="mt-1 flex flex-col items-start gap-2">
        {!full && <SlipForm label={s.label} onSlip={onSlip} startOpen={alone} />}
        <button type="button" onClick={onNearby} disabled={full || searching} className={QUIET}>
          {searching ? 'Looking nearby…' : 'Find a nearby alternative'}
        </button>
        <button type="button" onClick={onChange} aria-label={`Change “${s.label}”`} className={QUIET}>
          Change…
        </button>
        <Fold label="More">
          <div className="flex flex-col items-start gap-1">
            {!full && (
              <button type="button" onClick={onDuplicate} className={QUIET}>
                Duplicate
              </button>
            )}
            {!baseline && (
              <button type="button" onClick={onBaseline} className={QUIET}>
                Make it the baseline
              </button>
            )}
            <button type="button" onClick={onSave} className={QUIET}>
              Save as a file
            </button>
            {!baseline && (
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
