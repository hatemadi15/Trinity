'use client';
import { useEffect, useRef, useState } from 'react';
import type { Level } from '@/lib/engine/shadow';
import type { ShadowPicture } from '@/lib/engine/shadow-handler';
import { ShadowClient } from '@/lib/shadow-client';
import { sunBearingDeg } from '@/lib/engine/shadow';
import { arrowEnd, heightWords, scaleBarKm } from '@/lib/viz/shadowmap';

/** What the map needs of the shadow worker's client (a stub in tests). */
export interface ShadowSource {
  setLevels: (key: string, levels: Level[]) => Promise<void>;
  picture: (key: string, bearingDeg: number, elDeg: number, half: boolean) => Promise<ShadowPicture | null>;
}

/** A full-resolution picture is asked for once the hour has rested this long. */
const REST_MS = 250;

let shared: ShadowClient | null = null;
const defaultClient = (): ShadowSource => (shared ??= new ShadowClient());

/**
 * The ground around the site from above, with the shadows of the hour: the finest terrain level drawn
 * in grey by the shadow sweep (a quick half-resolution picture while the hour moves, the full one when
 * it rests), the site's pin, a scale bar and arrows from the site towards the Sun and towards Earth.
 * Map-up is the direction of longitude 0, as on the relief map.
 */
export function ShadowMap({
  levels,
  levelsKey,
  widthKm,
  siteName,
  lon,
  sunAz,
  sunEl,
  earthAz,
  earthEl,
  when,
  client,
}: {
  levels: Level[];
  levelsKey: string;
  widthKm: number;
  siteName: string;
  lon: number;
  sunAz: number;
  sunEl: number;
  earthAz: number;
  earthEl: number;
  when: string;
  client?: ShadowSource;
}) {
  const source = useRef<ShadowSource | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [picture, setPicture] = useState<ShadowPicture | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const sunBearing = sunBearingDeg(lon, sunAz);
  const earthBearing = sunBearingDeg(lon, earthAz);

  // Hand the levels to the worker once per site.
  useEffect(() => {
    source.current = client ?? defaultClient();
    let live = true;
    void source.current.setLevels(levelsKey, levels).then(() => {
      if (live) setReady(levelsKey);
    });
    return () => {
      live = false;
    };
  }, [client, levelsKey, levels]);

  // A quick picture for every hour, the full one once the hour rests.
  useEffect(() => {
    if (ready !== levelsKey || !source.current) return;
    const src = source.current;
    let live = true;
    const show = (p: ShadowPicture | null) => {
      if (live && p) setPicture(p);
    };
    void src.picture(levelsKey, sunBearing, sunEl, true).then(show);
    const full = window.setTimeout(() => void src.picture(levelsKey, sunBearing, sunEl, false).then(show), REST_MS);
    return () => {
      live = false;
      window.clearTimeout(full);
    };
  }, [ready, levelsKey, sunBearing, sunEl]);

  // Paint the grey picture.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !picture) return;
    el.width = picture.width;
    el.height = picture.height;
    const ctx = el.getContext?.('2d');
    if (!ctx) return;
    const image = ctx.createImageData(picture.width, picture.height);
    for (let i = 0; i < picture.pixels.length; i++) {
      const v = picture.pixels[i];
      image.data[4 * i] = v;
      image.data[4 * i + 1] = v;
      image.data[4 * i + 2] = v;
      image.data[4 * i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, [picture]);

  const sun = arrowEnd(sunBearing, 100);
  const earth = arrowEnd(earthBearing, 100);
  const km = scaleBarKm(widthKm);
  const said = picture ? (picture.siteLit ? ' The site is in sunlight.' : ' The site is in shadow.') : '';
  return (
    <div role="img" aria-label={`Shadows at ${when}.${said}`} className="stage relative aspect-square overflow-hidden">
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
        <line data-arrow="earth" x1={50} y1={50} x2={earth.x} y2={earth.y} stroke="var(--stage-earth)" strokeWidth={0.8} strokeDasharray={earthEl < 0 ? '1.5 1.5' : undefined} vectorEffect="non-scaling-stroke" />
        <line data-arrow="sun" x1={50} y1={50} x2={sun.x} y2={sun.y} stroke="var(--stage-sun)" strokeWidth={0.8} strokeDasharray={sunEl < 0 ? '1.5 1.5' : undefined} vectorEffect="non-scaling-stroke" />
        <circle cx={50} cy={50} r={1.4} fill="var(--stage-sun)" stroke="var(--stage)" strokeWidth={0.6} />
      </svg>
      {/* Words sit on plates; each arrow's words at its far end, the site's name under its pin. */}
      <Plate x={sun.x} y={sun.y} className="text-stage-sun">
        {heightWords('Sun', sunEl)}
      </Plate>
      <Plate x={earth.x} y={earth.y} className="text-stage-earth">
        {heightWords('Earth', earthEl)}
      </Plate>
      <Plate x={50} y={56} className="text-stage-ink">
        {siteName}
      </Plate>
      <div className="pointer-events-none absolute bottom-[4%] left-[4%] box-content rounded-[5px] bg-stage/85 px-2 pb-2 pt-0.5 text-[15px] font-medium leading-snug text-stage-ink" style={{ width: `${(km / widthKm) * 100}%` }}>
        {km < 1 ? `${km * 1000} m` : `${km} km`}
        <span className="mt-1 block h-[3px] w-full bg-stage-ink" />
      </div>
    </div>
  );
}

/** A word plate centred on a point given in percent of the map, kept inside it. */
function Plate({ x, y, className, children }: { x: number; y: number; className: string; children: string }) {
  return (
    <span
      className={`pointer-events-none absolute whitespace-nowrap rounded-[5px] bg-stage/85 px-2 py-0.5 text-[15px] font-semibold ${className}`}
      style={{ left: `${Math.min(88, Math.max(12, x))}%`, top: `${Math.min(92, Math.max(4, y))}%`, transform: 'translate(-50%, -50%)' }}
    >
      {children}
    </span>
  );
}
