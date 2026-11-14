'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { EarthDrawing, Frame, HillsDrawing, SunDrawing, Tick } from '@/lib/viz/why';

/**
 * The three drawings of "Why the south pole is hard" (spec 23.3), drawn from the app's own month at de Gerlache Rim 2,
 * January 2027 (lib/viz/why.ts): the Sun's path by direction and height, the two skylines 12 km apart with the Sun
 * against each, and Earth's small loop over the hills. They sit on the black stage in both themes. Every word on them
 * is page text laid over the drawing at 14 px or more, so it keeps its size when the drawing gets smaller; each axis
 * says what it measures, in degrees.
 *
 * Each is an image with a text alternative that says what it shows, in the month's own figures, and a line under it
 * says what to notice. Played (the pointer on it, or its Play button from the keyboard), a marker runs along the month
 * with the date; with reduced motion nothing moves and the drawing shows the month's last hour, still.
 */

/** How long a played drawing takes to run through the month, in seconds. */
const PLAY_S = 7;

/** A drawing's picture and the words over it: an image to a screen reader, with `alt` its words. */
function Picture({ w, h, alt, children, labels }: { w: number; h: number; alt: string; children: ReactNode; labels: ReactNode }) {
  return (
    <div role="img" aria-label={alt} className="stage transition-[border-color,box-shadow] duration-500 group-hover:border-[#7fa9ff]/60 group-hover:shadow-[0_0_40px_-14px_rgba(127,169,255,0.7)]">
      <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="block w-full">
        {children}
      </svg>
      <div aria-hidden="true">{labels}</div>
    </div>
  );
}

/** A word on a drawing, at a point given in the drawing's own units, at 14 or 15 px whatever the drawing's size. */
function Label({
  at,
  view,
  children,
  soft = false,
  chip = false,
  align = 'left',
  size = 15,
  className = '',
}: {
  at: [number, number];
  view: { w: number; h: number };
  children: ReactNode;
  soft?: boolean;
  chip?: boolean;
  align?: 'left' | 'center' | 'right';
  size?: 14 | 15;
  className?: string;
}) {
  const shift = align === 'center' ? '-translate-x-1/2' : align === 'right' ? '-translate-x-full' : '';
  const style: CSSProperties = { left: `${(at[0] / view.w) * 100}%`, top: `${(at[1] / view.h) * 100}%`, fontSize: size, lineHeight: size === 14 ? '18px' : '20px' };
  return (
    <span data-label="" className={`absolute block -translate-y-1/2 whitespace-nowrap ${shift} ${soft ? 'text-stage-ink-2' : 'text-stage-ink'} ${chip ? 'rounded-[5px] bg-stage/80 px-1.5' : ''} ${className}`} style={style}>
      {children}
    </span>
  );
}

/** The axes of a chart: heights at the left, directions under it, with faint lines across at each height. */
function Axes({ x0, x1, y1, xTicks, yTicks }: { x0: number; x1: number; y1: number; xTicks: Tick[]; yTicks: Tick[] }) {
  return (
    <g>
      {yTicks.map((t) => (
        <line key={`y${t.label}`} x1={x0} x2={x1} y1={t.at} y2={t.at} stroke="var(--stage-ink-2)" strokeOpacity={t.label === '0°' ? 0 : 0.14} strokeWidth="1" />
      ))}
      <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="var(--stage-ink-2)" strokeOpacity="0.5" strokeWidth="1" />
      {xTicks.map((t) => (
        <line key={`x${t.at}`} x1={t.at} x2={t.at} y1={y1} y2={y1 + 4} stroke="var(--stage-ink-2)" strokeOpacity="0.6" strokeWidth="1" />
      ))}
    </g>
  );
}

function AxisLabels({ view, x0, y1, xTicks, yTicks, xTitle }: { view: { w: number; h: number }; x0: number; y1: number; xTicks: Tick[]; yTicks: Tick[]; xTitle?: string }) {
  return (
    <>
      {yTicks.map((t) => (
        <Label key={`y${t.label}`} at={[x0 - 5, t.at]} view={view} soft align="right" size={14}>
          {t.label}
        </Label>
      ))}
      {xTicks.map((t, i) => (
        <Label key={`x${i}`} at={[t.at, y1 + 13]} view={view} soft align="center" size={14}>
          {t.label}
        </Label>
      ))}
      {xTitle && (
        <Label at={[view.w - 14, y1 + 33]} view={view} soft align="right" size={14}>
          {xTitle}
        </Label>
      )}
    </>
  );
}

/**
 * A drawing's month, played: the stop shown (or none before a first play), whether it runs, and its controls. The
 * pointer on the drawing plays it; its button plays and pauses it from the keyboard. With reduced motion it never runs
 * and shows its last stop.
 */
function usePlay(count: number) {
  const reduced = useReducedMotion();
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const from = useRef(0);
  useEffect(() => {
    if (!playing || reduced) return;
    const t0 = performance.now(), start = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = start + ((now - t0) / 1000 / PLAY_S) * count;
      if (k >= count - 1) {
        setAt(count - 1);
        setPlaying(false);
        return;
      }
      setAt(Math.floor(k));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, count]);
  const play = () => {
    if (reduced) return;
    from.current = at === null || at >= count - 1 ? 0 : at;
    setPlaying(true);
  };
  const pause = () => setPlaying(false);
  return { reduced, playing, at: reduced ? count - 1 : at, play, pause, toggle: () => (playing ? pause() : play()), done: at === count - 1 };
}

/** The drawing's root: plays while the pointer is on it, and holds its line of what to notice and its button. */
function Drawing({ notice, children, player }: { notice: string; children: ReactNode; player: ReturnType<typeof usePlay> }) {
  return (
    <figure className="m-0" onPointerEnter={(e) => e.pointerType === 'mouse' && player.play()} onPointerLeave={(e) => e.pointerType === 'mouse' && player.pause()}>
      {children}
      <figcaption className="mt-3 flex items-start justify-between gap-3">
        <span className="text-[15px] leading-snug text-ink-2">{notice}</span>
        {!player.reduced && (
          <button type="button" aria-pressed={player.playing} onClick={player.toggle} className="btn btn-sm h-9 shrink-0 px-3 text-[14px]">
            {player.playing ? 'Pause' : player.done ? 'Play again' : 'Play the month'}
          </button>
        )}
      </figcaption>
    </figure>
  );
}

/** The marker of a played drawing and its date: the body in view, or a hollow ring where the hills hide it. */
function Marker({ f, tone }: { f: Frame; tone: 'sun' | 'earth' }) {
  const fill = tone === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  return (
    <g data-marker="" data-shown={f.shown ? '1' : '0'}>
      <circle cx={f.x} cy={f.y} r="7" fill={f.shown ? fill : 'none'} stroke={fill} strokeWidth="2" strokeDasharray={f.shown ? undefined : '3 3'} style={f.shown ? { filter: `drop-shadow(0 0 5px ${tone === 'sun' ? 'rgba(243,239,228,0.9)' : 'rgba(127,169,255,0.9)'})` } : undefined} />
    </g>
  );
}

/** The date of the stop a played drawing shows, at its top right. */
function DateTag({ f, view }: { f: Frame | null; view: { w: number; h: number } }) {
  if (!f) return null;
  return (
    <Label at={[view.w - 14, 22]} view={view} align="right" chip className="font-semibold">
      {f.date}
    </Label>
  );
}

/** The Sun's path over the month at the site: once round the horizon, never above 2.5°; a mid-latitude Sun for contrast. */
export function SunNeverClimbs({ d }: { d: SunDrawing }) {
  const player = usePlay(d.frames.length);
  const f = player.at === null ? null : d.frames[player.at];
  const c = d.chart, view = { w: d.w, h: d.h };
  return (
    <Drawing notice={d.notice} player={player}>
      <Picture
        w={d.w}
        h={d.h}
        alt={d.alt}
        labels={
          <>
            <Label at={[14, 22]} view={view}>
              The Sun&apos;s path over one month
            </Label>
            <DateTag f={f} view={view} />
            <AxisLabels view={view} x0={c.x0} y1={c.y1} xTicks={d.xTicks} yTicks={d.yTicks} xTitle="direction from the site" />
            <Label at={[c.x0 + 4, d.horizonY + 10]} view={view} soft size={14}>
              horizon
            </Label>
            <Label at={[Math.min(d.highest.x + 8, d.w - 10), d.highest.y - 17]} view={view} chip align={d.highest.x > d.w * 0.6 ? 'right' : 'center'} size={14}>
              {`highest ${d.highest.el.toFixed(1)}°, ${d.highest.date}`}
            </Label>
            {d.days
              .filter((p) => p.label)
              .map((p) => (
                <Label key={p.label} at={[p.x, p.y + 15]} view={view} soft align="center" size={14}>
                  {p.label}
                </Label>
              ))}
            <Label at={[d.contrast.x + 6, c.y0 + 8]} view={view} soft chip size={14}>
              {`${d.contrast.site}, ${d.contrast.lat}°: up to about ${d.contrast.peak}° ↑`}
            </Label>
          </>
        }
      >
        <Axes x0={c.x0} x1={c.x1} y1={c.y1} xTicks={d.xTicks} yTicks={d.yTicks} />
        <path d={d.ground} fill="var(--hill)" fillOpacity="0.55" />
        <line x1={c.x0} x2={c.x1} y1={d.horizonY} y2={d.horizonY} stroke="var(--stage-ink-2)" strokeWidth="1.2" />
        {/* A Sun of middle latitudes, for contrast: up out of the chart in the east, down in the west. */}
        <path d={d.contrast.path} fill="none" stroke="var(--stage-ink-2)" strokeOpacity="0.6" strokeWidth="1.4" strokeDasharray="4 4" />
        <path d={d.path} fill="none" stroke="var(--stage-sun)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {d.days.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.label ? 3.2 : 2} fill="var(--stage-sun)" fillOpacity={p.label ? 1 : 0.7} />
        ))}
        <circle cx={d.highest.x} cy={d.highest.y} r="4.5" fill="none" stroke="var(--stage-sun)" strokeWidth="1.5" />
        {f && <Marker f={f} tone="sun" />}
      </Picture>
    </Drawing>
  );
}

/** Two real skylines 12 km apart, with the same Sun against each: the hills hide it from one for weeks, never from the summit. */
export function HillsDecide({ d }: { d: HillsDrawing }) {
  const player = usePlay(d.panels[0].frames.length);
  const view = { w: d.w, h: d.h };
  return (
    <Drawing notice={d.notice} player={player}>
      <Picture
        w={d.w}
        h={d.h}
        alt={d.alt}
        labels={
          <>
            <Label at={[14, 22]} view={view}>{`The same month, ${d.km} km apart`}</Label>
            <DateTag f={player.at === null ? null : d.panels[0].frames[player.at]} view={view} />
            {d.panels.map((p, i) => (
              <span key={p.name}>
                <Label at={[p.chart.x0, p.chart.y0 - 12]} view={view} className="font-semibold" size={14}>
                  {`${p.name}: ${p.summary}`}
                </Label>
                <AxisLabels view={view} x0={p.chart.x0} y1={p.chart.y1} xTicks={i === 1 ? d.xTicks : d.xTicks} yTicks={p.yTicks} xTitle={i === 1 ? 'direction from the site' : undefined} />
                {p.hidden && p.hidden.x1 > p.hidden.x0 && (
                  <Label at={[(p.hidden.x0 + p.hidden.x1) / 2, p.chart.y0 + 14]} view={view} chip align="center" size={14}>
                    {`Sun set behind the hills, ${p.hidden.when}`}
                  </Label>
                )}
              </span>
            ))}
          </>
        }
      >
        {d.panels.map((p, i) => {
          const f = player.at === null ? null : p.frames[Math.min(player.at, p.frames.length - 1)];
          return (
            <g key={p.name} data-panel={i === 0 ? 'site' : 'summit'}>
              <Axes x0={p.chart.x0} x1={p.chart.x1} y1={p.chart.y1} xTicks={d.xTicks} yTicks={p.yTicks} />
              <path d={p.ground} fill="var(--hill)" />
              {/* The hours the hills hide the Sun: the directions it crosses meanwhile, shaded, and its path behind them dotted. */}
              {p.hidden && p.hidden.x1 > p.hidden.x0 && <rect data-hidden="" x={p.hidden.x0} y={p.chart.y0} width={p.hidden.x1 - p.hidden.x0} height={p.chart.y1 - p.chart.y0} fill="#ff8a80" fillOpacity="0.16" />}
              <path d={p.track.hidden} fill="none" stroke="var(--stage-sun)" strokeOpacity="0.7" strokeWidth="1.8" strokeDasharray="2 4" />
              <path d={p.track.shown} fill="none" stroke="var(--stage-sun)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              {f && <Marker f={f} tone="sun" />}
            </g>
          );
        })}
      </Picture>
    </Drawing>
  );
}

/** Earth over the month: one direction, a small loop up and down, in view only while it stands above the hills. */
export function EarthSetsToo({ d }: { d: EarthDrawing }) {
  const player = usePlay(d.frames.length);
  const f = player.at === null ? null : d.frames[player.at];
  const c = d.chart, view = { w: d.w, h: d.h };
  const above = yOfEl(c, 9.6), below = yOfEl(c, -8.8);
  return (
    <Drawing notice={d.notice} player={player}>
      <Picture
        w={d.w}
        h={d.h}
        alt={d.alt}
        labels={
          <>
            <Label at={[14, 22]} view={view}>
              Earth stays in one direction
            </Label>
            <DateTag f={f} view={view} />
            <AxisLabels view={view} x0={c.x0} y1={c.y1} xTicks={d.xTicks} yTicks={d.yTicks} xTitle="direction from north" />
            <Label at={[c.x0 + 4, above]} view={view} chip size={14} className="text-stage-earth">
              {`Earth in view: ${d.inViewPct} of the month`}
            </Label>
            <Label at={[c.x1 - 4, below]} view={view} chip soft align="right" size={14}>
              Earth set behind the hills
            </Label>
            <Label at={[c.x0 + 4, yOfEl(c, 0) + 10]} view={view} soft size={14}>
              hills
            </Label>
          </>
        }
      >
        <Axes x0={c.x0} x1={c.x1} y1={c.y1} xTicks={d.xTicks} yTicks={d.yTicks} />
        <path d={d.ground} fill="var(--hill)" />
        <path d={d.track.hidden} fill="none" stroke="var(--stage-earth)" strokeOpacity="0.75" strokeWidth="1.8" strokeDasharray="2 4" />
        <path d={d.track.shown} fill="none" stroke="var(--stage-earth)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {d.days.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--stage-earth)" fillOpacity="0.8" />
        ))}
        {f && <Marker f={f} tone="earth" />}
      </Picture>
    </Drawing>
  );
}

const yOfEl = (c: EarthDrawing['chart'], el: number) => c.y1 - ((el - c.el0) / (c.el1 - c.el0)) * (c.y1 - c.y0);
