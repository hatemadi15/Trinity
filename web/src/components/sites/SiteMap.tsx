'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { HOME } from '@/lib/data/home';
import { layoutSiteMap, onInset, onRelief, spreadMarkers, INSET_CAPTION_PX, type Spot } from '@/lib/viz/sitemap';

export type MarkerGroup = 'artemis' | 'lander' | 'other';

export interface SiteMarker {
  id: string;
  /** The site's full name: the marker's accessible name and the card's title. */
  label: string;
  group: MarkerGroup;
  href: string;
  /** On the relief picture of the south pole (fractions from its top left), or anywhere else on the Moon. */
  at: { u: number; v: number } | { lat: number; lon: number };
  /** What kind of point it is, then its figures for the chosen dates: the card's lines. */
  kind: string;
  facts: string[];
  /** A warning about the figures (incomplete terrain). */
  warn?: string | null;
}

/** The three groups, in the key's order, with the words the key and the list use. */
export const MARKER_GROUPS: { group: MarkerGroup; name: string }[] = [
  { group: 'artemis', name: 'NASA’s Artemis shortlist' },
  { group: 'lander', name: 'Landers, flown or planned' },
  { group: 'other', name: 'High points and crater floors' },
];

/** The box before it is measured, and in tests: a laptop's window under the header and over the bar. */
const DEFAULT_BOX = { w: 1440, h: 760 };
/** From this width the map is the window; under it the relief square stands over the inset. */
const FILL_FROM_PX = 1024;
/** No two markers nearer than this: room for a pointer on a wide screen, for a finger on a narrow one. */
const GAP_PX = { fill: 24, stack: 30 };
const CARD_W = 290;

/** A group's mark: a shape as well as a colour, so the key never rests on colour alone. */
export function GroupMark({ group, className = '' }: { group: MarkerGroup; className?: string }) {
  const shape =
    group === 'artemis'
      ? 'rounded-full bg-stage-earth'
      : group === 'lander'
        ? 'rotate-45 rounded-[2px] bg-stage-sun'
        : 'rounded-full border-[3px] border-stage-ink bg-stage';
  return <span data-mark={group} className={`block h-3.5 w-3.5 shrink-0 shadow-[0_0_0_2px_#000] ${shape} ${className}`} />;
}

/**
 * The map that is the "Choose a site" page: the south pole's relief as wide as the window, the whole Moon in an
 * inset for the sites far from the pole, and one marker per site. A marker is a link named after its site. Its name
 * and figures show in a card while the pointer or the keyboard focus is on it, and every other marker greys out.
 * A finger's first tap shows the card and the second, on the card or the marker, opens the site.
 */
export function SiteMap({ markers, ranked }: { markers: SiteMarker[]; /** The planner's ranked sites, best first: their markers stand out, numbered, and the others grey out. */ ranked?: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const cardId = useId();
  const [size, setSize] = useState<{ w: number; h: number; fill: boolean } | null>(null);
  // The marker under the pointer or with the focus, and the one a finger tapped: the first wins while it lasts.
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  /** The marker a finger went down on, and whether its card was already up. */
  const tap = useRef<{ id: string; shown: boolean } | null>(null);
  const activeId = hover ?? pinned;
  const place = (id: string) => (ranked ? ranked.indexOf(id) : -1);
  /** A marker greys out beside the one pointed at; with none pointed at, beside the planner's ranked ones. */
  const dimmed = (id: string) => (activeId !== null ? activeId !== id : ranked !== undefined && ranked.length > 0 && place(id) < 0);

  useEffect(() => {
    const el = box.current;
    const wide = typeof window.matchMedia === 'function' ? window.matchMedia(`(min-width: ${FILL_FROM_PX}px)`) : null;
    const measure = () => {
      const r = el?.getBoundingClientRect();
      setSize({ w: Math.round(r?.width || DEFAULT_BOX.w), h: Math.round(r?.height || DEFAULT_BOX.h), fill: wide ? wide.matches : true });
    };
    measure();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pinned]);

  const layout = useMemo(() => (size ? layoutSiteMap(size.w, size.h, size.fill ? 'fill' : 'stack') : null), [size]);
  const placed = useMemo(() => {
    if (!layout) return [];
    const whole = { x: 0, y: 0, w: layout.width, h: layout.mode === 'fill' ? layout.height : layout.relief.h };
    const spots: (Spot & { marker: SiteMarker })[] = markers.map((m) => {
      const polar = 'u' in m.at;
      const p = 'u' in m.at ? onRelief(layout, m.at.u, m.at.v) : onInset(layout, m.at.lat, m.at.lon);
      return { id: m.id, x: p.x, y: p.y, within: polar ? whole : layout.inset, marker: m };
    });
    const moved = spreadMarkers(spots, GAP_PX[layout.mode]);
    return spots.map((s) => ({ marker: s.marker, true: { x: s.x, y: s.y }, at: moved.get(s.id)! }));
  }, [layout, markers]);
  const active = placed.find((p) => p.marker.id === activeId) ?? null;

  const cardStyle = (() => {
    if (!active || !layout) return undefined;
    const w = Math.min(CARD_W, layout.width - 16);
    const left = Math.min(layout.width - w - 8, Math.max(8, active.at.x - w / 2));
    // Under the marker near the top of the box, over it lower down: the card never leaves the box, nor hides under the bar.
    const below = layout.mode === 'fill' ? active.at.y < layout.height * 0.52 : active.at.y < 180;
    return below ? { left, top: active.at.y + 22, width: w } : { left, bottom: layout.height - active.at.y + 22, width: w };
  })();
  const cardBody = active && (
    <>
      <b className="block text-[17px] font-semibold leading-snug text-stage-ink">{active.marker.label}</b>
      <span className="mt-0.5 block text-stage-ink-2">{active.marker.kind}</span>
      {active.marker.warn && <span className="mt-0.5 block font-medium text-[#f0b860]">{active.marker.warn}</span>}
      {active.marker.facts.map((line) => (
        <span key={line} className="mt-1 block text-stage-ink">
          {line}
        </span>
      ))}
    </>
  );
  // A pane of dark glass (globals.css, .pane) in the stage's black, so the map shows through it.
  const CARD = 'pane pane-stage absolute z-30 rounded-lg px-3.5 py-2.5 text-[15px] leading-snug';

  return (
    <div
      ref={box}
      data-part="map"
      data-mode={layout?.mode}
      className="relative w-full overflow-hidden lg:absolute lg:inset-0"
      style={layout?.mode === 'stack' ? { height: layout.height } : undefined}
      // A tap on the map itself puts a tapped card away.
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        setPinned(null);
        if (e.pointerType === 'touch' || e.pointerType === 'pen') setHover(null);
      }}
    >
      {layout && (
        <>
          <div className="absolute" style={{ left: layout.relief.x, top: layout.relief.y, width: layout.relief.w, height: layout.relief.h }}>
            <Image src={HOME.relief.image} alt="Relief map of the Moon's south pole, 500 km across, with the pole at the centre" fill sizes="100vw" priority className="relief-picture object-cover" />
          </div>
          {/* The picture darkens toward its edges, so the inset reads over it; the title has its own pane of glass. */}
          {layout.mode === 'fill' && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgb(0_0_0/0.72)_100%)]"
            />
          )}
          <p
            aria-hidden="true"
            className={`pointer-events-none absolute text-[15px] font-medium text-stage-ink-2`}
            style={{ left: layout.inset.x, top: layout.inset.y - INSET_CAPTION_PX }}
          >
            The rest of the Moon
          </p>
          <div
            data-part="inset"
            className="absolute overflow-hidden rounded-md border border-white/25 bg-stage shadow-[0_0_0_1px_rgba(127,169,255,0.1),0_0_40px_-12px_rgba(127,169,255,0.5),0_18px_44px_-18px_#000]"
            style={{ left: layout.inset.x, top: layout.inset.y, width: layout.inset.w, height: layout.inset.h }}
          >
            <Image src="/maps/moon-whole.jpg" alt="Map of the whole Moon, with the side that faces Earth at the centre" fill sizes="(min-width: 1024px) 440px, 100vw" className="object-cover brightness-[0.6]" />
          </div>
          {/* A marker that was moved keeps a line to where its site is. */}
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
            {placed.map((p) => {
              const far = Math.hypot(p.at.x - p.true.x, p.at.y - p.true.y);
              if (far < 5) return null;
              const dim = dimmed(p.marker.id);
              return (
                <g key={p.marker.id} opacity={dim ? 0.3 : 1} className="transition-opacity duration-200">
                  <line x1={p.true.x} y1={p.true.y} x2={p.at.x} y2={p.at.y} stroke="var(--stage)" strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round" />
                  <line x1={p.true.x} y1={p.true.y} x2={p.at.x} y2={p.at.y} stroke="var(--stage-ink)" strokeOpacity={0.8} strokeWidth={1} strokeLinecap="round" />
                  <circle cx={p.true.x} cy={p.true.y} r={2} fill="var(--stage-ink)" stroke="var(--stage)" strokeWidth={1} />
                </g>
              );
            })}
          </svg>
          {placed.map((p) => {
            const m = p.marker;
            const isActive = m.id === activeId;
            const dim = dimmed(m.id);
            const nth = place(m.id);
            return (
              <Link
                key={m.id}
                href={m.href}
                aria-label={nth >= 0 ? `${m.label}, number ${nth + 1} in the plan` : m.label}
                aria-describedby={isActive && pinned !== m.id ? cardId : undefined}
                data-marker={m.id}
                data-group={m.group}
                data-on={'u' in m.at ? 'relief' : 'inset'}
                data-active={isActive ? 'true' : undefined}
                data-dim={dim ? 'true' : undefined}
                data-ranked={nth >= 0 ? nth + 1 : undefined}
                onMouseEnter={() => setHover(m.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(m.id)}
                onBlur={() => setHover(null)}
                onPointerDown={(e) => {
                  tap.current = e.pointerType === 'touch' || e.pointerType === 'pen' ? { id: m.id, shown: activeId === m.id } : null;
                }}
                onClick={(e) => {
                  const t = tap.current;
                  tap.current = null;
                  // A finger's first tap names the site; the next one, here or on the card, opens it.
                  if (t && t.id === m.id && !t.shown) {
                    e.preventDefault();
                    setPinned(m.id);
                  }
                }}
                className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-[opacity,filter] duration-200 ${isActive ? 'z-20' : nth >= 0 ? 'z-[15]' : 'z-10'} ${nth >= 0 ? 'ring-2 ring-stage-ink ring-offset-2 ring-offset-black/60' : ''} ${dim ? 'opacity-45 grayscale' : ''}`}
                style={{ left: p.at.x, top: p.at.y }}
              >
                <GroupMark group={m.group} className={`transition-transform duration-200 ${isActive ? 'scale-[1.45]' : ''}`} />
                {nth >= 0 && (
                  <span aria-hidden="true" className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-stage-ink px-1 text-[13px] font-bold leading-none text-stage">
                    {nth + 1}
                  </span>
                )}
              </Link>
            );
          })}
          {active &&
            (pinned === active.marker.id ? (
              // After a tap the card is the way in: a link of its own.
              <Link href={active.marker.href} data-part="card" aria-label={`Open ${active.marker.label}`} className={`${CARD} block`} style={cardStyle}>
                {cardBody}
                <span className="mt-1.5 block font-semibold text-stage-earth">Open this site →</span>
              </Link>
            ) : (
              <div id={cardId} data-part="card" role="tooltip" className={`${CARD} pointer-events-none`} style={cardStyle}>
                {cardBody}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
