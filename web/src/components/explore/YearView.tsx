'use client';
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Fold } from '@/components/Fold';
import { lolaFor, Sources } from '@/components/Sources';
import type { Site } from '@/lib/data/loaders';
import type { Ephemeris } from '@/lib/engine/ephemeris';
import { useLunaControls } from '@/lib/luna/controls';
import { nextTask, runSliced, yearDayCount, yearSteps, type YearOfLandings } from '@/lib/engine/year';
import type { PlannerParams } from '@/lib/store/explore';
import { isoAt } from '@/lib/viz/format';
import { dayFiguresWords, dayLabel, GRADES, gradeOf, headline, legendWords, moveDay, tableEndNote, YEAR_SCORING, yearMonths, type DayScoring, type Grade } from '@/lib/viz/year';

/**
 * The four grades as four steps of one colour scale, dark to light, drawn on the black of a picture panel in both
 * themes: steps of viridis, made to be told apart with any colour vision and in grey, so lighter is always better.
 */
export const GRADE_COLOUR: Record<Grade, string> = { best: '#fde725', good: '#5ec962', mixed: '#21918c', poor: '#3b528b' };

const DAY_MS = 86_400_000;
const utcMs = (iso: string) => Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);

/** Whole days from `from` to `to` when `to` lands at the same time of day on or after it; null otherwise. */
function daysAfter(from: string, to: string): number | null {
  const d = (utcMs(to) - utcMs(from)) / DAY_MS;
  return Number.isInteger(d) && d >= 0 ? d : null;
}

/** What one year is worked out for. Its object stands for the year: a new one is a new year to work out. */
interface Anchor {
  key: string;
  site: { lat: number; lon: number };
  mask: ArrayLike<number>;
  startUtc: string;
  days: number;
  params: PlannerParams;
}

interface Worked {
  anchor: Anchor;
  year: YearOfLandings;
  /** Time spent working, the longest slice and the time from the start to the end with the pauses, in ms. */
  busyMs: number;
  sliceMs: number;
  wallMs: number;
}

interface YearProps {
  eph: Ephemeris | null;
  site: Site;
  mask: ArrayLike<number>;
  /** The period's landing: the year starts there, and keeps its time of day. */
  startUtc: string;
  days: number;
  params: PlannerParams;
  /** Lands the period on a day of the year, as the date box does. */
  onLand: (startUtc: string) => void;
  /** How the days are graded and ranked; the scoring Explore uses when none is given. */
  scoring?: DayScoring;
  /** The pause between slices of the work (a test holds it to change the site mid-way). */
  pause?: () => Promise<void>;
}

/**
 * Every landing day of the next 12 months for the site and the period's length, in its own panel after the hour-by-hour
 * chart: each day coloured by how a landing that day does on power and on radio over the period, and pressed, it lands
 * the period there. The year is worked out a month of hours at a time, so the page stays free while it is.
 */
export function YearView(props: YearProps) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-h`} className="panel flex flex-col gap-3 max-sm:px-3">
      <h2 id={`${id}-h`} className="display text-[23px] font-semibold">
        Every landing day of the next 12 months
      </h2>
      <YearPanel {...props} />
    </section>
  );
}

function YearPanel({ eph, site, mask, startUtc, days, params, onLand, scoring = YEAR_SCORING, pause = nextTask }: YearProps) {
  const key = JSON.stringify([site.id, site.lat, site.lon, days, params.power, params.minEarthElDeg, startUtc.slice(11)]);
  const [anchor, setAnchor] = useState<Anchor>(() => ({ key, site, mask, startUtc, days, params }));
  // The year stays where it is while a day within it is chosen; anything else (the site, its skyline, the length, the
  // lander, the landing hour, or a landing outside it) starts it again from the period's landing.
  const count = eph ? yearDayCount(eph, anchor.startUtc, anchor.days) : 0;
  const chosen = daysAfter(anchor.startUtc, startUtc);
  const same = anchor.key === key && anchor.mask === mask;
  if (!(same && chosen !== null && chosen < count) && !(same && anchor.startUtc === startUtc)) {
    setAnchor({ key, site, mask, startUtc, days, params });
  }

  const [worked, setWorked] = useState<Worked | null>(null);
  const [pointer] = useState(createPointer);
  const pauseRef = useRef(pause);
  useEffect(() => {
    pauseRef.current = pause;
  });
  useEffect(() => {
    if (!eph) return;
    let live = true;
    const t0 = performance.now();
    let paused = 0;
    let longest = 0;
    let resumed = t0;
    const timedPause = async () => {
      const t = performance.now();
      longest = Math.max(longest, t - resumed);
      await pauseRef.current();
      resumed = performance.now();
      paused += resumed - t;
    };
    const steps = yearSteps(eph, { site: anchor.site, mask: anchor.mask, startUtc: anchor.startUtc, days: anchor.days, power: anchor.params.power, minEarthElDeg: anchor.params.minEarthElDeg });
    void runSliced(steps, () => !live, timedPause).then((year) => {
      if (!live || !year) return;
      const end = performance.now();
      setWorked({ anchor, year, busyMs: end - t0 - paused, sliceMs: Math.max(longest, end - resumed), wallMs: end - t0 });
    });
    return () => {
      live = false;
    };
  }, [eph, anchor]);

  // Only the year worked out for this very anchor is shown: one for an earlier site or period never is.
  const ready = worked && worked.anchor === anchor ? worked : null;
  // Luna's "show me the year" (spec 22): the year comes into view with its tab stop in focus, and she says its answer.
  // Asked before the year is worked out (she opens the forecast for it), it shows itself once it is.
  const box = useRef<HTMLDivElement>(null);
  const wanted = useRef(false);
  const show = useCallback(() => {
    box.current?.closest('section')?.scrollIntoView?.({ block: 'start' });
    box.current?.querySelector<HTMLButtonElement>('button[data-day][tabindex="0"]')?.focus({ preventScroll: true });
  }, []);
  useLunaControls({
    year: () => {
      show();
      if (ready) return headline(ready.year, scoring);
      wanted.current = true;
      return 'Working out every landing day of the next 12 months.';
    },
  });
  useEffect(() => {
    if (!ready || !wanted.current) return;
    wanted.current = false;
    show();
  }, [ready, show]);
  const months = useMemo(() => yearMonths(anchor.startUtc, count), [anchor.startUtc, count]);
  // Explore hands a new arrow each time it redraws (a dozen times a second during Play): the grid gets one that stays.
  const landRef = useRef(onLand);
  useEffect(() => {
    landRef.current = onLand;
  });
  const first = anchor.startUtc;
  const land = useCallback((k: number) => landRef.current(isoAt(first, k * 24)), [first]);
  const chosenDay = same && chosen !== null && chosen < count ? chosen : null;
  return (
    <div
      ref={box}
      className="flex flex-col gap-3"
      data-busy-ms={ready ? Math.round(ready.busyMs) : undefined}
      data-slice-ms={ready ? Math.round(ready.sliceMs) : undefined}
      data-wall-ms={ready ? Math.round(ready.wallMs) : undefined}
    >
      {/* One live line: the plain waiting state while the year is worked out, then the year's answer, read out as it comes. */}
      <p role="status" className={`max-w-[46em] text-[17px] leading-relaxed ${ready ? 'font-medium text-ink' : 'text-ink-2'}`}>
        {ready ? headline(ready.year, scoring) : count > 0 ? `Working out the ${count} landing days…` : 'Working out the landing days…'}
      </p>
      {count > 0 && (
        <Fold label="How the days are coloured" className="-mt-2 text-[15px]">
          <p className="max-w-[46em] text-[15px] text-ink">
            Each square is a landing that day at {anchor.startUtc.slice(11, 16)} UTC, coloured by its {anchor.days} days with the lander chosen above. Power counts
            first, then radio contact, as the best date is chosen; radio contact is Earth in view while the lander has power: a clear line home, not a booked
            link. A ring marks the landing shown above, a dot the best days; point at a day to see its figures under the year.
          </p>
        </Fold>
      )}
      {count > 0 && (
        <div className="stage px-2 py-3 sm:px-4">
          <Months months={months} year={ready?.year ?? null} scoring={scoring} chosenDay={chosenDay} pointer={pointer} onLand={land} />
          <ul aria-label="Key" className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[15px] text-stage-ink-2">
            {GRADES.map((g) => (
              <li key={g} className="flex items-center gap-2">
                <span aria-hidden="true" data-grade={g} className="relative block h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ backgroundColor: GRADE_COLOUR[g] }}>
                  {g === 'best' && <BestDot />}
                </span>
                {legendWords(anchor.days)[g]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ready && <Readout year={ready.year} scoring={scoring} chosenDay={chosenDay} pointer={pointer} />}
      {ready && tableEndNote(ready.year) && <p className="text-[15px] text-ink-2">{tableEndNote(ready.year)}</p>}
      {/* The days' figures come from the positions and the hills, as the answer's do: named last, as on every panel. */}
      <Sources of={['de440', ...lolaFor(site)]} />
    </div>
  );
}

/** The best days' mark besides their colour: a dark dot in the middle of the square. */
function BestDot() {
  return <span data-mark="best" aria-hidden="true" className="absolute inset-0 m-auto block h-[5px] w-[5px] rounded-full bg-black" />;
}

/**
 * The day under the pointer or the focus, shared by the grid and the readout under it: only the readout follows it, so
 * a pointer moving over the year redraws one line, not 365 squares.
 */
interface Pointer {
  value: number | null;
  set: (k: number | null) => void;
  subscribe: (listener: () => void) => () => void;
}
function createPointer(): Pointer {
  const listeners = new Set<() => void>();
  const p: Pointer = {
    value: null,
    set(k) {
      if (p.value === k) return;
      p.value = k;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return p;
}

/** The months of the year, drawn again only when the year, the chosen day or the tab stop changes, not with the page. */
const Months = memo(function Months({
  months,
  year,
  scoring,
  chosenDay,
  pointer,
  onLand,
}: {
  months: ReturnType<typeof yearMonths>;
  year: YearOfLandings | null;
  scoring: DayScoring;
  chosenDay: number | null;
  pointer: Pointer;
  onLand: (k: number) => void;
}) {
  const [stop, setStop] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const count = year?.count ?? 0;
  // Each day's grade and name, once per year worked out.
  const days = useMemo(() => (year ? Array.from({ length: year.count }, (_, k) => ({ grade: gradeOf(year, k, scoring), label: dayLabel(year, k, scoring) })) : []), [year, scoring]);
  const tabStop = stop !== null && stop < count ? stop : (chosenDay ?? 0);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = Number((e.target as HTMLElement).dataset.day);
    if (!year || Number.isNaN(from)) return;
    const to = moveDay(from, e.key, year.startUtc, count);
    if (to === null) return;
    e.preventDefault();
    setStop(to);
    box.current?.querySelector<HTMLButtonElement>(`[data-day="${to}"]`)?.focus();
  };
  const dayOf = (target: EventTarget) => {
    const day = (target as HTMLElement).closest?.('[data-day]')?.getAttribute('data-day');
    return day == null ? null : Number(day);
  };
  return (
    <div
      ref={box}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        const k = dayOf(e.target);
        if (k !== null) {
          setStop(k);
          pointer.set(k);
        }
      }}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) pointer.set(null);
      }}
      onPointerOver={(e) => pointer.set(dayOf(e.target))}
      onPointerLeave={() => pointer.set(null)}
      className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 lg:gap-x-4"
    >
      <p id={hintId} className="sr-only">
        Arrow keys move a day or a week, Page Up and Page Down a month. Enter lands on the day.
      </p>
      {months.map((m) => (
        <div key={m.key} className="min-w-0">
          <p aria-hidden="true" className="mb-1 whitespace-nowrap text-[15px] leading-tight text-stage-ink-2">
            {m.label}
          </p>
          <div role="grid" aria-label={m.name} aria-describedby={hintId} className="flex flex-col gap-[2px]">
            {m.rows.map((row, r) => (
              <div role="row" key={r} className="grid grid-cols-7 gap-[2px]">
                {row.map((k, c) => (
                  <div role="gridcell" key={c} className="aspect-square min-w-0">
                    {k !== null && days[k] && <Day k={k} grade={days[k].grade} label={days[k].label} chosen={k === chosenDay} tabStop={k === tabStop} onLand={onLand} />}
                    {k !== null && !days[k] && <span aria-hidden="true" className="block h-full w-full rounded-[3px] bg-stage-line" />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

/** One landing day: a square in its grade's colour, named by its date and figures; pressed, it lands the period there. */
const Day = memo(function Day({ k, grade, label, chosen, tabStop, onLand }: { k: number; grade: Grade; label: string; chosen: boolean; tabStop: boolean; onLand: (k: number) => void }) {
  return (
    <button
      type="button"
      data-day={k}
      data-grade={grade}
      tabIndex={tabStop ? 0 : -1}
      aria-label={label}
      aria-current={chosen ? 'date' : undefined}
      onClick={() => onLand(k)}
      className={`relative block h-full w-full rounded-[3px] ${chosen ? 'outline-2 outline-offset-1 outline-stage-ink' : ''}`}
      style={{ backgroundColor: GRADE_COLOUR[grade] }}
    >
      {grade === 'best' && <BestDot />}
    </button>
  );
});

/** The figures of the day under the pointer or the focus, in words, the day shown above saying so; how to use the year when there is none. */
function Readout({ year, scoring, chosenDay, pointer }: { year: YearOfLandings; scoring: DayScoring; chosenDay: number | null; pointer: Pointer }) {
  const k = useSyncExternalStore(pointer.subscribe, () => pointer.value, () => null);
  const day = k !== null && k < year.count ? k : null;
  const words = day === null ? 'Press a day to land on it.' : `${day === chosenDay ? 'Now shown: ' : ''}${dayFiguresWords(year, day, scoring)}`;
  return (
    <p data-testid="year-readout" className="min-h-[1.5em] text-[15px] text-ink">
      {words}
    </p>
  );
}
