'use client';
import { useId } from 'react';
import { WINDOW_DAYS, type WindowDays } from '@/lib/store/explore';

/**
 * The period every figure on a page is for: "From" (a date, midnight UTC) and "For" (14, 30 or 90
 * days). Renders two labelled controls; the caller lays them out in a row.
 */
export function PeriodControls({ startUtc, days, onChange }: { startUtc: string; days: WindowDays; onChange: (startUtc: string, days: WindowDays) => void }) {
  const id = useId();
  return (
    <>
      <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        From
        <input
          type="date"
          value={startUtc.slice(0, 10)}
          min="2024-01-02"
          max="2036-12-30"
          onChange={(e) => e.target.value && onChange(`${e.target.value}T00:00:00`, days)}
          className="field w-[190px]"
        />
      </label>
      <div className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        <span id={`${id}-for`}>For</span>
        <div role="radiogroup" aria-labelledby={`${id}-for`} className="flex h-[52px] overflow-hidden rounded-lg border border-line-strong bg-surface text-base">
          {WINDOW_DAYS.map((d) => (
            <label
              key={d}
              className={`flex cursor-pointer items-center whitespace-nowrap px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-sun-ink ${
                d === days ? 'bg-ink font-semibold text-page' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              <input type="radio" name={`${id}-days`} className="sr-only" checked={d === days} onChange={() => onChange(startUtc, d)} />
              {d} days
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
