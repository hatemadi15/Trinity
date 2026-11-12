'use client';
import { useEffect, useRef } from 'react';
import { dataBase, fetchBytes } from '@/lib/data/loaders';
import { bandStars } from '@/lib/sky/starBand';
import { parseStars, type Stars } from '@/lib/sky/stars';

/** How far the band runs past the marked title, in pixels, kept 4 px short of the next block. */
const BAND_PAD_PX = 24;

/**
 * How tall the band is, in pixels from the frame's top: to just past the element marked `data-band-end` (the
 * page's title, or Explore's period band), stopping 4 px short of the running text after it; with no mark, to the
 * header's foot.
 */
export function bandHeight(frame: HTMLElement): number {
  const top = frame.getBoundingClientRect().top;
  const end = frame.querySelector<HTMLElement>('[data-band-end]');
  if (!end) {
    const header = frame.querySelector('header');
    return header ? Math.round(header.getBoundingClientRect().bottom - top) : 0;
  }
  const box = end.getBoundingClientRect();
  const next = end.nextElementSibling?.getBoundingClientRect();
  const pad = next ? Math.max(0, Math.min(BAND_PAD_PX, next.top - box.bottom - 4)) : BAND_PAD_PX;
  return Math.round(box.bottom + pad - top);
}

let catalogue: Promise<Stars> | null = null;
/** The catalogue, fetched once for the page's life (the stand view loads the same file, from the cache); a failure is tried again on the next page. */
function loadStars(): Promise<Stars> {
  catalogue ??= fetchBytes(`${dataBase()}/sky/stars.bin`).then(
    (b) => parseStars(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, Math.floor(b.byteLength / 20)),
    (err: unknown) => {
      catalogue = null;
      throw err;
    },
  );
  return catalogue;
}

/**
 * Faint real stars behind the page's header band (spec 6): the site's header and the page's title, never the
 * running text under it. Drawn on a canvas, again whenever the page's size changes; the stylesheet shows it in
 * the dark theme only and never prints it. Without the catalogue, or a 2D canvas, there are no stars.
 */
export function StarBand() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, frame = canvas?.parentElement;
    if (!canvas || !frame) return;
    let stars: Stars | null = null, gone = false;
    const draw = () => {
      if (!stars || gone) return;
      const w = frame.clientWidth, h = bandHeight(frame), ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, w, h);
      for (const s of bandStars(stars, w, h)) {
        g.fillStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${s.alpha.toFixed(3)})`;
        g.beginPath();
        g.arc(w / 2 + s.x, h - s.y, s.r, 0, Math.PI * 2);
        g.fill();
      }
    };
    loadStars().then(
      (s) => {
        stars = s;
        draw();
      },
      () => {},
    );
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    watch?.observe(frame);
    return () => {
      gone = true;
      watch?.disconnect();
    };
  }, []);
  // Out of the page's flow by itself, not by the stylesheet alone: a page whose stylesheet failed to load would otherwise
  // take the canvas into its height, draw it again for the new size, taller, and grow until the tab runs out of memory.
  return <canvas ref={ref} aria-hidden="true" data-star-band="" className="star-band pointer-events-none absolute inset-x-0 top-0 w-full" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />;
}
