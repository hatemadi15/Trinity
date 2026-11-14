'use client';
import { useId, useState, type ReactNode } from 'react';
import { FIRST_START, lastStart, periodDays, periodProblem, shiftPeriod, shiftWords, withClock, withDate } from '@/lib/period';
import { DAYS_RANGE } from '@/lib/planner-ranges';
import { WINDOW_DAYS, type WindowDays } from '@/lib/store/explore';
import { dateLong } from '@/lib/viz/format';
import { Fold } from './Fold';

/** The first date the date box offers. */
const FIRST_DAY = FIRST_START.slice(0, 10);
/** A date box also takes years of five digits and more, which do not compare as text: only four-digit years are let through. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The most days or hours one shift takes: more than the table's span either way, which a shift stops at anyway. */
const SHIFT_MAX = 9999;
const STEP =
  'flex h-[52px] w-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-[22px] leading-none text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-sun-ink';

/** A box's own text while it is being typed in; a new period from outside, or leaving the box, puts the period's back. */
type Drafts = { date?: string; time?: string; days?: string };

/**
 * The period every figure on a page is for: "From" (a date and a whole hour, UTC) and "For" (2 to 90 days), with
 * steps of an hour and a day either way and, one tap away, a shift by any number of days or hours. Every change keeps
 * what it does not change: a new date keeps the hour, a shift keeps the length. Renders the two labelled controls,
 * then `children` (the page's next field, the lander), then a row with the shift and a sentence about the last
 * change; the caller lays them out in a row that wraps.
 */
export function PeriodControls({ startUtc, days, onChange, children }: { startUtc: string; days: WindowDays; onChange: (startUtc: string, days: WindowDays) => void; children?: ReactNode }) {
  const id = useId();
  const max = lastStart(days).slice(0, 10);
  const period = `${startUtc} ${days}`;
  // A box shows what is being typed. The browser reports a year after each digit (0002, 0020 and 0202 on the way
  // to 2027), and a box that went back to the period's date on each of them could never reach the year typed.
  const [drafts, setDrafts] = useState<Drafts>({});
  // A new period from outside (a landing date, the assistant, a link) replaces whatever was being typed.
  const [shown, setShown] = useState(period);
  if (shown !== period) {
    setShown(period);
    setDrafts({});
  }
  // The sentence about the last change (minutes rounded, a stop at the table's end, a box that could not be taken),
  // kept with the period it was said for: any later change of period leaves it behind.
  const [note, setNote] = useState<{ text: string; period: string } | null>(null);
  const say = (text: string | null, forPeriod = period) => setNote(text ? { text, period: forPeriod } : null);
  const draft = (patch: Drafts) => setDrafts((d) => ({ ...d, ...patch }));

  /** Moves the period, keeping the landing inside the table: a landing past either end stops there and says so. */
  const move = (to: string, length: number, text: string | null = null) => {
    const fit = periodProblem(to, length) ? shiftPeriod(to, length, 0) : { startUtc: to, note: null };
    say(fit.note ?? text, `${fit.startUtc} ${length}`);
    if (fit.startUtc !== startUtc || length !== days) onChange(fit.startUtc, length);
  };
  const shift = (hours: number) => {
    const r = shiftPeriod(startUtc, days, hours);
    move(r.startUtc, days, r.note);
  };

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5 text-[15px] text-ink-2">
        {/* The date and hour also in words, as the rest of the page writes them: a date box shows the browser's own
            order of day and month, and a time box may show a 12-hour clock. */}
        <span className="flex gap-1.5">
          <label htmlFor={`${id}-from`}>From</label>
          <span aria-hidden="true" className="text-ink">
            {`${dateLong(startUtc, 0)} ${startUtc.slice(0, 4)}, ${startUtc.slice(11, 16)}`}
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-1">
            <button type="button" aria-label="One day earlier" onClick={() => shift(-24)} className={STEP}>
              ‹
            </button>
            <input
              id={`${id}-from`}
              type="date"
              value={drafts.date ?? startUtc.slice(0, 10)}
              min={FIRST_DAY}
              max={max}
              onChange={(e) => {
                // Only a whole date in the box's range moves the period; a partial year or an emptied box waits.
                const value = e.target.value;
                draft({ date: value });
                const to = DATE.test(value) && value >= FIRST_DAY && value <= max ? withDate(startUtc, value) : null;
                if (to) move(to, days);
              }}
              // A date the period could not take is undone once the box is left, and the sentence says why.
              onBlur={() => {
                const value = drafts.date;
                const to = value && DATE.test(value) ? withDate(startUtc, value) : null;
                if (to && to.slice(0, 10) !== startUtc.slice(0, 10)) say(periodProblem(to, days));
                draft({ date: undefined });
              }}
              className="field w-[160px]"
            />
            <button type="button" aria-label="One day later" onClick={() => shift(24)} className={STEP}>
              ›
            </button>
          </span>
          <span className="flex items-center gap-1">
            <button type="button" aria-label="One hour earlier" onClick={() => shift(-1)} className={STEP}>
              ‹
            </button>
            <input
              id={`${id}-time`}
              type="time"
              step={3600}
              aria-label="Landing time, UTC"
              aria-describedby={`${id}-time-help`}
              value={drafts.time ?? startUtc.slice(11, 16)}
              onChange={(e) => {
                // A cleared box waits; minutes round to the nearest hour, as the engine reads its hourly table, and the sentence says so.
                const value = e.target.value;
                draft({ time: value });
                const r = withClock(startUtc, value);
                if (r) move(r.startUtc, days, r.rounded ? `The Sun and Earth table is hourly, so ${value.slice(0, 5)} is read as ${r.startUtc.slice(11, 16)} UTC.` : null);
              }}
              onBlur={() => draft({ time: undefined })}
              className="field w-[124px]"
            />
            <button type="button" aria-label="One hour later" onClick={() => shift(1)} className={STEP}>
              ›
            </button>
            <label htmlFor={`${id}-time`} className="ml-1 text-base text-ink">
              UTC
            </label>
            <span id={`${id}-time-help`} hidden>
              Whole hours in UTC: the Sun and Earth table is hourly, so minutes round to the nearest hour.
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        <span className="flex gap-1.5">
          <label htmlFor={`${id}-days`}>For</label>
          <span aria-hidden="true">
            {`(${DAYS_RANGE.min}–${DAYS_RANGE.max})`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <input
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={DAYS_RANGE.min}
            max={DAYS_RANGE.max}
            step={DAYS_RANGE.step}
            list={`${id}-picks`}
            value={drafts.days ?? String(days)}
            onChange={(e) => {
              // Any whole number of days the table has room for moves the period; "1" on the way to "14" waits.
              const value = e.target.value;
              draft({ days: value });
              const n = periodDays(value);
              if (n !== null && !periodProblem(startUtc, n)) move(startUtc, n);
            }}
            // A length the period could not take is undone once the box is left, and the sentence says why.
            onBlur={() => {
              const value = drafts.days;
              if (value !== undefined && value.trim() !== '') say(periodProblem(startUtc, Number(value)));
              draft({ days: undefined });
            }}
            className="field w-[88px]"
          />
          <span className="text-base text-ink">days</span>
          {/* The usual lengths, offered as the box is opened; any other whole number of days is typed. */}
          <datalist id={`${id}-picks`}>
            {WINDOW_DAYS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </span>
      </div>
      {children}
      <div className="flex w-full min-w-0 flex-wrap items-start gap-x-6 gap-y-1">
        <ShiftBy onShift={shift} />
        {note && note.period === period && (
          <p role="status" className="min-h-10 max-w-[46em] py-2 text-[15px] text-ink-2">
            {note.text}
          </p>
        )}
      </div>
    </>
  );
}

/** One tap away: the landing moved by any whole number of days or hours, earlier or later, as a slipped landing is. */
function ShiftBy({ onShift }: { onShift: (hours: number) => void }) {
  const id = useId();
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<'days' | 'hours'>('days');
  const n = amount.trim() === '' ? Number.NaN : Number(amount);
  const hours = Number.isInteger(n) && n >= 1 && n <= SHIFT_MAX ? (unit === 'days' ? n * 24 : n) : null;
  const words = hours === null ? null : shiftWords(hours);
  return (
    <Fold label="Shift by…">
      <div className="flex flex-wrap items-center gap-3 pb-1">
        <label htmlFor={`${id}-amount`} className="sr-only">
          Shift by
        </label>
        <input id={`${id}-amount`} type="number" inputMode="numeric" min={1} max={SHIFT_MAX} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="field w-[96px]" />
        <div role="radiogroup" aria-label="Unit" className="flex h-[52px] overflow-hidden rounded-lg border border-line-strong bg-surface text-base">
          {(['days', 'hours'] as const).map((u) => (
            <label
              key={u}
              className={`flex cursor-pointer items-center whitespace-nowrap px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-sun-ink ${
                u === unit ? 'bg-ink font-semibold text-page' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              <input type="radio" name={`${id}-unit`} className="sr-only" checked={u === unit} onChange={() => setUnit(u)} />
              {u}
            </label>
          ))}
        </div>
        <button type="button" aria-label={words ? `${words} earlier` : undefined} onClick={() => hours !== null && onShift(-hours)} className="btn">
          Earlier
        </button>
        <button type="button" aria-label={words ? `${words} later` : undefined} onClick={() => hours !== null && onShift(hours)} className="btn">
          Later
        </button>
      </div>
    </Fold>
  );
}
