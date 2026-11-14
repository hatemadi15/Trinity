'use client';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { dateTimeUtc } from '@/lib/viz/format';

/** The forecast's hour by hour, as the home page's band draws it. */
export interface ForecastSeries {
  startUtc: string;
  sunEl: ArrayLike<number>;
  lit: ArrayLike<number>;
  earthEl: ArrayLike<number>;
  earthVisible: ArrayLike<number>;
}

const deg = (x: number) => `${x >= 0 ? '' : '−'}${Math.abs(x).toFixed(1)}°`;

/** What one hour says, in words: the date, and where the Sun and Earth stand and whether each can be seen. */
export function hourWords(s: ForecastSeries, hour: number) {
  return {
    when: dateTimeUtc(s.startUtc, hour),
    sun: `${deg(s.sunEl[hour])} up, ${s.lit[hour] ? 'shining on the site' : s.sunEl[hour] < 0 ? 'below the horizon' : 'behind the hills'}`,
    earth: `${deg(s.earthEl[hour])} up, ${s.earthVisible[hour] ? 'in view for radio' : s.earthEl[hour] < 0 ? 'below the horizon' : 'hidden by the hills'}`,
    sunUp: Boolean(s.lit[hour]),
    earthUp: Boolean(s.earthVisible[hour]),
  };
}

/** The hour under a point `fx` (0 to 1) across the chart: the rows draw hour h at (h + 0.5) / n of their width. */
export const hourAtFraction = (fx: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(fx * n)));

/**
 * The home page's forecast rows, made readable hour by hour (spec 23): a line follows the pointer across both rows
 * and a card beside it says the date, the Sun's height and Earth's, and whether each is in view. By keyboard the
 * arrow keys step an hour (with Shift, a day); a screen reader hears the card as it changes.
 */
export function ForecastHover({ series, children }: { series: ForecastSeries; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [hour, setHour] = useState<number | null>(null);
  const n = series.sunEl.length;
  const fromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    setHour(hourAtFraction((clientX - r.left) / r.width, n));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 24 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHour((h) => Math.min(n - 1, Math.max(0, (h ?? 0) + (e.key === 'ArrowRight' ? step : -step))));
    } else if (e.key === 'Escape') setHour(null);
  };
  const w = hour === null ? null : hourWords(series, hour);
  const at = hour === null ? 0 : ((hour + 0.5) / n) * 100;
  return (
    <div
      ref={box}
      data-forecast-hover=""
      tabIndex={0}
      role="group"
      aria-label="The forecast, hour by hour: use the arrow keys to read it"
      onPointerMove={(e) => fromPointer(e.clientX)}
      onPointerDown={(e) => fromPointer(e.clientX)}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setHour(null);
      }}
      onKeyDown={onKey}
      onBlur={() => setHour(null)}
      className="relative cursor-crosshair outline-none"
    >
      {children}
      {w && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-[#a8c6ff] shadow-[0_0_12px_rgba(127,169,255,0.9)]" style={{ left: `${at}%` }} />
          <div
            data-hour-card=""
            className="pointer-events-none absolute top-3 z-10 w-[min(290px,calc(100%-32px))] rounded-xl border border-white/15 bg-black/90 p-3.5 text-[15px] leading-snug text-[#f5f5f3] shadow-[0_0_40px_-12px_rgba(127,169,255,0.6)]"
            style={at > 55 ? { right: `calc(${100 - at}% + 14px)` } : { left: `calc(${at}% + 14px)` }}
          >
            <p className="mono text-[14px] text-[#a8c6ff]">{w.when}</p>
            <p className="mt-2 flex items-start gap-2">
              <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${w.sunUp ? 'bg-[#f3efe4] shadow-[0_0_8px_#f3efe4]' : 'border border-[#f3efe4]'}`} />
              <span>
                <b className="font-semibold">Sun</b> {w.sun}
              </span>
            </p>
            <p className="mt-1 flex items-start gap-2">
              <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${w.earthUp ? 'bg-[#7fa9ff] shadow-[0_0_8px_#7fa9ff]' : 'border border-[#7fa9ff]'}`} />
              <span>
                <b className="font-semibold">Earth</b> {w.earth}
              </span>
            </p>
          </div>
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {w ? `${w.when}. Sun ${w.sun}. Earth ${w.earth}.` : ''}
      </p>
    </div>
  );
}
