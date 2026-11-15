import type { ScenarioRun } from '@/lib/store/scenarios';
import type { Column } from '@/lib/viz/compare';
import { pct0, spanWords } from '@/lib/viz/format';
import { landingColor, landingTitle } from './identity';

/** The hours where `on` holds, as [from, to) runs. */
function runsOf(n: number, on: (h: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let from = -1;
  for (let h = 0; h <= n; h++) {
    const yes = h < n && on(h);
    if (yes && from < 0) from = h;
    if (!yes && from >= 0) {
      out.push([from, h]);
      from = -1;
    }
  }
  return out;
}

const LANES = [
  { id: 'sun', name: 'Sunlight', fill: 'var(--stage-sun)' },
  { id: 'earth', name: 'Earth in view', fill: 'var(--stage-earth)' },
  { id: 'contact', name: 'Radio contact with power', fill: 'var(--stage-good)' },
] as const;

/**
 * Every landing's stay as three lanes on one time axis, the days after its own landing: sunlight in warm white, Earth
 * in view in blue, and in green the hours of radio contact while it has power (the table's figure: Earth in view with
 * power, before the battery first runs out), the colours of the home forecast's strip. A red line marks the hour the
 * battery first runs out. The picture stands on a black panel in both themes; a sentence per landing says the same.
 */
export function LandingStrips({ cols, runs }: { cols: Column[]; runs: Record<string, ScenarioRun> }) {
  const span = Math.max(...cols.map((c) => c.scenario.days * 24));
  const days = Math.round(span / 24);
  const step = days <= 14 ? 2 : 5;
  const ticks = Array.from({ length: Math.floor(days / step) + 1 }, (_, i) => i * step);
  return (
    <section aria-labelledby="h-strips" className="theme-dark stage px-4 pb-3 pt-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 id="h-strips" className="display text-[21px] font-semibold text-stage-ink">
          Hour by hour
        </h2>
        <ul aria-hidden="true" className="flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-stage-ink">
          {LANES.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <i className="block size-3.5 rounded-[3px]" style={{ background: l.fill }} />
              {l.name}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <i className="block h-4 w-[3px] bg-bad" />
            Battery runs out
          </li>
        </ul>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {cols.map((c, i) => {
          const result = runs[c.scenario.id]?.result;
          const o = c.outcome;
          const n = result?.series.hours ?? 0;
          const cut = result?.power.firstBrownoutHour ?? null;
          const lanes = result
            ? [
                runsOf(n, (h) => result.series.sunFraction[h] > 0),
                runsOf(n, (h) => result.series.earthVisible[h] === 1),
                runsOf(n, (h) => result.series.earthVisible[h] === 1 && result.power.powered[h] === 1 && (cut === null || h < cut)),
              ]
            : null;
          return (
            <li key={c.scenario.id} data-strip="" className="grid items-center gap-x-4 gap-y-1 md:grid-cols-[210px_1fr]">
              <p className="flex min-w-0 items-center gap-2 text-[15px] leading-tight text-stage-ink">
                <i aria-hidden="true" className="block size-3.5 shrink-0 rounded-full" style={{ background: landingColor(i) }} />
                <span className="min-w-0">
                  <b className="font-semibold">{landingTitle(i)}</b>
                  <span className="block truncate text-stage-ink-2 max-md:inline max-md:pl-2">{c.scenario.label}</span>
                </span>
              </p>
              {lanes && o ? (
                <>
                  <p className="sr-only">
                    Sunlight {pct0(o.sunFraction)} of the stay, Earth in view {pct0(o.earthFraction)}, radio contact while it has power {o.poweredContactH > 0 ? spanWords(o.poweredContactH) : 'none'}.{' '}
                    {o.allPeriod ? 'The battery never runs out.' : `The battery first runs out after ${spanWords(o.poweredH)}.`}
                  </p>
                  <div aria-hidden="true" className="relative h-[58px]" style={{ borderLeft: `4px solid ${landingColor(i)}` }}>
                    <svg viewBox={`0 0 ${span} 58`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                      {lanes.map((lane, k) => (
                        <g key={LANES[k].id} data-lane={LANES[k].id}>
                          <rect x={0} y={k * 20} width={n} height={18} fill="#fff" opacity={0.1} />
                          {lane.map(([a, b]) => (
                            <rect key={a} x={a} y={k * 20} width={b - a} height={18} fill={LANES[k].fill} />
                          ))}
                        </g>
                      ))}
                    </svg>
                    {cut !== null && <i data-cut="" className="absolute inset-y-[-3px] w-[3px] -translate-x-1/2 bg-bad" style={{ left: `${(cut / span) * 100}%` }} />}
                  </div>
                </>
              ) : (
                <p className="text-[15px] text-stage-ink-2">{runs[c.scenario.id]?.status === 'error' ? 'Cannot be worked out.' : 'Working out…'}</p>
              )}
            </li>
          );
        })}
      </ul>
      <div aria-hidden="true" className="mt-2 grid gap-x-4 md:grid-cols-[210px_1fr]">
        <span className="max-md:hidden" />
        <div className="relative h-7 border-t border-stage-raised-line text-[15px] text-stage-ink-2">
          {ticks.map((d, i) => (
            <span key={d} className={`absolute top-1 whitespace-nowrap ${i === 0 ? '' : d === days ? '-translate-x-full' : '-translate-x-1/2'} ${i % 2 ? 'max-sm:hidden' : ''}`} style={{ left: `${(d / days) * 100}%` }}>
              {i === 0 ? 'Landing' : `day ${d}`}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
