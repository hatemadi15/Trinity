'use client';
import { MiniStrip } from './MiniStrip';
import type { ScenarioRun } from '@/lib/store/scenarios';
import { figureRows, landingShort, settingRows, type Column, type Tone } from '@/lib/viz/compare';
import { isoAt, spanShort } from '@/lib/viz/format';

const TONE: Record<Tone, string> = { better: 'text-good', worse: 'text-bad', same: 'text-ink-2' };
const HEAD = 'sticky left-0 z-[1] bg-surface border-b border-line py-2.5 pr-4 text-left align-top text-[15px] font-semibold text-ink-2';
const CELL = 'border-b border-line py-2.5 pr-4 align-top';

/** A figure and, under it, its change from the baseline in the colour of better or worse, the word itself for a screen reader. */
function Figure({ value, change, tone }: { value: string; change: string | null; tone: Tone | null }) {
  return (
    <>
      <span className="block font-medium tabular-nums text-ink">{value}</span>
      {change && (
        <span className={`block text-[15px] tabular-nums ${tone ? TONE[tone] : 'text-ink-2'}`}>
          {change}
          {tone && tone !== 'same' && <span className="sr-only">, {tone}</span>}
        </span>
      )}
    </>
  );
}

/**
 * The scenarios side by side: one column each, the baseline first, the settings and then the figures, each figure with
 * its change from the baseline. A wide table scrolls inside its own box, the row names staying in view.
 */
export function ScenarioTable({ cols, runs, onUseBest }: { cols: Column[]; runs: Record<string, ScenarioRun>; onUseBest: (id: string) => void }) {
  const settings = settingRows(cols);
  const figures = figureRows(cols);
  const pending = (i: number) => {
    const r = runs[cols[i].scenario.id];
    return r?.status === 'error' ? 'cannot be worked out' : 'working out…';
  };
  return (
    <div role="region" aria-label="The scenarios side by side" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sun-ink">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">Each scenario’s settings and figures, with the change from the baseline under each figure.</caption>
        <thead>
          <tr>
            <th scope="col" className={HEAD}>
              Scenario
            </th>
            {cols.map((c, i) => (
              <th key={c.scenario.id} scope="col" className="min-w-[150px] border-b-2 border-ink py-2.5 pr-4 align-top">
                <span className="block text-[15px] font-normal text-ink-2">{i === 0 ? 'Baseline' : `Scenario ${i + 1}`}</span>
                <span className="block font-semibold text-ink">{c.scenario.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {settings.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={HEAD}>
                {row.name}
              </th>
              {row.cells.map((cell, i) => (
                <td key={cols[i].scenario.id} className={`${CELL} text-[15px]`}>
                  <span className="block text-ink">{cell.value}</span>
                  {cell.change && <span className="block text-ink-2">{cell.change}</span>}
                  {row.id === 'landing' && cols[i].scenario.timing === 'site-best' && <span className="block text-ink-2">the site’s own best time</span>}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" className={HEAD}>
              Sun and Earth, hour by hour
            </th>
            {cols.map((c) => {
              const series = runs[c.scenario.id]?.result?.series;
              return (
                <td key={c.scenario.id} className={CELL}>
                  {series && c.outcome && <MiniStrip series={series} name={c.siteName} period={`the ${c.scenario.days} days from ${landingShort(c.scenario.startUtc)}`} />}
                </td>
              );
            })}
          </tr>
          {figures.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={HEAD}>
                {row.name}
              </th>
              {row.cells.map((cell, i) => (
                <td key={cols[i].scenario.id} className={CELL}>
                  {cell ? <Figure {...cell} /> : <span className="text-[15px] text-ink-2">{pending(i)}</span>}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" className={HEAD}>
              Its own best landing in its stay
            </th>
            {cols.map((c) => {
              const best = c.outcome?.best;
              const here = best && best.hour === 0;
              return (
                <td key={c.scenario.id} className={`${CELL} text-[15px]`}>
                  {!c.outcome ? null : !best ? (
                    <span className="text-ink-2">no sunlit hour</span>
                  ) : here ? (
                    <span className="text-ink-2">this landing time</span>
                  ) : (
                    <>
                      <span className="block text-ink">{landingShort(isoAt(c.scenario.startUtc, best.hour))}</span>
                      <span className="block text-ink-2">power {best.poweredHours >= c.outcome.hours ? `all ${c.scenario.days} days` : spanShort(best.poweredHours)}</span>
                      <button type="button" onClick={() => onUseBest(c.scenario.id)} aria-label={`Add “${c.scenario.label}” at this landing time`} className="mt-1 min-h-10 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                        Add it
                      </button>
                    </>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
