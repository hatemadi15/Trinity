'use client';
import { useId } from 'react';
import { EPHEMERIS_YEARS } from '@/lib/ai/actions';
import { WINDOW_DAYS, type WindowDays } from '@/lib/store/explore';
import { dateLong } from '@/lib/viz/format';

/** The first start the box offers. */
const FIRST_START = '2024-01-02';
/** The Sun and Earth table runs hourly to the last hour of its last year, so a period must end by the next year's first hour. */
const TABLE_END_MS = Date.UTC(EPHEMERIS_YEARS.last + 1, 0, 1);
/** A date box also takes years of five digits and more, which do not compare as text: only four-digit years are let through. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The last start whose period of `days` still ends inside the table: "2036-10-03" for 90 days. */
function lastStart(days: number): string {
  return new Date(TABLE_END_MS - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The period every figure on a page is for: "From" (a date, midnight UTC) and "For" (14, 30 or 90
 * days). Renders two labelled controls; the caller lays them out in a row.
 */
export function PeriodControls({ startUtc, days, onChange }: { startUtc: string; days: WindowDays; onChange: (startUtc: string, days: WindowDays) => void }) {
  const id = useId();
  const max = lastStart(days);
  return (
    <>
      <div className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        {/* The date also in words, as the rest of the page writes it: a date box shows the browser's own order of day and month. */}
        <span className="flex gap-1.5">
          <label htmlFor={`${id}-from`}>From</label>
          <span aria-hidden="true" className="text-ink">
            {dateLong(startUtc, 0)} {startUtc.slice(0, 4)}
          </span>
        </span>
        <input
          id={`${id}-from`}
          type="date"
          value={startUtc.slice(0, 10)}
          min={FIRST_START}
          max={max}
          onChange={(e) => {
            // The box passes every keystroke, so a year typed digit by digit arrives as 0002, 0020 and 0202 on its way
            // to 2025: only a start whose period fits the table moves the period, and an emptied box changes nothing.
            const value = e.target.value;
            if (DATE.test(value) && value >= FIRST_START && value <= max) onChange(`${value}T00:00:00`, days);
          }}
          className="field w-[170px]"
        />
      </div>
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
