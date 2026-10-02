'use client';
import { useEffect, useRef } from 'react';
import { LabelGuard } from '@/components/LabelGuard';
import type { ShadowPicture } from '@/lib/engine/shadow-handler';
import { sunBearingDeg } from '@/lib/engine/shadow';
import { useElementWidth } from '@/lib/hooks/useElementWidth';
import { arrowEnd, arrowPlate, compassCorner, heightWords, scaleBarKm, siteNameBox, type Corner } from '@/lib/viz/shadowmap';

/** The map's side before it is measured. */
const DEFAULT_PX = 560;
/** The scale bar's plate: its padding and height in pixels. */
const SCALE_PAD_PX = 16;
const SCALE_H_PX = 34;
/** Below this side the arrows' words would cover too much of the map: the reading guide beside it names the arrows instead. */
const WORDS_MIN_PX = 360;
/** The compass: its side in pixels, and where it sits in each corner. */
const COMPASS_PX = 60;
const COMPASS_AT: Record<Corner, string> = { tl: 'left-[3%] top-[3%]', tr: 'right-[3%] top-[3%]', br: 'right-[3%] bottom-[3%]' };
const D2R = Math.PI / 180;

/**
 * The ground around the site from above, with the shadows of the hour: the shadow sweep's grey
 * picture of the finest terrain level, the site's pin, a scale bar, a compass for north at the site and
 * arrows from the site towards the Sun and towards Earth. Map-up is the direction of longitude 0, as on
 * the relief map, so north at the site points away from the pole. It fills the height of its box as a
 * square.
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

  const sunBearing = sunBearingDeg(lon, sunAz);
  const earthBearing = sunBearingDeg(lon, earthAz);
  const sun = arrowEnd(sunBearing, 100);
  const earth = arrowEnd(earthBearing, 100);
  const km = scaleBarKm(widthKm);
  const sunWords = heightWords('Sun', sunEl);
  const earthWords = heightWords('Earth', earthEl);
  const sunPlate = arrowPlate(sun, sunWords, sizePx);
  const earthPlate = arrowPlate(earth, earthWords, sizePx);
  const worded = sizePx >= WORDS_MIN_PX;
  const corner = compassCorner([sun, earth]);
  const c = COMPASS_PX / sizePx;
  const compassBox = { x: corner === 'tl' ? 0.03 : 0.97 - c, y: corner === 'br' ? 0.97 - c : 0.03, w: c, h: c };
  const scaleBox = { x: 0.04, y: 0.96 - SCALE_H_PX / sizePx, w: km / widthKm + SCALE_PAD_PX / sizePx, h: SCALE_H_PX / sizePx };
  const name = siteNameBox(siteName, [...(worded ? [sunPlate.box, earthPlate.box] : []), compassBox, scaleBox], sizePx);
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
        <ArrowLine name="earth" end={earth} bearing={earthBearing} color="var(--stage-earth)" dotted={earthEl < 0} />
        <ArrowLine name="sun" end={sun} bearing={sunBearing} color="var(--stage-sun)" dotted={sunEl < 0} />
        <circle cx={50} cy={50} r={1.4} fill="var(--stage-sun)" stroke="var(--stage)" strokeWidth={0.6} />
      </svg>
      {/* Words sit on plates: each arrow's words at its far end, the site's name beside its pin clear of them. Where two still overlap the less important gives way. */}
      <span data-label="" data-priority={0} className={`${PLATE} text-stage-ink`} style={{ left: `${name.x * 100}%`, top: `${name.y * 100}%` }}>
        {siteName}
      </span>
      <div data-label="" data-priority={1} aria-hidden="true" className={`pointer-events-none absolute rounded-full bg-stage/85 ${COMPASS_AT[corner]}`} style={{ width: COMPASS_PX, height: COMPASS_PX }}>
        <span className="absolute inset-[9px] rounded-full border border-stage-ink/40" />
        {(['N', 'E', 'S', 'W'] as const).map((letter, i) => {
          const b = (lon + 90 * i) * D2R;
          return (
            <span key={letter} data-compass={letter} className={`absolute -translate-x-1/2 -translate-y-1/2 text-[14px] leading-none ${letter === 'N' ? 'font-bold text-stage-ink' : 'text-stage-ink/80'}`} style={{ left: `${50 + 36 * Math.sin(b)}%`, top: `${50 - 36 * Math.cos(b)}%` }}>
              {letter}
            </span>
          );
        })}
      </div>
      {worded && (
        <>
          <Plate plate={sunPlate} priority={2} className="text-stage-sun">
            {sunWords}
          </Plate>
          <Plate plate={earthPlate} priority={3} className="text-stage-earth">
            {earthWords}
          </Plate>
        </>
      )}
      <div data-label="" data-priority={4} className="pointer-events-none absolute bottom-[4%] left-[4%] box-content rounded-[5px] bg-stage/85 px-2 pb-2 pt-0.5 text-[15px] font-medium leading-snug text-stage-ink" style={{ width: `${(km / widthKm) * 100}%` }}>
        {km < 1 ? `${km * 1000} m` : `${km} km`}
        <span className="mt-1 block h-[3px] w-full bg-stage-ink" />
      </div>
    </LabelGuard>
  );
}

const PLATE = 'pointer-events-none absolute whitespace-nowrap rounded-[5px] bg-stage/85 px-2 py-0.5 text-[15px] font-semibold';

/** A line from the pin towards a body with a head at its end (map units, 0 to 100); dotted while the body is below the horizon. */
function ArrowLine({ name, end, bearing, color, dotted }: { name: string; end: { x: number; y: number }; bearing: number; color: string; dotted: boolean }) {
  const dx = Math.sin(bearing * D2R);
  const dy = -Math.cos(bearing * D2R);
  const base = { x: end.x - 3.2 * dx, y: end.y - 3.2 * dy };
  const head = `${end.x},${end.y} ${base.x - 1.7 * dy},${base.y + 1.7 * dx} ${base.x + 1.7 * dy},${base.y - 1.7 * dx}`;
  return (
    <>
      <line data-arrow={name} x1={50} y1={50} x2={base.x} y2={base.y} stroke={color} strokeWidth={2.5} strokeDasharray={dotted ? '6 5' : undefined} vectorEffect="non-scaling-stroke" />
      <polygon data-arrowhead={name} points={head} fill={color} />
    </>
  );
}

/** The words at an arrow's end, placed as `arrowPlate` says. */
function Plate({ plate, priority, className, children }: { plate: ReturnType<typeof arrowPlate>; priority: number; className: string; children: string }) {
  return (
    <span data-label="" data-priority={priority} className={`${PLATE} ${className}`} style={{ left: `${plate.left}%`, top: `${plate.top}%`, transform: `translate(${plate.across}, -50%)` }}>
      {children}
    </span>
  );
}
