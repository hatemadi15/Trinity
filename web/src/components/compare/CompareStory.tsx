'use client';
import { Fold } from '../Fold';
import { story, timingLine, type Column } from '@/lib/viz/compare';

/** What every figure assumes and what none of them shows, in plain words: the same lines open the comparison brief. */
export const ASSUMPTIONS: string[] = [
  'Every figure is for a lander that lands at the time shown, in UTC, and stays the number of days shown. The Sun’s and Earth’s directions come from the JPL DE440 table, hour by hour; the hills come from NASA LOLA elevation grids, traced from the mast height shown.',
  'Time with power counts from landing until the battery first runs out: the panel’s output from the Sun in view, minus the load, walked hour by hour. The model has no heaters, no dust and no ageing, and the load never changes.',
  'Earth in view is a clear line from the site to the centre of Earth above the hills. It is not a working radio link: antennas, the link budget and time on a ground station are not modelled.',
  'A site given as the centre of a region drawn on NASA’s map is about ±5 km from any one landing point: the hills there may differ.',
  'None of the figures shows landing safety (slopes, boulders), temperatures, or whether a lander survives a night without power.',
];

/**
 * The comparison in words, above the table: whether the scenarios share a landing time, what changed at the original
 * site and why, then which alternative works better and the trade-offs, with what the figures assume one tap away.
 */
export function CompareStory({ cols }: { cols: Column[] }) {
  const s = story(cols);
  const working = cols.some((c) => !c.outcome);
  return (
    <section aria-labelledby="h-story" className="panel flex flex-col gap-3">
      <h2 id="h-story" className="display text-[23px] font-semibold">
        What changed, and what works better
      </h2>
      <p className="text-ink-2">{timingLine(cols)}</p>
      {cols.length === 1 && <p className="max-w-[60em] text-ink">Slip the landing, or find a nearby alternative, to compare it with this baseline.</p>}
      {s.atOriginal.length > 0 && (
        <div>
          <h3 className="font-semibold text-ink">At the original site</h3>
          {s.atOriginal.map((line) => (
            <p key={line} className="mt-1 max-w-[60em] leading-relaxed text-ink">
              {line}
            </p>
          ))}
        </div>
      )}
      {s.alternative && (
        <div>
          <h3 className="font-semibold text-ink">At another site</h3>
          <p className="mt-1 max-w-[60em] leading-relaxed text-ink">{s.alternative.lead}</p>
          <ul className="mt-1 list-disc pl-5 text-ink">
            {s.alternative.tradeoffs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {working && <p className="text-[15px] text-ink-2">Working out the figures…</p>}
      <Fold label="What these figures assume, and what they do not show">
        <ul className="flex max-w-[60em] list-disc flex-col gap-1.5 pl-5 text-[15px] text-ink">
          {ASSUMPTIONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Fold>
    </section>
  );
}
