'use client';
import { useEffect, useRef } from 'react';
import { LabelGuard } from '@/components/LabelGuard';
import type { ShadowPicture } from '@/lib/engine/shadow-handler';
import { sunBearingDeg } from '@/lib/engine/shadow';
import { useElementWidth } from '@/lib/hooks/useElementWidth';
import { arrowEnd, arrowPlate, heightWords, scaleBarKm, siteNameBox } from '@/lib/viz/shadowmap';

/** The map's side before it is measured. */
const DEFAULT_PX = 560;
/** The scale bar's plate: its padding and height in pixels. */
const SCALE_PAD_PX = 16;
const SCALE_H_PX = 34;

/**
 * The ground around the site from above, with the shadows of the hour: the shadow sweep's grey
 * picture of the finest terrain level, the site's pin, a scale bar and arrows from the site towards
 * the Sun and towards Earth. Map-up is the direction of longitude 0, as on the relief map. It fills
 * the height of its box as a square.
 */
export function ShadowMap({
  picture,
  widthKm,
  siteName,
  lon,
  sunAz,
  sunEl,
  earthAz,
  earthEl,
  when,
}: {
  picture: ShadowPicture | null;
  widthKm: number;
  siteName: string;
  lon: number;
  sunAz: number;
  sunEl: number;
  earthAz: number;
  earthEl: number;
  when: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { ref: measure, width: sizePx } = useElementWidth<HTMLDivElement>(DEFAULT_PX);

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

  const sun = arrowEnd(sunBearingDeg(lon, sunAz), 100);
  const earth = arrowEnd(sunBearingDeg(lon, earthAz), 100);
  const km = scaleBarKm(widthKm);
  const sunWords = heightWords('Sun', sunEl);
  const earthWords = heightWords('Earth', earthEl);
  const sunPlate = arrowPlate(sun, sunWords, sizePx);
  const earthPlate = arrowPlate(earth, earthWords, sizePx);
  const scaleBox = { x: 0.04, y: 0.96 - SCALE_H_PX / sizePx, w: km / widthKm + SCALE_PAD_PX / sizePx, h: SCALE_H_PX / sizePx };
  const name = siteNameBox(siteName, [sunPlate.box, earthPlate.box, scaleBox], sizePx);
  const said = picture ? (picture.siteLit ? '. The site is in sunlight.' : '. The site is in shadow.') : ': being worked out.';
  return (
    <LabelGuard role="img" aria-label={`Shadows at ${when}${said}`} className="relative aspect-square h-full overflow-hidden bg-stage">
      <canvas ref={canvas} aria-hidden="true" className={`absolute inset-0 h-full w-full ${picture ? '' : 'invisible'}`} />
      <div ref={measure} aria-hidden="true" className="pointer-events-none absolute inset-0" />
      {!picture && (
        <p aria-hidden="true" className="absolute inset-x-0 top-[30%] text-center text-[15px] text-stage-ink">
          Working out the shadows…
        </p>
      )}
      <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
        <line data-arrow="earth" x1={50} y1={50} x2={earth.x} y2={earth.y} stroke="var(--stage-earth)" strokeWidth={0.8} strokeDasharray={earthEl < 0 ? '1.5 1.5' : undefined} vectorEffect="non-scaling-stroke" />
        <line data-arrow="sun" x1={50} y1={50} x2={sun.x} y2={sun.y} stroke="var(--stage-sun)" strokeWidth={0.8} strokeDasharray={sunEl < 0 ? '1.5 1.5' : undefined} vectorEffect="non-scaling-stroke" />
        <circle cx={50} cy={50} r={1.4} fill="var(--stage-sun)" stroke="var(--stage)" strokeWidth={0.6} />
      </svg>
      {/* Words sit on plates: each arrow's words at its far end, the site's name beside its pin clear of them. Where two still overlap the less important gives way. */}
      <span data-label="" data-priority={0} className={`${PLATE} text-stage-ink`} style={{ left: `${name.x * 100}%`, top: `${name.y * 100}%` }}>
        {siteName}
      </span>
      <Plate plate={sunPlate} priority={1} className="text-stage-sun">
        {sunWords}
      </Plate>
      <Plate plate={earthPlate} priority={2} className="text-stage-earth">
        {earthWords}
      </Plate>
      <div data-label="" data-priority={3} className="pointer-events-none absolute bottom-[4%] left-[4%] box-content rounded-[5px] bg-stage/85 px-2 pb-2 pt-0.5 text-[15px] font-medium leading-snug text-stage-ink" style={{ width: `${(km / widthKm) * 100}%` }}>
        {km < 1 ? `${km * 1000} m` : `${km} km`}
        <span className="mt-1 block h-[3px] w-full bg-stage-ink" />
      </div>
    </LabelGuard>
  );
}

const PLATE = 'pointer-events-none absolute whitespace-nowrap rounded-[5px] bg-stage/85 px-2 py-0.5 text-[15px] font-semibold';

/** The words at an arrow's end, placed as `arrowPlate` says. */
function Plate({ plate, priority, className, children }: { plate: ReturnType<typeof arrowPlate>; priority: number; className: string; children: string }) {
  return (
    <span data-label="" data-priority={priority} className={`${PLATE} ${className}`} style={{ left: `${plate.left}%`, top: `${plate.top}%`, transform: `translate(${plate.across}, -50%)` }}>
      {children}
    </span>
  );
}
