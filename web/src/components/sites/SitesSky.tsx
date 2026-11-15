'use client';
import { useEffect } from 'react';
import { dataBase, fetchBytes } from '@/lib/data/loaders';
import { bandStars } from '@/lib/sky/starBand';
import { parseStars, type Stars } from '@/lib/sky/stars';

/** The sky is drawn in strips this tall, each a different stretch of the catalogue's low sky, so a long page never runs out of stars. */
const STRIP_PX = 1100;
/** The catalogue's scale: fewer pixels to the degree than the header's band, so more of its stars fall on the page. */
const PX_PER_DEG = 11;
/** A star keeps this far from a line of words: more than the 18 px a section rises as it comes into view (Reveal), and its own glow. */
const CLEAR_PX = 26;
/** The canvas holds at most this many pixels, so a long page on a sharp screen costs no more memory than a short one. */
const MAX_PIXELS = 7e6;
/** The palette's own lights: white, the faint blue of Earth, the Sun's warm white. */
const TINTS: [number, number, number][] = [
  [245, 245, 243],
  [245, 245, 243],
  [168, 198, 255],
  [243, 239, 228],
];

/** The same numbers on every visit (mulberry32): the sky never changes between two looks at it. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The boxes of every line of words that stands on the sky itself, in the page's own pixels, each grown by `CLEAR_PX`
 * up and down. Words on a pane of glass, a panel or a picture are left out: the glass blurs what is behind them.
 */
function wordBoxes(): Box[] {
  const sx = window.scrollX, sy = window.scrollY;
  const out: Box[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walk.nextNode()) {
    const node = walk.currentNode;
    if (!node.textContent?.trim() || node.parentElement?.closest('.pane, .panel, .stage, [data-luna-dock], script, style')) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      out.push({ x0: r.left + sx - 6, y0: r.top + sy - CLEAR_PX, x1: r.right + sx + 6, y1: r.bottom + sy + CLEAR_PX });
    }
  }
  return out;
}

/** One star: a soft glow for the bright ones, then its point. */
function drawStar(g: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: readonly number[], alpha: number) {
  const c = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  if (r >= 1.5) {
    const halo = g.createRadialGradient(x, y, 0, x, y, r * 5);
    halo.addColorStop(0, `rgba(${c},${(alpha * 0.34).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, r * 5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = `rgba(${c},${alpha.toFixed(3)})`;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/**
 * The night sky behind "Choose a site" (15 November, owner review: it must read as space at once),
 * over the whole page: behind the header and the footer too. On the stage's black, a faint Milky Way crosses the page
 * (soft clouds of the accent's blue and the Sun's warm white, with a river of small stars along it), then a dust of
 * small stars, then the catalogue's real stars, the bright ones with a glow. Drawn once on one canvas at the back of
 * the page and again when the page's size changes; nothing moves, so there is nothing to stop under reduced motion.
 * No star is drawn under a line of words that stands on the sky itself, so those words keep their contrast. Without
 * the catalogue the clouds and the dust are still drawn; without a 2D canvas the sky is plain black. Never printed.
 */
export function SitesSky() {
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.part = 'sky';
    canvas.className = 'pointer-events-none print:hidden';
    // Out of the page's flow by itself, and behind everything on it: a page without its stylesheet must not grow with its canvas.
    Object.assign(canvas.style, { position: 'absolute', top: '0', left: '0', zIndex: '-1', pointerEvents: 'none' });
    document.body.prepend(canvas);
    let stars: Stars | null = null, gone = false;
    const draw = () => {
      if (gone) return;
      // The body's own box: the canvas, out of the flow, never adds to it.
      const w = document.documentElement.clientWidth, h = Math.ceil(Math.max(document.body.getBoundingClientRect().height, window.innerHeight));
      if (!w || !h) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (w * h)));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, w, h);
      const words = wordBoxes();
      const clear = (x: number, y: number) => !words.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
      const rand = seeded(20261115);
      // The Milky Way: a band that crosses the page from the upper right to the lower left, again every strip.
      const along = (y: number) => w * (0.82 - (0.62 * (y % STRIP_PX)) / STRIP_PX);
      const clouds = Math.ceil(h / 150);
      for (let k = 0; k < clouds; k++) {
        const y = rand() * h, x = along(y) + (rand() - 0.5) * Math.max(260, w * 0.3), r = Math.max(200, Math.min(w, 1100) * (0.22 + rand() * 0.26));
        const warm = rand() < 0.25, c = warm ? '243,239,228' : '127,169,255', a = warm ? 0.05 + rand() * 0.04 : 0.09 + rand() * 0.09;
        const cloud = g.createRadialGradient(x, y, 0, x, y, r);
        cloud.addColorStop(0, `rgba(${c},${a.toFixed(3)})`);
        cloud.addColorStop(0.55, `rgba(${c},${(a * 0.35).toFixed(3)})`);
        cloud.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = cloud;
        g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      // A dust of small stars everywhere, and a river of them along the band.
      const dust = Math.round((w * h) / 1500);
      for (let k = 0; k < dust; k++) {
        const y = rand() * h, inBand = k % 3 === 0;
        const x = inBand ? along(y) + (rand() + rand() + rand() - 1.5) * Math.max(220, w * 0.24) : rand() * w;
        const size = rand(), r = size < 0.72 ? 0.5 + rand() * 0.45 : size < 0.95 ? 1 + rand() * 0.5 : 1.6 + rand() * 0.9;
        const tint = TINTS[Math.floor(rand() * TINTS.length)], alpha = r < 1 ? 0.35 + rand() * 0.4 : 0.6 + rand() * 0.4;
        if (x < 0 || x > w || !clear(x, y)) continue;
        drawStar(g, x, y, r, tint, alpha);
      }
      // The catalogue's real stars on top, larger and brighter than in the header's band.
      if (stars) {
        for (let top = 0, k = 0; top < h; top += STRIP_PX, k++) {
          for (const s of bandStars(stars, w, STRIP_PX, PX_PER_DEG, 255 + 67 * k)) {
            // The header band fades its stars out toward its foot; here the sky runs on, so the fade is taken back out.
            const fade = Math.min(1, s.y / (STRIP_PX / 3));
            if (fade <= 0) continue;
            const x = w / 2 + s.x, y = top + s.y;
            if (!clear(x, y)) continue;
            drawStar(g, x, y, s.r * 1.5, s.rgb, Math.min(1, (s.alpha / fade) * 2.4));
          }
        }
      }
    };
    draw();
    fetchBytes(`${dataBase()}/sky/stars.bin`).then(
      (b) => {
        stars = parseStars(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, Math.floor(b.byteLength / 20));
        draw();
      },
      () => {},
    );
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    watch?.observe(document.body);
    return () => {
      gone = true;
      watch?.disconnect();
      canvas.remove();
    };
  }, []);
  return null;
}
