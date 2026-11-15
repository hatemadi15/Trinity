'use client';
import { useEffect, useRef } from 'react';
import { dataBase, fetchBytes } from '@/lib/data/loaders';
import { bandStars } from '@/lib/sky/starBand';
import { parseStars, type Stars } from '@/lib/sky/stars';

/** The sky is drawn in strips this tall, each a different stretch of the catalogue's low sky, so a long page never runs out of stars. */
const STRIP_PX = 1200;
const PX_PER_DEG = 16;

/**
 * The night sky behind "Choose a site" (15 November, owner review): the catalogue's real stars on the stage's black,
 * over the whole page under the header. Drawn once on a canvas and again when the page's size changes; nothing moves,
 * so there is nothing to stop under reduced motion. Without the catalogue, or a 2D canvas, the sky is plain black.
 */
export function SitesSky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, frame = canvas?.parentElement;
    if (!canvas || !frame) return;
    let stars: Stars | null = null, gone = false;
    const draw = () => {
      if (!stars || gone) return;
      const w = frame.clientWidth, h = frame.clientHeight, ratio = Math.min(2, window.devicePixelRatio || 1);
      if (!w || !h) return;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, w, h);
      for (let top = 0, k = 0; top < h; top += STRIP_PX, k++) {
        for (const s of bandStars(stars, w, STRIP_PX, PX_PER_DEG, 255 + 67 * k)) {
          // The header band fades its stars out toward its foot; here the sky runs on, so the fade is taken back out.
          const fade = Math.min(1, s.y / (STRIP_PX / 3));
          if (fade <= 0) continue;
          g.fillStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${Math.min(0.9, (s.alpha / fade) * 1.5).toFixed(3)})`;
          g.beginPath();
          g.arc(w / 2 + s.x, top + s.y, s.r, 0, Math.PI * 2);
          g.fill();
        }
      }
    };
    fetchBytes(`${dataBase()}/sky/stars.bin`).then(
      (b) => {
        stars = parseStars(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, Math.floor(b.byteLength / 20));
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
  // Out of the page's flow by itself, as the header's star band is: a page without its stylesheet must not grow with its canvas.
  return <canvas ref={ref} aria-hidden="true" data-part="sky" className="pointer-events-none absolute inset-0 h-full w-full print:hidden" style={{ position: 'absolute', inset: 0 }} />;
}
