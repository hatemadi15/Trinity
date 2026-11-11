'use client';
import { useMemo, useRef } from 'react';
import { Fold } from '@/components/Fold';
import { SkyRow } from '@/components/SkyRow';
import { lolaFor, Sources, type SourceKey } from '@/components/Sources';
import type { Site } from '@/lib/data/loaders';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { dateLong, dayMonth } from '@/lib/viz/format';
import { compassTicks } from '@/lib/viz/skyrow';
import { batteryWords, chargeArea, hillsToward, hourAt, offRuns } from '@/lib/viz/timechart';
import { DottedSwatch, HillSwatch, Swatch } from './Swatches';

const SUN_H = 110;
const EARTH_H = 90;
const BATTERY_H = 30;
/** The rows share one grid: a narrow column of row names, then the plot. The time bar uses it too, so its track lines up under the plot. */
export const PLOT_GRID = 'grid grid-cols-[104px_minmax(0,1fr)] gap-x-3';
const GRID = `${PLOT_GRID} max-sm:grid-cols-1`;

/** The ticks whose position (percent of the width) lies in [from, to], keeping at least `gap` between neighbours. */
function spaced<T extends { hour: number }>(ticks: T[], at: (hour: number) => number, from: number, to: number, gap: number): T[] {
  const out: T[] = [];
  let last = -Infinity;
  for (const t of ticks) {
    const p = at(t.hour);
    if (p < from || p > to || p - last < gap) continue;
    last = p;
    out.push(t);
  }
  return out;
}

function RowName({ title }: { title: string }) {
  return (
    <div className="flex flex-col justify-center max-sm:mt-2">
      <span className="font-semibold leading-tight">{title}</span>
    </div>
  );
}

/**
 * "Why": the period hour by hour on one time axis that runs left to right. The Sun's height against
 * the hills in its direction, the same for Earth, and the battery. Pointing at the chart shows that
 * hour in the time bar; pressing or dragging moves the time. The keyboard path is the time bar's slider.
 */
export function TimeChart({
  series,
  mask,
  power,
  batteryWh,
  startUtc,
  days,
  cursor,
  hoverHour,
  onCursor,
  onHover,
  site,
}: {
  series: Series;
  mask: ArrayLike<number>;
  power: PowerResult | null;
  batteryWh: number;
  startUtc: string;
  days: number;
  cursor: number;
  hoverHour: number | null;
  onCursor: (hour: number) => void;
  onHover: (hour: number | null) => void;
  /** The site, so the row of data sources can name the grid its hills come from. */
  site?: Pick<Site, 'lat' | 'polar'>;
}) {
  const hours = series.hours;
  const dragging = useRef(false);
  const sunHill = useMemo(() => hillsToward(mask, series.sunAz), [mask, series.sunAz]);
  const earthHill = useMemo(() => hillsToward(mask, series.earthAz), [mask, series.earthAz]);
  const sunUp = useMemo(() => Uint8Array.from(series.sunFraction, (f) => (f > 0 ? 1 : 0)), [series.sunFraction]);
  const lola = useMemo<SourceKey[]>(() => {
    if (site) return lolaFor(site);
    // Without the site the grid is not known, so the row names the 20 m grid of the polar models. A horizon of
    // zeros is a place off the polar grids, with no hills to credit.
    return Array.from(mask).some((v) => v !== 0) ? ['lola'] : [];
  }, [site, mask]);
  const pct = (hour: number) => ((hour + 0.5) / hours) * 100;
  const period = `the ${days} days from ${dateLong(startUtc, 0)}`;

  const compass = spaced(compassTicks(series.sunAz), pct, 3, 97, 9);
  const every = days > 45 ? 10 : 5;
  const dayTicks = Array.from({ length: Math.floor((days - 1) / every) + 1 }, (_, k) => k * every);
  const off = power ? offRuns(power.powered) : [];
  const longestOff = off.reduce<{ from: number; to: number } | null>((best, r) => (!best || r.to - r.from > best.to - best.from ? r : best), null);

  const at = (e: React.PointerEvent<HTMLDivElement>): number | null => {
    if (!Number.isFinite(e.clientX)) return null;
    const box = e.currentTarget.getBoundingClientRect();
    return hourAt(e.clientX - box.left, box.width, hours);
  };

  return (
    <section aria-labelledby="h-why-chart" className="panel">
      <h2 id="h-why-chart" className="display text-[23px] font-semibold">
        Why: the {days} days, hour by hour
      </h2>
      {/* How to read the chart is read once, so it waits one tap away (spec 20.1); the key below names every mark without it. */}
      <Fold label="How to read the chart" className="mt-1 text-[15px]">
        <p className="max-w-[46em] text-[15px] text-ink">
          Time runs left to right. From the site, the Sun goes once round the sky in a month: the top row names its direction, and the grey is the hills that way at that hour, not one mountain.
          Earth stays low over one stretch of the horizon; the Moon&apos;s slow monthly wobble lifts it into view and lowers it out of view. Press Play in the bar at the bottom to run through the
          days.
        </p>
      </Fold>
      <ul aria-label="Key" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
        <li className="flex items-center gap-2">
          <Swatch color="var(--stage-sun)" />
          the Sun&apos;s height
        </li>
        <li className="flex items-center gap-2">
          <Swatch color="var(--stage-earth)" />
          Earth&apos;s height
        </li>
        <li className="flex items-center gap-2">
          <DottedSwatch />
          dotted while set
        </li>
        <li className="flex items-center gap-2">
          <HillSwatch />
          the hills in its direction at that time
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" data-swatch="" className="block h-3.5 w-9 shrink-0 rounded-sm bg-good" />
          battery charge
        </li>
      </ul>

      <div className={`${GRID} mt-3`}>
        <span className="self-end pb-1 text-[15px] leading-tight text-ink-2 max-sm:hidden">Direction of the Sun</span>
        <div data-testid="compass" aria-hidden="true" className="relative h-8 text-[15px] text-ink-2 max-sm:hidden">
          {/* Each word sits over the hour the Sun reaches that direction, with a tick down to the chart. */}
          {compass.map((t) => (
            <span key={t.hour} data-direction="" className="absolute top-0 flex flex-col items-center whitespace-nowrap" style={{ left: `${pct(t.hour)}%`, transform: 'translateX(-50%)' }}>
              {t.label}
              <i data-tick="" className="mt-0.5 block h-1.5 w-px bg-ink-2" />
            </span>
          ))}
        </div>
      </div>

      <div className="relative">
        <div className={`${GRID} gap-y-2`}>
          <RowName title="The Sun" />
          <div className="stage">
            <SkyRow el={series.sunEl} hill={sunHill} visible={sunUp} startUtc={startUtc} body="sun" caption={`The Sun over ${period}`} height={SUN_H} ticks={false} />
          </div>
          <RowName title="Earth" />
          <div className="stage">
            <SkyRow el={series.earthEl} hill={earthHill} visible={series.earthVisible} startUtc={startUtc} body="earth" caption={`Earth over ${period}`} height={EARTH_H} ticks={false} />
          </div>
          {power && (
            <>
              <RowName title="Battery" />
              <div role="img" aria-label={batteryWords(power, startUtc, days)} className="relative overflow-hidden rounded-lg bg-surface-2" style={{ height: BATTERY_H }}>
                <svg viewBox={`0 0 1000 ${BATTERY_H}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
                  <path d={chargeArea(power.energyWh, batteryWh, 1000, BATTERY_H)} fill="var(--good)" />
                  {off.map((r) => (
                    <rect key={r.from} x={(r.from / hours) * 1000} y={BATTERY_H - 3} width={((r.to - r.from) / hours) * 1000} height={3} fill="var(--bad)" />
                  ))}
                </svg>
                {longestOff && (longestOff.to - longestOff.from) / hours > 0.2 && (
                  <span
                    data-label=""
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-semibold text-bad"
                    style={{ left: `${((longestOff.from + longestOff.to) / 2 / hours) * 100}%`, fontSize: 15 }}
                  >
                    battery empty, lander off
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* The time of the time bar, the hour under the pointer, and the layer that listens to the pointer: all over the plot column. */}
        <div className="pointer-events-none absolute inset-y-0 left-[116px] right-0 max-sm:left-0">
          {hoverHour !== null && <div data-part="hover" className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${pct(hoverHour)}%` }} />}
          {/* Light with dark edges: it shows on the black rows and on the light battery row. */}
          <div data-part="cursor" className="absolute inset-y-0 w-1 -translate-x-1/2 border-x border-ink bg-stage-ink" style={{ left: `${pct(cursor)}%` }}>
            <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-ink" />
          </div>
          <div
            data-part="pointer"
            className="pointer-events-auto absolute inset-0 cursor-crosshair touch-pan-y"
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              const h = at(e);
              if (h !== null) onCursor(h);
            }}
            onPointerMove={(e) => {
              const h = at(e);
              if (h === null) return;
              if (dragging.current) onCursor(h);
              else onHover(h);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            onPointerLeave={() => {
              dragging.current = false;
              onHover(null);
            }}
          />
        </div>
      </div>

      <div className={`${GRID} mt-1`}>
        <span className="max-sm:hidden" />
        <div data-testid="days" aria-hidden="true" className="relative h-6 text-[15px] text-ink-2">
          {dayTicks.map((d, i) => (
            <span key={d} data-day="" className={`absolute whitespace-nowrap ${i % 2 === 1 ? 'max-sm:hidden' : ''}`} style={d === 0 ? { left: 0 } : { left: `${((d * 24) / hours) * 100}%`, transform: 'translateX(-50%)' }}>
              {dayMonth(startUtc, d * 24)}
            </span>
          ))}
        </div>
      </div>
      {/* DE440 gives the heights of the Sun and Earth, LOLA the hills. The battery is the app's own model, so it has no pill. */}
      <Sources of={['de440', ...lola]} />
    </section>
  );
}
