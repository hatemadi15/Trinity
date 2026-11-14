'use client';
import { useId, useState } from 'react';
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
function lastStart(days: number, hour = 0): string {
  return new Date(TABLE_END_MS - days * 86_400_000 - hour * 3_600_000).toISOString().slice(0, 10);
}

/**
 * The period every figure on a page is for: an arrival date and hour in UTC, and 14, 30 or 90
 * days). Renders two labelled controls; the caller lays them out in a row.
 */
export function PeriodControls({ startUtc, days, onChange }: { startUtc: string; days: WindowDays; onChange: (startUtc: string, days: WindowDays) => void }) {
  const id = useId();
  const max = lastStart(days, Number(startUtc.slice(11, 13) || 0));
  // The box shows what is being typed. The browser reports a year after each digit (0002, 0020 and 0202 on the way
  // to 2027), and a box that went back to the period's date on each of them could never reach the year typed.
  const [draft, setDraft] = useState<string | null>(null);
  // A new date from outside (a landing date, the assistant, a link) replaces whatever was being typed.
  const [draftStart, setDraftStart] = useState(startUtc);
  if (draftStart !== startUtc) {
    setDraftStart(startUtc);
    setDraft(null);
  }
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
          value={draft ?? startUtc.slice(0, 10)}
          min={FIRST_START}
          max={max}
          onChange={(e) => {
            // Only a whole date whose period fits the table moves the period; a partial year or an emptied box waits.
            const value = e.target.value;
            setDraft(value);
            if (DATE.test(value) && value >= FIRST_START && value <= max) onChange(`${value}T${startUtc.slice(11, 13) || '00'}:00:00`, days);
          }}
          // A date the period could not take is undone once the box is left, so the box shows the period's date again.
          onBlur={() => setDraft(null)}
          className="field w-[170px]"
        />
      </div>
      <div className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        <label htmlFor={`${id}-hour`}>Arrival hour (UTC)</label>
        <select id={`${id}-hour`} className="field w-32" value={startUtc.slice(11, 13) || '00'} onChange={(e) => onChange(`${startUtc.slice(0, 10)}T${e.target.value}:00:00`, days)}>
          {Array.from({ length: 24 }, (_, hour) => {
            const value = String(hour).padStart(2, '0');
            return <option key={value} value={value}>{value}:00</option>;
          })}
        </select>
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
