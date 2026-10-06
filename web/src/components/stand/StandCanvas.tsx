'use client';
import { useEffect, useRef, useState } from 'react';
import { crossStars, type StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { heightAt } from '@/lib/sky/terrainField';
import { compassWord } from '@/lib/viz/ground';
import { EARTH_LOOP, shadowWords, starLabel } from '@/lib/viz/stand';

export type RendererLike = Pick<StandRenderer, 'setTime' | 'setView' | 'resize' | 'render' | 'labels' | 'dispose'> & { ready?: Promise<void>; onLost?: (why: string) => void; setGuides?: (on: boolean, level?: boolean, rings?: boolean) => void; setBright?: (on: boolean) => void; setScene?: (scene: StandScene) => void };
/** Where to turn the view; a new object turns it again, even to the same place. */
export interface LookTarget {
  yaw: number;
  pitch: number;
  fov: number;
  /** Keep the lander's feet in sight above the bar, as the opening does, until the view is turned by hand (Turn to Lander, 18.3). */
  fit?: boolean;
}

/**
 * Degrees the view rests higher (or lower, when negative), so the horizon (the Sun on it) sits where the
 * view has room, with room under it for the ground and the lander: on a tall screen 40 % down the band left
 * free between the words above and the buttons below (`freeTop` to `freeBottom`, pixels down the screen);
 * on a wide screen, whose words sit at the sides, 55 % down the room above the time bar (`freeBottom`).
 */
export function horizonLift(width: number, height: number, fovDeg: number, freeTop: number, freeBottom: number): number {
  const wide = height <= width;
  if (freeBottom - (wide ? 0 : freeTop) < 60) return 0;
  const y = wide ? 0.55 * freeBottom : freeTop + 0.4 * (freeBottom - freeTop);
  const t = ((y - height / 2) / (height / 2)) * Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(-15, Math.min(15, (Math.atan(t) * 180) / Math.PI));
}

/**
 * The opening view's pitch, lowered just enough that the point `elDeg` below level (the lander's feet) sits
 * 56 px above `freeBottom`, clear of the bar with room for the legs' own spread, and by 10 degrees at most;
 * `pitchDeg` as it is when that point is in view already.
 */
export function fitPitch(height: number, fovDeg: number, freeBottom: number, elDeg: number, pitchDeg: number): number {
  const t = ((height / 2 - (freeBottom - 56)) / (height / 2)) * Math.tan((fovDeg * Math.PI) / 360);
  const p = elDeg - (Math.atan(t) * 180) / Math.PI;
  return p >= pitchDeg ? pitchDeg : Math.max(p, pitchDeg - 10);
}

/**
 * The lowest pitch the opening view may take while keeping what it opens on (`elDeg` up: the Sun, or Earth at night)
 * at least 100 px below `freeTop`, the foot of the words above, room for its name over it (16.3): the lander's feet
 * are kept in sight only as far as that, so a view that opens on Earth never tilts it up under the status line.
 */
export function subjectFloor(height: number, fovDeg: number, freeTop: number, elDeg: number): number {
  const t = ((height / 2 - (freeTop + 100)) / (height / 2)) * Math.tan((fovDeg * Math.PI) / 360);
  return elDeg - (Math.atan(t) * 180) / Math.PI;
}

/**
 * ", uphill" or ", downhill" when the view faces within 45° of up or down the slope you stand on (uphill
 * towards `upAzDeg`, `grade` its rise per metre), when it is steeper than 5°; else nothing. A tilted skyline
 * then reads as the slope it is, not as a tilted head.
 */
export function slopeWord(yawDeg: number, upAzDeg: number, grade: number): string {
  if (grade < Math.tan((5 * Math.PI) / 180)) return '';
  const rel = Math.abs(((((yawDeg - upAzDeg + 540) % 360) + 360) % 360) - 180);
  return rel <= 45 ? ', uphill' : rel >= 135 ? ', downhill' : '';
}

/**
 * Pointers to the Sun, Earth and the lander when they lie beyond either side of the view: from that edge of
 * the screen, at about the height they stand at (`el`, degrees), held 24 px inside the room between the
 * panels (`freeTop` to `freeBottom`), two on one side stacked 34 px apart; none for what is in view.
 */
export function edgePointers(
  bodies: { key: string; az: number; el: number }[],
  v: { yaw: number; pitch: number; fov: number; W: number; H: number; freeTop: number; freeBottom: number },
): { key: string; side: 'left' | 'right'; y: number }[] {
  const t = Math.tan((v.fov * Math.PI) / 360), half = (Math.atan(t * (v.W / v.H)) * 180) / Math.PI;
  const lo = v.freeTop + 24, hi = Math.max(lo, v.freeBottom - 24);
  const out: { key: string; side: 'left' | 'right'; y: number }[] = [];
  for (const b of bodies) {
    const rel = ((((b.az - v.yaw + 540) % 360) + 360) % 360) - 180;
    if (Math.abs(rel) <= half - 2) continue;
    const y = v.H / 2 - (Math.tan(((b.el - v.pitch) * Math.PI) / 180) / t) * (v.H / 2);
    out.push({ key: b.key, side: rel > 0 ? 'right' : 'left', y: Math.min(hi, Math.max(lo, y)) });
  }
  for (const side of ['left', 'right'] as const) {
    const on = out.filter((p) => p.side === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < on.length; i++) if (on[i].y - on[i - 1].y < 34) on[i].y = on[i - 1].y + 34;
    // Pushed past the room's foot: the stack slides up.
    const over = on.length ? on[on.length - 1].y - hi : 0;
    if (over > 0) for (const p of on) p.y = Math.max(lo, p.y - over);
  }
  return out;
}

/**
 * Where a pointer's middle goes (pixels down the screen) so its `box` keeps 6 px clear of the labels on the
 * sky: where it is when clear; else just above the label it meets (labels sit over their things, so above is
 * open sky), or just below it when above would leave the room (`lo` to `hi`).
 */
export function pointerClear(box: Rect, labels: Rect[], lo: number, hi: number): number {
  const h = box.bottom - box.top, mid = box.top + h / 2;
  const hit = labels.find((l) => box.right > l.left && box.left < l.right && box.bottom > l.top - 6 && box.top < l.bottom + 6);
  if (!hit) return mid;
  const above = hit.top - 6 - h / 2;
  return above - h / 2 >= lo ? above : Math.min(hi, hit.bottom + 6 + h / 2);
}

/**
 * A body's name with the body under it: the name's box grown `below` pixels down, over the disc and its glare, which
 * a pointer keeps clear of as it does of the name (both readers of read D1 found Earth's pointer on the Sun's disc).
 */
export const withBody = (r: Rect, below = 40): Rect => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom + below });

/** A path's name as the view shows it: Earth's with why it loops, on a second line (teacher, part B read 7). */
export function pathNameText(body: 'sun' | 'earth', text: string): string {
  return body === 'earth' ? `${text}\n${EARTH_LOOP}` : text;
}

/**
 * A pointer's words on a phone: the body and how high it stands, short ("Earth 4.4° up", "Earth 1.2° below"). The
 * label names the hill that hides a body by its direction (18.2); the pointer's arrow says where, so the short form
 * drops the hill.
 */
export function pointerShort(label: string): string {
  return label
    .replace(/^(\w+) behind a hill to the [\w-]+, (.+) up$/, '$1 $2 up')
    .replace(/^(\w+) behind a hill to the [\w-]+, on the horizon$/, '$1 on the horizon')
    .replace(/^(\w+), /, '$1 ')
    .replace(/ below the horizon$/, ' below');
}

/** A pointer's words: the label's, which already says "up" behind a hill and names the hill's direction (18.2); "below the horizon" stays: below what? */
export function pointerWords(label: string): string {
  return label;
}

/** The Southern Cross's four stars, named only while the cross's own name is not shown. */
const CROSS = new Set(['Acrux', 'Mimosa', 'Gacrux', 'Imai']);
/**
 * Which star names show: the bright stars where they stand in view, when `named` (at night, or looking up);
 * the Southern Cross by its own name rather than its four stars', so the names do not pile up on it.
 */
export function starNamesShown(stars: { name: string; visible: boolean }[], named: boolean): boolean[] {
  const cross = named && stars.some((s) => s.name === 'Southern Cross' && s.visible);
  return stars.map((s) => named && s.visible && !(cross && CROSS.has(s.name)));
}

/** Whether the bright stars carry their names: with the guides at night, and whenever the view looks well up (16.2). */
export const starsNamed = (guides: boolean, night: boolean, pitchDeg: number): boolean => (guides && night) || pitchDeg > 25;

type PartSide = 'above' | 'below' | 'left' | 'right';
type Rect = { left: number; top: number; right: number; bottom: number };

/**
 * How far a day on a path, or a path's name, keeps from its own body's label (16.3), in pixels to either side and
 * above or below: beside it, on the same line, it reads as about the hour shown, as "Earth sets, 23 Jan" beside a
 * rising Earth did in part C's read.
 */
export const OWN_CLEAR = { x: 120, y: 24 } as const;
/** A box grown by `mx` pixels to either side and `my` above and below (`mx` by default). */
export const inflate = (b: Rect, mx: number, my = mx): Rect => ({ left: b.left - mx, top: b.top - my, right: b.right + mx, bottom: b.bottom + my });
/** The boxes of days or paths' names, each left out (null) where it meets its own body's zone (that body's label grown by OWN_CLEAR). */
export function clearOfOwn(boxes: (Rect | null)[], owners: ('sun' | 'earth' | undefined)[], zones: Partial<Record<'sun' | 'earth', Rect>>): (Rect | null)[] {
  return boxes.map((b, k) => {
    const owner = owners[k], z = owner ? zones[owner] : undefined;
    return b && z && b.right > z.left && b.left < z.right && b.bottom > z.top && b.top < z.bottom ? null : b;
  });
}

/** The compass strip: 120° of the horizon across 300 px, ticks every 15°, the eight points named; its ticks fade at the ends, and each letter shows whole or not at all (letterShown). */
const STRIP_W = 300, PX_PER_DEG = STRIP_W / 120;
/**
 * The compass plate's height, px: the compass 32, the facing line 24, the key naming the dots 22, and its bottom edge 1
 * (18.3). The caption's plate in the stand view ends where this one starts, 14 px above the time bar, so the two read
 * as one plate: its bottom offset is 14 + STRIP_H.
 */
export const STRIP_H = 79;
const STRIP_FADE = 'linear-gradient(to right, transparent, #000 16%, #000 84%, transparent)';
/** Narrower than this (degrees up and down) the view is zoomed in: the compass says so, and the lander's parts are named. */
const ZOOMED_FOV = 45;

/**
 * Whether the view is zoomed in on the lander, so its parts carry their names: narrower than ZOOMED_FOV, with the
 * lander (at `landerAzDeg`) within 10° of the view's middle. A view zoomed in on Earth at night, the lander standing
 * beside it, names the lander alone (16.2).
 */
export function zoomedOnLander(fovDeg: number, yawDeg: number, landerAzDeg: number | undefined): boolean {
  if (landerAzDeg === undefined || fovDeg >= ZOOMED_FOV) return false;
  return Math.abs(((((landerAzDeg - yawDeg + 540) % 360) + 360) % 360) - 180) < 10;
}
const POINT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * Whether a compass letter shows (16.3), its middle `x` pixels along the strip and `halfWidth` half its width: whole
 * while its near edge stays 12 px or more inside either end, else not at all, so no letter is cut ("N" read for "NW")
 * and none is left faint (both readers of read D1); it fades in and out over 150 ms as it crosses.
 */
export function letterShown(x: number, halfWidth: number, stripW = STRIP_W): boolean {
  return Math.min(x - halfWidth, stripW - x - halfWidth) >= 12;
}

/**
 * Where a body's mark goes on the compass strip, for the way the view faces: pixels from the strip's left
 * while it is within 56° of the middle, else the end it lies beyond (left or right), where its name shows.
 */
export function compassMark(azDeg: number, yawDeg: number): { x: number | null; edge: 'left' | 'right' | null } {
  const rel = ((((azDeg - yawDeg + 540) % 360) + 360) % 360) - 180;
  if (Math.abs(rel) <= 56) return { x: STRIP_W / 2 + rel * PX_PER_DEG, edge: null };
  return { x: null, edge: rel > 0 ? 'right' : 'left' };
}

/**
 * Which side of its star each name goes, in order: on the right, or on the left when the right would touch a
 * name already placed (8 px apart at least) or another named star's dot, or left out when both would. `x`, `y` is the star on the
 * screen, `w`, `h` its name's size, in pixels.
 */
export function labelSides(spots: { x: number; y: number; w: number; h: number; visible: boolean }[]): ('right' | 'left' | 'none')[] {
  type Box = { l: number; r: number; t: number; b: number };
  const taken: Box[] = [];
  // The other named stars' dots: no name may cover one (2 px clear of it).
  const dots = spots.map((s) => (s.visible ? { l: s.x - 3, r: s.x + 3, t: s.y - 3, b: s.y + 3 } : null));
  const free = (q: Box, self: number) =>
    !taken.some((o) => q.l < o.r + 8 && q.r + 8 > o.l && q.t < o.b && q.b > o.t) &&
    !dots.some((o, k) => o !== null && k !== self && q.l < o.r + 2 && q.r + 2 > o.l && q.t < o.b + 2 && q.b + 2 > o.t);
  return spots.map((s, k) => {
    if (!s.visible) return 'none';
    const t = s.y - s.h / 2, b = s.y + s.h / 2;
    const right = { l: s.x + 8, r: s.x + 8 + s.w, t, b }, left = { l: s.x - 8 - s.w, r: s.x - 8, t, b };
    if (free(right, k)) {
      taken.push(right);
      return 'right';
    }
    if (free(left, k)) {
      taken.push(left);
      return 'left';
    }
    return 'none';
  });
}
const SIDE = { right: 'translate(8px, -50%)', left: 'translate(calc(-100% - 8px), -50%)' } as const;

/** A lander part's name hangs off the part on a leader line: 26 px long to one side, 20 px above or below. */
const LEADER_X = 26, LEADER_Y = 20;
/** Where the name and its line sit for each side: the line's free end on the part. */
const PART_SIDE: Record<PartSide, string> = {
  above: 'translate(-50%, -100%)',
  below: 'translate(-50%, 0)',
  left: 'translate(-100%, -50%)',
  right: 'translate(0, -50%)',
};

/**
 * Which side of a lander part its name goes: the first of `sides` where the name (`w` × `h` pixels, at the
 * end of its leader line from the part at `x`, `y`) stays on the `W` × `H` screen and 4 px clear of every
 * panel on it, or null when none does.
 */
export function partSide(x: number, y: number, w: number, h: number, sides: readonly PartSide[], plates: Rect[], W: number, H: number): PartSide | null {
  const box = (s: PartSide): Rect =>
    s === 'above'
      ? { left: x - w / 2, right: x + w / 2, top: y - LEADER_Y - h, bottom: y }
      : s === 'below'
        ? { left: x - w / 2, right: x + w / 2, top: y, bottom: y + LEADER_Y + h }
        : s === 'left'
          ? { left: x - LEADER_X - w, right: x, top: y - h / 2, bottom: y + h / 2 }
          : { left: x, right: x + LEADER_X + w, top: y - h / 2, bottom: y + h / 2 };
  return (
    sides.find((s) => {
      const b = box(s);
      if (b.left < 4 || b.right > W - 4 || b.top < 4 || b.bottom > H - 4) return false;
      return !plates.some((p) => b.right > p.left - 4 && b.left < p.right + 4 && b.bottom > p.top - 4 && b.top < p.bottom + 4);
    }) ?? null
  );
}
/**
 * How far (pixels, + right) a label's box must slide along its line to keep 4 px clear of every panel: 0 when
 * it is clear already; the shorter way when it only meets a panel's edge; null when that would take it more
 * than 60 % of its own width from where it belongs, or off the `W`-wide screen.
 */
export function clearOf(b: Rect, plates: Rect[], W: number): number | null {
  const meets = (q: Rect) => plates.filter((p) => q.right > p.left - 4 && q.left < p.right + 4 && q.bottom > p.top - 4 && q.top < p.bottom + 4);
  const hit = meets(b);
  if (hit.length === 0) return 0;
  const width = b.right - b.left;
  const ways = [Math.max(...hit.map((p) => p.right + 4 - b.left)), Math.min(...hit.map((p) => p.left - 4 - b.right))].sort((x, y) => Math.abs(x) - Math.abs(y));
  for (const d of ways) {
    const q = { left: b.left + d, right: b.right + d, top: b.top, bottom: b.bottom };
    if (Math.abs(d) <= 0.6 * width && q.left >= 4 && q.right <= W - 4 && meets(q).length === 0) return d;
  }
  return null;
}

/**
 * How far (pixels, up) to lift a label so it clears the names it meets: its foot 4 px over the top of the
 * highest of them, again if it then meets another; 0 when it meets none, wherever it is; null when lifting
 * it would take its top above `minTop`, the top of the room it may use. A Sun named over the lander, gone
 * behind it, so rises over the lander's own names.
 */
export function liftClear(b: Rect, others: Rect[], minTop: number): number | null {
  let dy = 0;
  for (let k = 0; k <= others.length; k++) {
    const q = { left: b.left, right: b.right, top: b.top - dy, bottom: b.bottom - dy };
    const hit = others.filter((o) => q.right > o.left && q.left < o.right && q.bottom > o.top - 4 && q.top < o.bottom);
    if (hit.length === 0) return dy > 0 && q.top < minTop ? null : dy;
    dy = b.bottom - Math.min(...hit.map((o) => o.top)) + 4;
  }
  return null;
}

/** Whether two boxes come within 4 px of each other. */
const touches = (a: Rect, b: Rect) => a.right > b.left - 4 && a.left < b.right + 4 && a.bottom > b.top - 4 && a.top < b.bottom + 4;

/**
 * How far (pixels, + right and down) a label moves to keep 4 px clear of the lander's body on the screen (`lander`,
 * the box round it): not at all while it is clear; else the least way that clears it, to the lander's left or right
 * or above it, that keeps it on the `W`-wide screen, its top no higher than `minTop`, and 4 px clear of `others`
 * (the labels it gives way to, the panels); null when no way does, and it gives way for the frame.
 */
export function offLander(b: Rect, lander: Rect, W: number, minTop: number, others: Rect[] = []): { dx: number; dy: number } | null {
  if (!touches(b, lander)) return { dx: 0, dy: 0 };
  const ways = [
    { dx: lander.left - 4 - b.right, dy: 0 },
    { dx: lander.right + 4 - b.left, dy: 0 },
    { dx: 0, dy: lander.top - 4 - b.bottom },
  ].sort((p, q) => Math.abs(p.dx) + Math.abs(p.dy) - Math.abs(q.dx) - Math.abs(q.dy));
  return (
    ways.find(({ dx, dy }) => {
      const q = { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy };
      return q.left >= 4 && q.right <= W - 4 && q.top >= minTop && !others.some((o) => touches(q, o));
    }) ?? null
  );
}

/**
 * Which of the days on the paths show, in order (`chips`, their boxes where placed, null for one not shown):
 * each in its place unless it comes within 4 px of a label shown (`labels`) or of a chip shown before it, which
 * keeps its place; a chip that gives way takes no room. A chip not yet laid out (no width) shows and takes none.
 */
export function chipsShown(chips: (Rect | null)[], labels: Rect[]): boolean[] {
  const taken = [...labels];
  return chips.map((b) => {
    if (!b) return false;
    if (b.right <= b.left) return true;
    if (taken.some((o) => b.left < o.right + 4 && b.right > o.left - 4 && b.top < o.bottom + 4 && b.bottom > o.top - 4)) return false;
    taken.push(b);
    return true;
  });
}

/** The sides each part's name tries, in order. */
const PARTS = [
  ['panel', 'Solar panel', ['above', 'below']],
  ['dish', 'Radio dish', ['right', 'left']],
  ['lamp', 'Power light', ['left', 'right']],
] as const;
const BODIES = [
  ['sun', 'Sun', 'bg-[#f6b646] border-[#f6b646]'],
  ['earth', 'Earth', 'bg-[#74adff] border-[#74adff]'],
  ['lander', 'Lander', 'bg-[#f2f0ea] border-[#f2f0ea]'],
] as const;
type Body = (typeof BODIES)[number][0];
/** The paths named on the sky, each in its body's colour. */
const PATHS = [
  ['sun', 'text-[#f6b646]'],
  ['earth', 'text-[#74adff]'],
] as const;
const TICKS = Array.from({ length: 72 }, (_, k) => -360 + k * 15);

/**
 * How far a turn of the view moves in a frame that came `dt` seconds after the last: by time, not frames, so
 * a turn takes as long on a slow graphics chip as on a fast one; a frame later than half a second counts as
 * half a second, so a stall never makes the view jump.
 */
export const easeStep = (dt: number): number => 1 - Math.exp(-5 * Math.min(0.5, Math.max(0, dt)));

const lerpAngle = (a: number, b: number, f: number) => (a + ((((b - a + 540) % 360) - 180) * f) + 360) % 360;
// Opaque, so no path line shows through a name (16.3; both readers of read D1).
const LABEL = 'pointer-events-none absolute whitespace-nowrap rounded-[5px] border border-white/15 bg-black px-2 py-1 text-[15px]';

/**
 * The sky from the site, full window. Drag, the wheel and the arrow keys look around; `look` turns the
 * view smoothly; the labels follow the Sun and Earth, and a compass strip shows the heading. The shown time glides to the
 * hour at 14 hours a second (faster than Play's 12), so Play sweeps the shadows smoothly; a jump of more
 * than 2 hours is taken at once. On opening, the view settles from the sky down to the horizon in under
 * 4 seconds, unless the system asks for reduced motion. A line says which way the view faces, and when it
 * is zoomed in (on a phone, a small note at the top right); the compass strip marks the Sun, Earth and the
 * lander at their bearings, hollow while below the horizon, or names them at its end when they lie beyond;
 * the bright stars carry their names at night and when the view looks up, each on whichever side keeps it
 * clear of the others; zoomed in on the lander, its solar panel, dish and power light carry theirs. The Sun's
 * path and Earth's carry their names where they show, and the key moments' days on them give way to all of
 * these, and to each other. No label sits on the lander's body but its own. With `guides` off, only the Sun,
 * Earth and the lander are named (and its parts when zoomed in), with the pointers; the paths, their days and
 * names, the level horizon, the star names at night and your shadow come with the guides (16.2).
 */
export function StandCanvas({
  scene,
  hour,
  look,
  startYaw,
  reducedMotion,
  createRenderer,
  sunLabel,
  earthLabel,
  night,
  onFail,
  onReady,
  clean = false,
  guides = true,
  keepInView = null,
  keepSubject = null,
  startFov,
  onExplore,
  place,
  docked = false,
  bright = false,
}: {
  scene: StandScene;
  hour: number;
  look: LookTarget | null;
  startYaw: number;
  reducedMotion: boolean;
  createRenderer: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike;
  sunLabel: string;
  earthLabel: string;
  /** The Sun is hidden at the site: the stars carry their names. */
  night: boolean;
  onFail: (message: string) => void;
  /** Called once the renderer's shaders are built and the view can be drawn. */
  onReady?: () => void;
  /** The clean view: no label and no compass over the picture. */
  clean?: boolean;
  /** The guides (16.2): the month's paths, their days and names, the level horizon, the star names at night and your shadow. */
  guides?: boolean;
  /**
   * What the opening view keeps in sight above the time bar while it is in view across the screen: the
   * lander's feet, `el` degrees below level, towards `az`.
   */
  keepInView?: { el: number; az: number } | null;
  /** How high (degrees) what the opening view faces stands, the Sun or Earth: looking down for the lander's feet never tilts it under the words (subjectFloor). */
  keepSubject?: number | null;
  /** How wide the view opens (degrees, top to bottom); else 60, or 80 on a tall screen. */
  startFov?: number;
  /** Called the first time the view is turned by hand (a drag, a key, the wheel or a pinch). */
  onExplore?: () => void;
  /** The site's name: on a phone, whose status line leaves it out, the facing chip names it (read D1). */
  place?: string;
  /** A caption's plate sits on the compass plate (18.3): the plate is square and open at the top, so the two read as one. */
  docked?: boolean;
  /** "Brighter picture" (18.3): the renderer doubles its exposure for projectors and bright rooms. */
  bright?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sunRef = useRef<HTMLSpanElement>(null);
  const landerRef = useRef<HTMLSpanElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const cleanRef = useRef(clean);
  const guidesRef = useRef(guides);
  const reducedRef = useRef(reducedMotion);
  const partRefs = useRef<Record<'panel' | 'dish' | 'lamp', HTMLSpanElement | null>>({ panel: null, dish: null, lamp: null });
  const lampTextRef = useRef<HTMLSpanElement>(null);
  // The opening view (until the first turn), which keeps the lander's feet in sight, and how much lower
  // than the view's own pitch it looks for them.
  const openingRef = useRef(true);
  const fitOffset = useRef(0);
  // A look that keeps the lander's feet in sight as the opening does (LookTarget.fit), until the view is turned by hand.
  const fitRef = useRef(false);
  // The renderer, for settings that change while it lives: the brighter picture (18.3).
  const rendererRef = useRef<RendererLike | null>(null);
  // The scene drawn. A new one for the same period (a lander changed in today's card, the mast's height) is swapped into
  // the renderer the canvas has, once its shaders are built, as the arrival's ground is (setScene): a new renderer, with
  // its context and its programs, took seconds on each change (the final review). A renderer that cannot take a scene is
  // built again (`generation`).
  const sceneRef = useRef(scene);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (sceneRef.current === scene) return;
    sceneRef.current = scene;
    const r = rendererRef.current;
    if (r?.setScene) r.setScene(scene);
    else setGeneration((g) => g + 1);
  }, [scene]);
  const brightRef = useRef(bright);
  useEffect(() => {
    brightRef.current = bright;
    rendererRef.current?.setBright?.(bright);
  }, [bright]);
  const keepRef = useRef(keepInView);
  const subjectRef = useRef(keepSubject);
  const earthRef = useRef<HTMLSpanElement>(null);
  const starRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // The key moments' days on the Sun's and Earth's paths, the paths' own names, and the level horizon's name.
  const pathRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const nameRefs = useRef<Record<'sun' | 'earth', HTMLSpanElement | null>>({ sun: null, earth: null });
  const levelRef = useRef<HTMLSpanElement>(null);
  const facingRef = useRef<HTMLParagraphElement>(null);
  const facingPhoneRef = useRef<HTMLParagraphElement>(null);
  const markRefs = useRef<Partial<Record<Body, HTMLElement | null>>>({});
  const pointerRefs = useRef<Partial<Record<Body, HTMLElement | null>>>({});
  const trackRef = useRef<HTMLDivElement>(null);
  // The compass letters, which ride with the ticks and fade whole near the strip's ends.
  const lettersRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const hourRef = useRef(hour);
  const nightRef = useRef(night);
  // A tall screen opens wider (80° up and down), so the Sun and the lander both fit across it.
  const view = useRef({ yaw: startYaw, pitch: reducedMotion ? 2 : 34, fov: startFov ?? (typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? 80 : 60) });
  const exploreRef = useRef(onExplore);
  const placeRef = useRef(place);
  const goal = useRef<LookTarget | null>(null);
  const intro = useRef<{ start: number } | null>(reducedMotion ? null : { start: 0 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  // Fingers on the canvas, for a two-finger pinch: spreading them narrows the view.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; fov: number } | null>(null);
  const failRef = useRef(onFail);
  const readyRef = useRef(onReady);
  // Until the first frame is drawn no label shows: none floats over the empty view while it builds.
  const drawnRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    hourRef.current = hour;
  }, [hour]);
  useEffect(() => {
    nightRef.current = night;
  }, [night]);
  useEffect(() => {
    cleanRef.current = clean;
  }, [clean]);
  useEffect(() => {
    guidesRef.current = guides;
  }, [guides]);
  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);
  useEffect(() => {
    keepRef.current = keepInView;
  }, [keepInView]);
  useEffect(() => {
    subjectRef.current = keepSubject;
  }, [keepSubject]);
  useEffect(() => {
    exploreRef.current = onExplore;
  }, [onExplore]);
  useEffect(() => {
    placeRef.current = place;
  }, [place]);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);
  /** The opening view ends, or a look that kept the lander's feet in sight: its lower pitch becomes the view's own, so nothing jumps. */
  const endOpening = () => {
    if (!openingRef.current && !fitRef.current) return;
    view.current.pitch += fitOffset.current;
    fitOffset.current = 0;
    openingRef.current = false;
    fitRef.current = false;
    canvas.current?.setAttribute('data-fit', '0');
  };
  useEffect(() => {
    if (!look) return;
    endOpening();
    intro.current = null;
    // A look that asks for it (Turn to Lander) keeps the lander's feet above the bar as the opening does (18.3).
    fitRef.current = !!look.fit;
    canvas.current?.setAttribute('data-fit', look.fit ? '1' : '0');
    // With reduced motion the view is there at once: no camera flight.
    if (reducedRef.current) {
      view.current = { ...look };
      goal.current = null;
    } else goal.current = { ...look };
  }, [look]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let r: RendererLike;
    try {
      r = createRenderer(el, sceneRef.current);
    } catch (e) {
      failRef.current(e instanceof Error ? e.message : String(e));
      return;
    }
    let live = true;
    // A view that cannot draw gives way to the fallback, with the same words: shaders that fail to build or on
    // their first use, or a graphics context lost to a driver reset (after which nothing would draw again).
    const fail = (why: string) => {
      if (live) failRef.current(why);
    };
    r.onLost = fail;
    rendererRef.current = r;
    r.setBright?.(brightRef.current);
    void Promise.resolve(r.ready).then(
      () => {
        if (!live) return;
        drawnRef.current = true;
        readyRef.current?.();
      },
      (e: unknown) => fail(e instanceof Error ? e.message : String(e)),
    );
    const lost = (e: Event) => {
      e.preventDefault();
      fail('The graphics context was lost');
    };
    el.addEventListener('webglcontextlost', lost);
    const size = () => r.resize(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
    size();
    window.addEventListener('resize', size);
    // The slope you stand on, over 10 m each way, for the facing line.
    const hAt = (x: number, z: number) => heightAt(sceneRef.current.field, x, z);
    const gx = (hAt(10, 0) - hAt(-10, 0)) / 20, gz = (hAt(0, 10) - hAt(0, -10)) / 20;
    const slope = { grade: Math.hypot(gx, gz), upAz: ((Math.atan2(gx, -gz) * 180) / Math.PI + 360) % 360 };
    let shown = hourRef.current;
    let last = performance.now();
    r.setTime(shown);
    let raf = 0;
    // Labels never touch the words: a label whose box meets a panel (data-plate) is hidden.
    let plates: DOMRect[] = [];
    /** Places a label at its spot; returns how far it slid (pixels, + right), or null when it is hidden. */
    const place = (node: HTMLElement | null, s: { x: number; y: number; visible: boolean } | null): number | null => {
      if (!node) return null;
      if (!s || !s.visible) {
        node.hidden = true;
        return null;
      }
      node.style.left = `${s.x * 100}%`;
      node.style.top = `${s.y * 100}%`;
      node.hidden = false;
      let b = node.getBoundingClientRect();
      if (b.width === 0) return 0;
      // Kept inside the screen: a label near an edge slides in rather than being cut off.
      const w = el.clientWidth || window.innerWidth;
      const shift = b.right > w - 4 ? b.right - (w - 4) : b.left < 4 ? b.left - 4 : 0;
      if (shift !== 0) {
        node.style.left = `calc(${s.x * 100}% - ${shift}px)`;
        b = node.getBoundingClientRect();
      }
      // Beside a panel: slid along clear of it when it only meets the panel's edge, else left out.
      const d = clearOf(b, plates, w);
      if (d === null) {
        node.hidden = true;
        return null;
      }
      if (d !== 0) node.style.left = `calc(${s.x * 100}% + ${d - shift}px)`;
      return d - shift;
    };
    /** Puts a label at its spot, moved `dx` pixels right and `dy` down. */
    const setAt = (node: HTMLElement, s: { x: number; y: number }, dx: number, dy: number) => {
      node.style.left = dx ? `calc(${s.x * 100}% + ${dx}px)` : `${s.x * 100}%`;
      node.style.top = dy ? `calc(${s.y * 100}% + ${dy}px)` : `${s.y * 100}%`;
    };
    /**
     * Keeps a placed label (`dx` pixels along from its spot) off the lander's body (`body`, its box on the screen):
     * moved beside it or above it, clear of `others` and the panels, or hidden for the frame where no way is clear.
     * Returns how far it went down (pixels).
     */
    const keepOff = (node: HTMLElement | null, s: { x: number; y: number }, dx: number | null, body: Rect | null, others: Rect[] = []): number => {
      if (!node || node.hidden || dx === null || !body) return 0;
      const b = node.getBoundingClientRect();
      if (b.width === 0) return 0;
      const m = offLander(b, body, el.clientWidth || window.innerWidth, 4, [...others, ...plates]);
      if (!m) {
        node.hidden = true;
        return 0;
      }
      if (m.dx !== 0 || m.dy !== 0) setAt(node, s, dx + m.dx, m.dy);
      return m.dy;
    };
    const tick = (now: number) => {
      const sc = sceneRef.current;
      const step = (now - last) / 1000;
      const dt = Math.min(0.1, Math.max(0, step));
      last = now;
      const d = hourRef.current - shown;
      if (d !== 0) {
        shown = Math.abs(d) > 2 ? hourRef.current : shown + Math.sign(d) * Math.min(Math.abs(d), dt * 14);
        r.setTime(shown);
      }
      const v = view.current;
      // The panels on the screen: labels keep off them, and on a tall screen the horizon sits between them.
      plates = [...document.querySelectorAll('[data-plate]')].map((p) => p.getBoundingClientRect()).filter((p) => p.width > 0);
      const W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight;
      let freeTop = 0, freeBottom = H;
      for (const p of plates) {
        if (p.top < H * 0.4 && p.bottom < H * 0.65) freeTop = Math.max(freeTop, p.bottom);
        // On a wide screen only what spans the screen (the time bar) bounds the room below, not the compass.
        else if (p.bottom > H * 0.6 && p.top > H * 0.35 && (H > W || p.width >= W * 0.5)) freeBottom = Math.min(freeBottom, p.top);
      }
      const i = intro.current;
      let settled = 1;
      if (i && !drag.current) {
        if (i.start === 0) i.start = now;
        const f = Math.min(1, (now - i.start) / 3800);
        settled = 1 - Math.pow(1 - f, 3);
        v.pitch = 34 + (2 - 34) * settled;
        if (f >= 1) intro.current = null;
      }
      const g = goal.current;
      if (g) {
        const k = easeStep(step);
        v.yaw = lerpAngle(v.yaw, g.yaw, k);
        v.pitch += (g.pitch - v.pitch) * k;
        v.fov += (g.fov - v.fov) * k;
        if (Math.abs(((g.yaw - v.yaw + 540) % 360) - 180) < 0.1 && Math.abs(g.pitch - v.pitch) < 0.1 && Math.abs(g.fov - v.fov) < 0.1) goal.current = null;
      }
      // Only near the horizon: looking up keeps its own framing.
      const lift = horizonLift(W, H, v.fov, freeTop, freeBottom) * Math.max(0, Math.min(1, (30 - v.pitch) / 10));
      let pitch = v.pitch + lift;
      // The opening view, and a look that asks for it (Turn to Lander), look a little lower if they must, so the lander's
      // feet stay in sight above the bar.
      const keep = keepRef.current;
      const keepRel = keep ? Math.abs(((((keep.az - v.yaw + 540) % 360) + 360) % 360) - 180) : 180;
      const halfW = (Math.atan(Math.tan((v.fov * Math.PI) / 360) * (W / H)) * 180) / Math.PI;
      if ((openingRef.current || fitRef.current) && keep && keepRel < halfW) {
        // No lower than keeps what the view opens on in sight under the words, and never higher than it was.
        const subject = subjectRef.current;
        const fitted = subject === null || subject === undefined ? fitPitch(H, v.fov, freeBottom, keep.el, pitch) : Math.min(pitch, Math.max(fitPitch(H, v.fov, freeBottom, keep.el, pitch), subjectFloor(H, v.fov, freeTop, subject)));
        fitOffset.current = (fitted - pitch) * settled;
        pitch += fitOffset.current;
      }
      const shownPitch = Math.max(-35, Math.min(89, pitch));
      r.setView(v.yaw, shownPitch, v.fov);
      // The month's paths and the level horizon go with the guides; the rings on hidden bodies with the words.
      r.setGuides?.(guidesRef.current && !cleanRef.current, true, !cleanRef.current);
      r.render();
      if (!drawnRef.current || cleanRef.current) {
        for (const n of [sunRef.current, earthRef.current, landerRef.current, shadowRef.current, levelRef.current, ...Object.values(partRefs.current), ...starRefs.current, ...pathRefs.current, ...Object.values(nameRefs.current)]) if (n) n.hidden = true;
        raf = requestAnimationFrame(tick);
        return;
      }
      const l = r.labels();
      const guide = guidesRef.current;
      // The lander's body on the screen: no label but its own sits on it.
      const lb = l.landerBox, body = lb ? { left: lb.left * W, top: lb.top * H, right: lb.right * W, bottom: lb.bottom * H } : null;
      const offBody = (node: HTMLElement | null) => {
        if (!node || node.hidden || !body) return;
        const b = node.getBoundingClientRect();
        if (b.width > 0 && touches(b, body)) node.hidden = true;
      };
      const sunDx = place(sunRef.current, l.sun);
      const earthDx = place(earthRef.current, l.earth);
      // Zoomed in on the lander, its parts carry their names (and its own name gives way to them).
      const close = zoomedOnLander(v.fov, v.yaw, sc.lander?.azDeg);
      place(landerRef.current, (close && l.parts?.panel.visible) || (H > W && !close) ? null : l.lander);
      // The power light says whether it is lit.
      const lampNode = lampTextRef.current, hr0 = Math.min(sc.series.hours - 1, Math.max(0, Math.round(shown)));
      const lampText = `Power light: ${sc.lander && Number(sc.lander.powered[hr0]) === 1 ? 'on' : 'off'}`;
      if (lampNode && lampNode.textContent !== lampText) lampNode.textContent = lampText;
      // Each part's name on the first of its sides clear of the panels, so none is lost behind the card.
      for (const [k, , sides] of PARTS) {
        const node = partRefs.current[k], s = close && l.parts ? l.parts[k] : null;
        if (!node) continue;
        if (!s || !s.visible) {
          node.hidden = true;
          continue;
        }
        node.style.left = `${s.x * 100}%`;
        node.style.top = `${s.y * 100}%`;
        node.hidden = false;
        const b = (node.querySelector('[data-text]') ?? node).getBoundingClientRect();
        const side = partSide(s.x * W, s.y * H, b.width, b.height, sides, plates, W, H);
        if (side) {
          node.style.transform = PART_SIDE[side];
          node.dataset.side = side;
        } else node.hidden = true;
      }
      // The Sun and Earth named off the lander's body: beside it or above it, or not at all for the frame. One named
      // over the lander (gone behind it) rises clear of the lander's own names, and gives way where that would
      // take it into a panel.
      const names = [landerRef.current, ...Object.values(partRefs.current).map((n) => n?.querySelector<HTMLElement>('[data-text]') ?? null)]
        .filter((n): n is HTMLElement => !!n && !n.closest('[hidden]'))
        .map((n) => n.getBoundingClientRect())
        .filter((b) => b.width > 0);
      for (const [node, at, dx] of [[sunRef.current, l.sun, sunDx], [earthRef.current, l.earth, earthDx]] as const) {
        const down = keepOff(node, at, dx, body);
        if (!node || node.hidden || names.length === 0) continue;
        const dy = liftClear(node.getBoundingClientRect(), names, 4);
        if (dy === null) node.hidden = true;
        else if (dy > 0) {
          node.style.top = `calc(${at.y * 100}% + ${down - dy}px)`;
          const b = node.getBoundingClientRect();
          if (plates.some((q) => b.right > q.left - 4 && b.left < q.right + 4 && b.bottom > q.top - 4 && b.top < q.bottom + 4)) node.hidden = true;
        }
      }
      // Your own shadow, with the guides: long across the ground while the Sun is low.
      const sh = guide ? l.shadow : null;
      if (shadowRef.current && sh) {
        // With the height it is worked out for, so the Sun's height can be checked from it, and on a slope what
        // it would be on level ground.
        const text = shadowWords(sh.lengthM, sh.levelM);
        if (shadowRef.current.textContent !== text) shadowRef.current.textContent = text;
      }
      const shadowDx = place(shadowRef.current, sh ?? null);
      if (sh) keepOff(shadowRef.current, sh, shadowDx, body);
      // The level horizon's name, with the guides, where the renderer finds the line clear of the hills (16.3): not
      // moved off the lander, left out.
      place(levelRef.current, guide && l.level ? l.level : null);
      offBody(levelRef.current);
      // Star names with the guides at night, or when the view looks well up, where they would not crowd the day's sky;
      // each on the side of its star that keeps it clear of the names already placed.
      const nameShown = starNamesShown(l.stars, starsNamed(guide, nightRef.current, v.pitch));
      l.stars.forEach((st, k) => place(starRefs.current[k], { ...st, visible: nameShown[k] }));
      const boxes = l.stars.map((st, k) => {
        const node = starRefs.current[k];
        if (!node || node.hidden) return { x: 0, y: 0, w: 0, h: 0, visible: false };
        const b = node.getBoundingClientRect();
        return { x: st.x * W, y: st.y * H, w: b.width, h: b.height, visible: true };
      });
      labelSides(boxes).forEach((side, k) => {
        const node = starRefs.current[k];
        if (!node || node.hidden) return;
        if (side === 'none') {
          node.hidden = true;
          return;
        }
        node.style.transform = SIDE[side];
        const b = node.getBoundingClientRect();
        if (b.width > 0 && plates.some((q) => b.right > q.left - 4 && b.left < q.right + 4 && b.bottom > q.top - 4 && b.top < q.bottom + 4)) node.hidden = true;
        offBody(node);
      });
      const facing = v.pitch > 35 ? `Looking up, to the ${compassWord(v.yaw)}` : `Facing ${compassWord(v.yaw)}${slopeWord(v.yaw, slope.upAz, slope.grade)}${v.fov < ZOOMED_FOV ? ', zoomed in' : ''}`;
      // On a phone with the site's name before it, as its status line leaves the name out.
      const phoneFacing = placeRef.current ? `${placeRef.current}, ${facing.charAt(0).toLowerCase()}${facing.slice(1)}` : facing;
      for (const [f, text] of [[facingRef.current, facing], [facingPhoneRef.current, phoneFacing]] as const) if (f && f.textContent !== text) f.textContent = text;
      // The ticks and the letters ride together; each letter shows whole or not at all near the strip's ends.
      const shift = STRIP_W / 2 - (v.yaw + 360) * PX_PER_DEG;
      for (const t of [trackRef.current, lettersRef.current]) if (t) t.style.transform = `translateX(${shift}px)`;
      for (const n of letterRefs.current) {
        if (!n) continue;
        const o = letterShown(Number(n.dataset.at) + shift, n.offsetWidth / 2) ? '1' : '0';
        if (n.style.opacity !== o) n.style.opacity = o;
      }
      // The Sun, Earth and the lander on the compass strip: filled while in view, hollow while hidden.
      const hr = Math.min(sc.series.hours - 1, Math.max(0, Math.round(shown)));
      const where: [Body, number, boolean][] = [
        ['sun', sc.series.sunAz[hr], sc.series.sunFraction[hr] > 0],
        ['earth', sc.series.earthAz[hr], sc.series.earthVisible[hr] === 1],
      ];
      if (sc.lander) where.push(['lander', sc.lander.azDeg, true]);
      for (const [k, az, up] of where) {
        const m = compassMark(az, v.yaw), mark = markRefs.current[k];
        if (mark) {
          mark.hidden = m.x === null;
          if (m.x !== null) mark.style.left = `${m.x}px`;
          mark.dataset.up = up ? '1' : '0';
        }
      }
      // What lies beyond either side of the view: a pointer from that edge of the screen, at its height.
      const els: Record<Body, number> = { sun: sc.series.sunEl[hr], earth: sc.series.earthEl[hr], lander: -12 };
      const pointers = edgePointers(
        where.map(([k, az]) => ({ key: k, az, el: els[k] })),
        { yaw: v.yaw, pitch, fov: v.fov, W, H, freeTop, freeBottom },
      );
      for (const [k] of BODIES) {
        const node = pointerRefs.current[k];
        if (!node) continue;
        const p = pointers.find((x) => x.key === k);
        node.hidden = !p;
        if (!p) continue;
        node.dataset.side = p.side;
        node.style.top = `${p.y}px`;
        node.style.left = p.side === 'left' ? '8px' : '';
        node.style.right = p.side === 'right' ? '8px' : '';
        // Clear of the labels on the sky and of the lander's body, so a pointer never covers the lander, its name or
        // the Sun's: above or below what it meets, and again past the next; left out where it still covers the lander.
        const shown = (n: HTMLSpanElement | null): n is HTMLSpanElement => !!n && !n.hidden;
        const labels: Rect[] = [
          ...[sunRef.current, earthRef.current].filter(shown).map((n) => withBody(n.getBoundingClientRect())),
          ...[landerRef.current, shadowRef.current].filter(shown).map((n) => n.getBoundingClientRect()),
        ];
        if (body) labels.push(body);
        for (let k = 0; k < 3; k++) {
          const b = node.getBoundingClientRect();
          if (b.height === 0) break;
          const y = pointerClear(b, labels, freeTop + 24, freeBottom - 8);
          if (Math.abs(y - (b.top + b.bottom) / 2) < 0.5) break;
          node.style.top = `${y}px`;
        }
        offBody(node);
      }
      // The paths' names where the renderer puts them, then the key moments' days where the paths pass them, placed
      // last: for the frame each keeps off the lander's body, beside it or above it, and gives way to every label
      // shown (the Sun's, Earth's, the lander's and its parts' names, your shadow's, the star names, the pointers
      // and the level horizon's name) and to the names and chips before it, so none covers a name or crowds another.
      const shownLabels = [sunRef.current, earthRef.current, landerRef.current, shadowRef.current, levelRef.current, ...Object.values(partRefs.current), ...starRefs.current, ...Object.values(pointerRefs.current)]
        .filter((n): n is HTMLElement => !!n && !n.closest('[hidden]'))
        .map((n) => n.getBoundingClientRect())
        .filter((b) => b.width > 0);
      // Each body's own room: its label grown by OWN_CLEAR, which the days on its path keep clear of (16.3), and 24 px
      // round it for its path's name, which would else be lost whenever the view faces the body (the final review).
      const zones: Partial<Record<'sun' | 'earth', Rect>> = {}, nameZones: Partial<Record<'sun' | 'earth', Rect>> = {};
      for (const [k, node] of [['sun', sunRef.current], ['earth', earthRef.current]] as const) {
        if (!node || node.hidden) continue;
        const b = node.getBoundingClientRect();
        if (b.width === 0) continue;
        zones[k] = inflate(b, OWN_CLEAR.x, OWN_CLEAR.y);
        nameZones[k] = inflate(b, OWN_CLEAR.y);
      }
      const named = PATHS.map(([k]) => {
        const node = nameRefs.current[k], n = guide ? (l.pathNames?.find((p) => p.body === k) ?? null) : null;
        const text = n ? pathNameText(k, n.text) : '';
        if (node && n && node.textContent !== text) node.textContent = text;
        const dx = place(node, n);
        if (n) keepOff(node, n, dx, body, shownLabels);
        return node && !node.hidden ? node.getBoundingClientRect() : null;
      });
      const pathNamed = chipsShown(clearOfOwn(named, PATHS.map(([k]) => k), nameZones), shownLabels);
      pathNamed.forEach((on, k) => {
        const node = nameRefs.current[PATHS[k][0]];
        if (node && !on) node.hidden = true;
      });
      const taken = [...shownLabels, ...named.filter((b, k): b is DOMRect => !!b && pathNamed[k] && b.width > 0)];
      // The days with the guides only; a day the renderer has no place for stays hidden.
      const marks = guide ? (l.marks ?? []) : [];
      const chips = pathRefs.current.map((node, k) => {
        const m = marks[k];
        if (!m) {
          if (node) node.hidden = true;
          return null;
        }
        keepOff(node, m, place(node, m), body, taken);
        return node && !node.hidden ? node.getBoundingClientRect() : null;
      });
      chipsShown(clearOfOwn(chips, pathRefs.current.map((_, k) => sc.marks?.[k]?.body), zones), taken).forEach((on, k) => {
        const node = pathRefs.current[k];
        if (node && !on) node.hidden = true;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      el.removeEventListener('webglcontextlost', lost);
      if (rendererRef.current === r) rendererRef.current = null;
      r.dispose();
    };
  }, [createRenderer, generation]);

  const release = (id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setDragging(false);
    }
  };

  const turn = (dYaw: number, dPitch: number, zoom = 1) => {
    endOpening();
    exploreRef.current?.();
    const v = view.current;
    goal.current = null;
    intro.current = null;
    v.yaw = (v.yaw + dYaw + 360) % 360;
    v.pitch = Math.max(-35, Math.min(85, v.pitch + dPitch));
    v.fov = Math.max(14, Math.min(75, v.fov * zoom));
  };

  return (
    <>
      <canvas
        ref={canvas}
        role="application"
        aria-label="The view from the site. Drag or use the arrow keys to look around; plus and minus, the wheel or two fingers zoom."
        tabIndex={0}
        className={`fixed inset-0 h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          endOpening();
          exploreRef.current?.();
          goal.current = null;
          intro.current = null;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, fov: view.current.fov };
            drag.current = null;
          } else if (pointers.current.size === 1) {
            drag.current = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch };
            setDragging(true);
          }
        }}
        onPointerMove={(e) => {
          if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const p = pinch.current;
          if (p && pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            view.current.fov = Math.max(14, Math.min(75, (p.fov * p.dist) / (Math.hypot(a.x - b.x, a.y - b.y) || 1)));
            return;
          }
          const d = drag.current;
          if (!d) return;
          const k = view.current.fov / (e.currentTarget.clientHeight || window.innerHeight);
          view.current.yaw = (d.yaw - (e.clientX - d.x) * k + 360) % 360;
          view.current.pitch = Math.max(-35, Math.min(85, d.pitch + (e.clientY - d.y) * k));
        }}
        onPointerUp={(e) => release(e.pointerId)}
        onPointerCancel={(e) => release(e.pointerId)}
        onWheel={(e) => turn(0, 0, e.deltaY > 0 ? 1.08 : 0.93)}
        onKeyDown={(e) => {
          const keys: Record<string, [number, number, number?]> = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, 3], ArrowDown: [0, -3], '+': [0, 0, 0.93], '=': [0, 0, 0.93], '-': [0, 0, 1.08] };
          const k = keys[e.key];
          if (!k) return;
          e.preventDefault();
          turn(k[0], k[1], k[2]);
        }}
      />
      {/* The compass plate (18.3): as wide as the caption's plate, which docks on top of it (`docked`: square and open at the
          top, so the two read as one plate at the foot of the view); the compass strip in its middle, the facing line
          under it, and a key naming the dots. STRIP_H is its height. */}
      <div aria-hidden="true" hidden={clean} className="pointer-events-none fixed bottom-[calc(var(--bar-h,129px)+14px)] left-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 text-[#f2f0ea] max-xl:bottom-[calc(var(--bar-h,129px)+var(--look-h,52px)+14px)] max-md:hidden">
      <div data-plate="" data-strip="" className={`relative overflow-hidden rounded-[6px] border border-white/15 bg-[#060607]${docked ? ' rounded-t-none border-t-0' : ''}`}>
        <div className="relative mx-auto h-8" style={{ width: STRIP_W }}>
          {/* The ticks fade at the strip's ends; the letters show whole or not at all (letterShown), so none is cut or faint. */}
          <div className="absolute inset-0" style={{ maskImage: STRIP_FADE, WebkitMaskImage: STRIP_FADE }}>
            <div ref={trackRef} className="absolute inset-y-0 left-0" style={{ transform: `translateX(${STRIP_W / 2 - (startYaw + 360) * PX_PER_DEG}px)` }}>
              {TICKS.filter((d) => (((d % 360) + 360) % 360) % 45 !== 0).map((d) => (
                <i key={d} className="absolute bottom-1 h-2 w-px bg-white/45" style={{ left: (d + 360) * PX_PER_DEG }} />
              ))}
            </div>
          </div>
          <div ref={lettersRef} className="absolute inset-y-0 left-0" style={{ transform: `translateX(${STRIP_W / 2 - (startYaw + 360) * PX_PER_DEG}px)` }}>
            {TICKS.filter((d) => (((d % 360) + 360) % 360) % 45 === 0).map((d, k) => (
              <span
                key={d}
                data-point=""
                data-at={(d + 360) * PX_PER_DEG}
                ref={(node) => {
                  letterRefs.current[k] = node;
                }}
                className="absolute top-1 -translate-x-1/2 text-[14px] font-semibold transition-opacity duration-150 motion-reduce:transition-none"
                style={{ left: (d + 360) * PX_PER_DEG, opacity: letterShown(STRIP_W / 2 + (d - startYaw) * PX_PER_DEG, 6) ? 1 : 0 }}
              >
                {POINT[(((d % 360) + 360) % 360) / 45]}
              </span>
            ))}
          </div>
          <i className="absolute left-1/2 top-0 h-8 w-0.5 -translate-x-1/2 bg-white" />
          {BODIES.map(([k, , colour]) => (
            <i
              key={k}
              data-mark={k}
              ref={(node) => {
                markRefs.current[k] = node;
              }}
              hidden
              className={`absolute bottom-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 ${colour} data-[up=0]:bg-transparent`}
            />
          ))}
        </div>
        <p ref={facingRef} className="pb-1 text-center text-[15px] leading-5">
          {`Facing ${compassWord(startYaw)}`}
        </p>
        {/* The dots named, each by its colour (18.3): the Sun's gold, Earth's blue, the lander's white. */}
        <p data-key="" className="pb-2 text-center text-[14px] leading-none text-[#c3bfb6]">
          <i className="mr-1 inline-block size-2 rounded-full bg-[#f6b646]" />Sun
          <i className="ml-3 mr-1 inline-block size-2 rounded-full bg-[#74adff]" />Earth
          <i className="ml-3 mr-1 inline-block size-2 rounded-full bg-[#f2f0ea]" />lander
          <i className="ml-3 mr-1 inline-block size-2 rounded-full border-2 border-[#c3bfb6]" />below the horizon
        </p>
      </div>
      </div>
      {/* What lies beyond either side of the view: a pointer at that edge of the screen, at its height. */}
      <div aria-hidden="true" hidden={clean} className="pointer-events-none fixed inset-0 overflow-hidden">
        {BODIES.map(([k, name, colour]) => (
          <span
            key={k}
            data-pointer={k}
            ref={(node) => {
              pointerRefs.current[k] = node;
            }}
            hidden
            className="group absolute flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-[5px] border border-white/15 bg-black px-2 py-0.5 text-[14px] text-[#f2f0ea] data-[side=right]:flex-row-reverse"
          >
            <svg width="8" height="10" viewBox="0 0 8 10" className="shrink-0 fill-current group-data-[side=right]:rotate-180">
              <path d="M0 5 8 0v10z" />
            </svg>
            <i className={`h-2 w-2 shrink-0 rounded-full ${colour}`} />
            {/* On a phone the Sun's name alone, and Earth's with its angle (13.3), so the pointer stays short. */}
            <span className="max-md:hidden">{k === 'sun' ? pointerWords(sunLabel) : k === 'earth' ? pointerWords(earthLabel) : name}</span>
            <span className="md:hidden">{k === 'earth' ? pointerShort(earthLabel) : name}</span>
          </span>
        ))}
      </div>
      {/* On a phone, with no room for the strip: which way the view faces, small, at the top right of the view. */}
      {/* A panel, so the labels keep off it (part B's reads found Earth's label on it). */}
      <p
        ref={facingPhoneRef}
        data-plate=""
        aria-hidden="true"
        hidden={clean}
        className="pointer-events-none fixed right-4 top-[calc(var(--top-h,220px)+8px)] rounded-[6px] border border-white/15 bg-black px-2 py-0.5 text-[14px] text-[#f2f0ea] md:hidden"
      >
        {place ? `${place}, facing ${compassWord(startYaw)}` : `Facing ${compassWord(startYaw)}`}
      </p>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <span ref={sunRef} hidden data-sky="sun" className={`${LABEL} -translate-x-1/2 -translate-y-full text-[#f6b646]`}>
          {sunLabel}
        </span>
        <span ref={earthRef} hidden data-sky="earth" className={`${LABEL} -translate-x-1/2 -translate-y-full text-[#74adff]`}>
          {earthLabel}
        </span>
        {scene.lander && (
          <span ref={landerRef} hidden className={`${LABEL} -translate-x-1/2 -translate-y-full text-[#f2f0ea]`}>
            {`The lander, ${Math.round(scene.lander.distM)} m away`}
          </span>
        )}
        {(scene.marks ?? []).map((m, k) => (
          <span
            key={`${m.body}-${m.hour}`}
            ref={(node) => {
              pathRefs.current[k] = node;
            }}
            hidden
            data-path-mark=""
            className={`${LABEL} -translate-x-1/2 -translate-y-[140%] ${m.body === 'sun' ? 'text-[#f6d48a]' : 'text-[#a9c8ff]'}`}
          >
            {m.text}
          </span>
        ))}
        {/* Each path's name hangs just under it, in its body's colour; the renderer says where and in what words. */}
        {PATHS.map(([k, colour]) => (
          <span
            key={k}
            ref={(node) => {
              nameRefs.current[k] = node;
            }}
            hidden
            data-path-name={k}
            className={`${LABEL.replace('whitespace-nowrap', 'whitespace-pre')} -translate-x-1/2 translate-y-1/4 ${colour}`}
          />
        ))}
        <span ref={levelRef} hidden className={`${LABEL} translate-x-3 -translate-y-1/2 text-[#c3bfb6]`}>
          Level horizon
        </span>
        <span ref={shadowRef} hidden className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre-line rounded-[5px] border border-white/15 bg-black px-2 py-1 text-center text-[14px] leading-snug text-[#e4e1da]">
          Your shadow
        </span>
        {scene.lander &&
          PARTS.map(([k, name, sides]) => (
            <span
              key={k}
              ref={(node) => {
                partRefs.current[k] = node;
              }}
              hidden
              data-side={sides[0]}
              style={{ transform: PART_SIDE[sides[0]] }}
              className="group pointer-events-none absolute flex items-center data-[side=above]:flex-col-reverse data-[side=below]:flex-col data-[side=left]:flex-row-reverse"
            >
              <i className="block shrink-0 bg-white/70 group-data-[side=above]:h-5 group-data-[side=above]:w-px group-data-[side=below]:h-5 group-data-[side=below]:w-px group-data-[side=left]:h-px group-data-[side=left]:w-[26px] group-data-[side=right]:h-px group-data-[side=right]:w-[26px]" />
              <span data-text="" ref={k === 'lamp' ? lampTextRef : undefined} className="whitespace-nowrap rounded-[5px] border border-white/15 bg-black px-2 py-1 text-[14px] text-[#e4e1da]">
                {name}
              </span>
            </span>
          ))}
        {[...(scene.sky.names ?? []).map((n) => n.name), ...(crossStars(scene.sky.names) ? ['Southern Cross'] : [])].map((name, k) => (
          <span
            key={name}
            ref={(node) => {
              starRefs.current[k] = node;
            }}
            hidden
            style={{ transform: SIDE.right }}
            className="pointer-events-none absolute whitespace-nowrap text-[14px] text-[#d7d4cc] [text-shadow:0_0_4px_#000]"
          >
            {starLabel(name)}
          </span>
        ))}
      </div>
    </>
  );
}
