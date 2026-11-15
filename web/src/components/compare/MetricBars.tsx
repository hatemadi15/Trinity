import { figureRows, type Column, type FigureRow } from '@/lib/viz/compare';
import { landingColor, landingTitle } from './identity';

/** The four figures drawn as bars, with how long each bar is: a share of the longest stay, or of the stay for sunlight. */
const METRICS: { id: FigureRow['id']; note: string; share: (c: Column, span: number) => number }[] = [
  { id: 'power', note: 'longer is better', share: (c, span) => c.outcome!.poweredH / span },
  { id: 'contact', note: 'longer is better', share: (c, span) => c.outcome!.poweredContactH / span },
  { id: 'sun', note: 'share of the stay', share: (c) => c.outcome!.sunFraction },
  { id: 'night', note: 'shorter is better', share: (c, span) => c.outcome!.longestNightH / span },
];

/**
 * The four figures that decide a comparison, each as one bar per landing in the landing's colour, with the value in
 * words beside it and the best marked as the table marks it (the same rows, from `figureRows`). The three in hours
 * share one scale, the longest stay, so a bar's length reads the same in each.
 */
export function MetricBars({ cols }: { cols: Column[] }) {
  const rows = figureRows(cols);
  const span = Math.max(...cols.map((c) => c.outcome?.hours ?? c.scenario.days * 24));
  return (
    <section aria-labelledby="h-bars" className="panel">
      <h2 id="h-bars" className="display text-[21px] font-semibold">
        The key figures
      </h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {METRICS.map((m) => {
          const row = rows.find((r) => r.id === m.id)!;
          return (
            <div key={m.id} role="group" aria-label={row.name} className="rounded-lg border border-line bg-surface-2/45 px-4 py-3">
              <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold text-ink">
                {row.name}
                <span className="text-[15px] font-normal text-ink-2">{m.note}</span>
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {cols.map((c, i) => {
                  const cell = row.cells[i];
                  return (
                    <li key={c.scenario.id} className="grid grid-cols-[76px_1fr_auto] sm:grid-cols-[104px_1fr_auto] items-center gap-x-3 text-[15px]">
                      <span className="truncate text-ink-2">{landingTitle(i)}</span>
                      <span aria-hidden="true" className="block h-[18px] overflow-hidden rounded-[4px] border border-line bg-page">
                        {cell && c.outcome && <i data-bar="" className="block h-full rounded-[3px] motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${Math.max(0, Math.min(1, m.share(c, span))) * 100}%`, background: landingColor(i) }} />}
                      </span>
                      <span className="flex items-center justify-end sm:min-w-[104px] gap-2 text-right font-semibold tabular-nums text-ink">
                        {cell ? cell.value : <span className="font-normal text-ink-2">working out…</span>}
                        {cell?.best && <span className="rounded-full bg-good px-2 text-[14px] font-semibold text-page">Best</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
