'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HOME } from '@/lib/data/home';
import { placeMapLabels, type Placement } from '@/lib/viz/maplabels';

export interface MapPin {
  id: string;
  /** Position on the picture as fractions of its width and height, from the top left. */
  u: number;
  v: number;
  label: string;
  href: string;
  /** Green for a site with two weeks or more of power. */
  tone: 'good' | 'plain';
}

/** The map's width before it is measured, close to its width on a laptop. */
const DEFAULT_PX = 440;
const SCALE_KM = 100;
/** Half the side of a pin's link: the label and its line are drawn from the link's top left corner. */
const HALF_PIN = 14;

/**
 * The relief picture of the south pole with one pin per site and a 100 km scale.
 * Each pin is a link named after its site. With `nameAll` the names are written on the map wherever
 * they fit, the first pins first; any other name shows for the pin under the pointer, the pin with
 * keyboard focus, the active pin (the row under the pointer) and the selected site.
 */
export function ReliefMap({
  pins,
  activeId = null,
  selectedId = null,
  onActive,
  nameAll = false,
}: {
  pins: MapPin[];
  activeId?: string | null;
  selectedId?: string | null;
  onActive?: (id: string | null) => void;
  nameAll?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(DEFAULT_PX);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => setSize(Math.round(entry.contentRect.width) || DEFAULT_PX));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const scaleShare = SCALE_KM / (2 * HOME.relief.half_km);
  const named = useMemo(() => {
    if (!nameAll) return new Map<string, Placement>();
    // Names keep clear of the scale in the bottom left corner.
    const keepOut = [
      { x: 0.03, y: 0.96 - 40 / size, w: Math.max(scaleShare, 64 / size) + 0.03, h: 40 / size + 0.01 },
    ];
    return placeMapLabels(
      pins.map((p) => ({ id: p.id, u: p.u, v: p.v, text: p.label })),
      size,
      keepOut,
    );
  }, [nameAll, pins, size, scaleShare]);

  return (
    <div ref={box} className="stage relative aspect-square">
      <Image src={HOME.relief.image} alt="Relief map of the Moon's south pole, 500 km across, with the pole at the centre" fill sizes="(min-width: 1024px) 460px, 100vw" className="relief-picture object-cover" />
      <div
        data-part="scale"
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[4%] left-[4%] box-content rounded-[5px] bg-stage/85 px-2 pb-2 pt-0.5 text-[15px] font-medium leading-snug text-stage-ink"
        style={{ width: `${scaleShare * 100}%` }}
      >
        {SCALE_KM} km
        <span className="mt-1 block h-[3px] w-full bg-stage-ink" />
      </div>
      {pins.map((p) => {
        const selected = p.id === selectedId;
        const active = p.id === activeId;
        const shown = selected || active;
        const place = named.get(p.id);
        // A written name sits where it was placed, in pixels from the pin; any other name shows under its pin on demand.
        const dx = place ? (place.box.x - p.u) * size : 0;
        const dy = place ? (place.box.y - p.v) * size : 0;
        const near = place ? { x: Math.min(Math.max(0, dx), dx + place.box.w * size), y: Math.min(Math.max(0, dy), dy + place.box.h * size) } : null;
        const reach = near ? Math.hypot(near.x, near.y) : 0;
        return (
          <Link
            key={p.id}
            href={p.href}
            aria-label={p.label}
            aria-current={selected ? 'true' : undefined}
            data-active={active ? 'true' : undefined}
            onMouseEnter={() => onActive?.(p.id)}
            onMouseLeave={() => onActive?.(null)}
            onFocus={() => onActive?.(p.id)}
            onBlur={() => onActive?.(null)}
            className={`group absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full hover:z-20 focus-visible:z-20 ${shown ? 'z-10' : ''}`}
            style={{ left: `${+(p.u * 100).toFixed(2)}%`, top: `${+(p.v * 100).toFixed(2)}%` }}
          >
            <span
              className={`block rounded-full border-2 border-stage ${selected ? 'h-5 w-5 bg-stage-sun' : shown ? 'h-4 w-4' : 'h-3 w-3 group-hover:h-4 group-hover:w-4'} ${
                selected ? '' : p.tone === 'good' ? 'bg-[#46c98b]' : 'bg-stage-ink'
              }`}
            />
            {place?.leader && near && reach > 0 && (
              <svg aria-hidden="true" width={2 * HALF_PIN} height={2 * HALF_PIN} className="pointer-events-none absolute left-0 top-0 overflow-visible">
                {[
                  ['var(--stage)', 3.5],
                  ['var(--stage-ink)', 1.5],
                ].map(([stroke, width]) => (
                  <line
                    key={stroke}
                    x1={HALF_PIN + (near.x / reach) * 7}
                    y1={HALF_PIN + (near.y / reach) * 7}
                    x2={HALF_PIN + near.x}
                    y2={HALF_PIN + near.y}
                    stroke={stroke as string}
                    strokeWidth={width as number}
                    strokeLinecap="round"
                  />
                ))}
              </svg>
            )}
            <span
              aria-hidden="true"
              data-side={place?.side ?? 'below'}
              className={`pointer-events-none absolute whitespace-nowrap rounded-[5px] bg-stage/85 px-2 py-0.5 text-[15px] font-medium text-stage-ink ${
                place ? '' : `top-full ${p.u > 0.72 ? 'right-0' : p.u < 0.28 ? 'left-0' : 'left-1/2 -translate-x-1/2'}`
              } ${shown || place ? '' : 'hidden group-hover:block group-focus-visible:block'}`}
              style={place ? { left: HALF_PIN + dx, top: HALF_PIN + dy } : undefined}
            >
              {p.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
