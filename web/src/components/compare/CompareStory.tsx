'use client';
import { Fold } from '../Fold';
import { story, timingLine, verdictLine, type Column } from '@/lib/viz/compare';

/** What every figure assumes and what none of them shows, in plain words: the same lines open the comparison brief. */
export const ASSUMPTIONS: string[] = [
  'Every figure is for a lander that lands at the time shown, in UTC, and stays the number of days shown. The Sun’s and Earth’s directions come from the JPL DE440 table, hour by hour; the hills come from NASA LOLA elevation grids, traced from the mast height shown.',
  'Time with power counts from landing until the battery first runs out: the panel’s output from the Sun in view, minus the load, walked hour by hour. The model has no heaters, no dust and no ageing, and the load never changes.',
  'Earth in view is a clear line from the site to the centre of Earth above the hills. It is not a working radio link: antennas, the link budget and time on a ground station are not modelled.',
  'A site given as the centre of a region drawn on NASA’s map is about ±5 km from any one landing point: the hills there may differ.',
  'None of the figures shows landing safety (slopes, boulders), temperatures, or whether a lander survives a night without power.',
];

/**
 * Which landing works best, in one line with the figure that decides it, and whether the landings share a landing
 * time. What changed at the same place, the other place that works better and the trade-offs wait one tap away.
 */
export function CompareStory({ cols }: { cols: Column[] }) {
  const s = story(cols);
  const verdict = verdictLine(cols);
  const working = cols.some((c) => !c.outcome);
  const more = s.atOriginal.length > 0 || s.alternative !== null;
  return (
    <section aria-labelledby="h-story" className="flex flex-col gap-1.5 rounded-lg border border-line border-l-[6px] border-l-good bg-band px-5 py-4 sm:px-6">
      <h2 id="h-story" className="text-[15px] font-semibold text-good">
        Which landing works best
      </h2>
      {verdict && <p className="max-w-[52em] text-[19px] font-medium leading-snug text-ink">{verdict.line}</p>}
      {working && <p className="text-[15px] text-ink-2">Working out the figures…</p>}
      <p className="text-[15px] text-ink-2">{timingLine(cols)}</p>
      {more && (
        <Fold label="What changed and why">
          <div className="flex flex-col gap-3">
            {s.atOriginal.length > 0 && (
              <div>
                <h3 className="font-semibold text-ink">Same place, another date</h3>
                {s.atOriginal.map((line) => (
                  <p key={line} className="mt-1 max-w-[60em] text-ink">
                    {line}
                  </p>
                ))}
              </div>
            )}
            {s.alternative && (
              <div>
                <h3 className="font-semibold text-ink">Another place</h3>
                <p className="mt-1 max-w-[60em] text-ink">{s.alternative.lead}</p>
                {/* The trade-offs are the table's own rows in words: one more tap away. */}
                {s.alternative.tradeoffs.length > 0 && (
                  <Fold label="The trade-offs">
                    <ul className="list-disc pl-5 text-ink">
                      {s.alternative.tradeoffs.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </Fold>
                )}
              </div>
            )}
          </div>
        </Fold>
      )}
    </section>
  );
}

/** What every figure assumes and what none of them shows, one tap away. */
export function Assumptions() {
  return (
    <Fold label="Assumptions and limits">
      <ul className="flex max-w-[60em] list-disc flex-col gap-1.5 pl-5 text-[15px] text-ink">
        {ASSUMPTIONS.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </Fold>
  );
}
