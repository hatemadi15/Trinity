'use client';
import { useMemo } from 'react';
import { Fold } from '@/components/Fold';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { contactPlan, outageNote, outageWords, poweredContactWords, radioChangeWords, windowsCountWords, windowUse, windowUseWords, type RadioWindow, type WindowUse } from '@/lib/viz/contact';
import { clockUtc, dayMonth, spanShort } from '@/lib/viz/format';

/** The mark beside a window's power: solid green with power, a green ring when only if the lander survives the cold, grey with none. */
const MARK: Record<WindowUse, string> = {
  all: 'bg-good',
  part: 'bg-good',
  'if-survives': 'border-2 border-good',
  none: 'bg-line-strong',
};
const CELL = 'border-b border-line py-2.5 pr-4 align-top';
/** On a phone a cell is a line of its own: its column's name on the left, the figure on the right (as Compare's table). */
const STACKED = 'max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:border-0 max-sm:py-1 max-sm:pr-0 max-sm:text-right max-sm:before:shrink-0 max-sm:before:text-left max-sm:before:text-[15px] max-sm:before:text-ink-2 max-sm:before:content-[attr(data-label)]';

/** One figure: its name, the value, and what bounds it. */
function Figure({ name, value, note }: { name: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-semibold">{name}</dt>
      <dd className="display mt-1 text-[24px] font-semibold leading-tight">{value}</dd>
      <dd className="mt-0.5 text-[15px] text-ink-2">{note}</dd>
    </div>
  );
}

/** An hour of the period as the list writes it, the column naming UTC: "10 Jan, 03:00". */
const when = (startUtc: string, hour: number) => `${dayMonth(startUtc, hour)}, ${clockUtc(startUtc, hour)}`;

function Row({ w, startUtc }: { w: RadioWindow; startUtc: string }) {
  const use = windowUse(w);
  return (
    <tr className="max-sm:block max-sm:border-b max-sm:border-line max-sm:py-2">
      <th scope="row" data-label="Opens (UTC)" className={`${CELL} ${STACKED} font-medium tabular-nums`}>
        {w.fromStart ? 'open at the start' : when(startUtc, w.start)}
      </th>
      <td data-label="Closes (UTC)" className={`${CELL} ${STACKED} tabular-nums`}>
        {w.toEnd ? 'open at the end' : when(startUtc, w.end)}
      </td>
      <td data-label="Length" className={`${CELL} ${STACKED} tabular-nums`}>
        {w.fromStart || w.toEnd ? `at least ${spanShort(w.hours)}` : spanShort(w.hours)}
      </td>
      <td data-label="Lander power" className={`${CELL} ${STACKED}`}>
        <span className="inline-flex items-baseline gap-2">
          <i data-use={use} aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-full ${MARK[use]}`} />
          {windowUseWords(w)}
        </span>
      </td>
    </tr>
  );
}

/**
 * Radio windows: the stretches with Earth in view from the site, when a radio link straight to Earth is geometrically
 * possible (geometric direct-to-Earth visibility, by the rule the status sentence and the numbers use). At the time bar's
 * hour, the next opening or closing; for the period, the hours with Earth in view, the longest time without it and the
 * radio contact while the lander has power; every window in a fold with its times in UTC, its length and the lander's power
 * in it. Said once, plainly: Earth in view alone is not a working link.
 */
export function RadioWindows({ series, power, startUtc, hour }: { series: Series; power: PowerResult | null; startUtc: string; hour: number }) {
  const plan = useMemo(() => contactPlan(series, power), [series, power]);
  const shown = Math.min(series.hours - 1, Math.max(0, hour));
  const withPower = poweredContactWords(plan);
  return (
    <section aria-labelledby="h-radio" className="panel">
      <h2 id="h-radio" className="display text-[23px] font-semibold">
        Radio windows
      </h2>
      <p className="mt-1 text-ink-2">When Earth is in view, a radio link straight to Earth is geometrically possible: direct-to-Earth visibility.</p>
      {/* At the time bar's hour, as it moves; two lines kept on a phone so the page below stays put. */}
      <p data-testid="radio-next" className="mt-3 text-[17px] font-semibold tabular-nums max-sm:min-h-[2lh]">
        {radioChangeWords(plan, shown, startUtc)}
      </p>
      <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-3">
        <Figure name="Earth in view" value={plan.totalHours > 0 ? spanShort(plan.totalHours) : 'none'} note={windowsCountWords(plan)} />
        <Figure name="Longest without Earth" value={outageWords(plan.longestOutage)} note={outageNote(plan.longestOutage, startUtc)} />
        <Figure name="Radio contact while it has power" value={withPower.value} note={withPower.note} />
      </dl>
      {plan.windows.length > 0 && (
        <Fold label="Every window, with its times" className="mt-3">
          <table className="w-full border-collapse text-left max-sm:block">
            <thead className="max-sm:sr-only">
              <tr className="text-[15px] text-ink-2">
                {['Opens (UTC)', 'Closes (UTC)', 'Length', 'Lander power'].map((name) => (
                  <th key={name} scope="col" className="border-b-2 border-ink py-2 pr-4 font-semibold">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {plan.windows.map((w) => (
                <Row key={w.start} w={w} startUtc={startUtc} />
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[15px] text-ink-2">Each time is the first whole hour with Earth in view, or without it: the change falls within the hour before.</p>
        </Fold>
      )}
      <p className="mt-3 text-[15px] text-ink-2">Earth in view alone does not establish antenna performance, the link budget, ground-station availability or a scheduled contact.</p>
    </section>
  );
}
