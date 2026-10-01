'use client';
import Image from 'next/image';
import Link from 'next/link';
import { HOME } from '@/lib/data/home';

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

/**
 * The relief picture of the south pole with one pin per site. Each pin is a link named after its
 * site. The name is written on the map and shows for the pin under the pointer, the pin with keyboard
 * focus, the active pin (the row under the pointer) and the selected site.
 */
export function ReliefMap({
  pins,
  activeId = null,
  selectedId = null,
  onActive,
}: {
  pins: MapPin[];
  activeId?: string | null;
  selectedId?: string | null;
  onActive?: (id: string | null) => void;
}) {
  return (
    <div className="stage relative aspect-square">
      <Image src={HOME.relief.image} alt="Relief map of the Moon's south pole, 500 km across, with the pole at the centre" fill sizes="(min-width: 1024px) 460px, 100vw" className="object-cover" />
      {pins.map((p) => {
        const selected = p.id === selectedId;
        const active = p.id === activeId;
        const shown = selected || active;
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
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-full mt-0.5 whitespace-nowrap rounded-[5px] bg-stage/85 px-2 py-0.5 text-[15px] font-medium text-stage-ink ${p.u > 0.72 ? 'right-0' : p.u < 0.28 ? 'left-0' : 'left-1/2 -translate-x-1/2'} ${
                shown ? '' : 'hidden group-hover:block group-focus-visible:block'
              }`}
            >
              {p.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
