/*
 * The home page's descent (spec 23.1): one picture from first screen to last. As the page scrolls the Moon turns, tips
 * its south pole towards us and comes closer, all the way down to one landing site. Four of the app's own pictures
 * lie on the one globe, each in its place: NASA's Moon from space, the relief map of the pole (500 km across, as
 * Choose a site shows it), the shadows round the site (82 km across) and the shadow picture of the site (20 km
 * across), all in the south polar stereographic projection the pipeline uses. Nothing swaps: the closer the view,
 * the finer the picture under it.
 *
 * Plain numbers with no data file, so the scene can take it to the browser and the tests need no WebGL; the words
 * are in descent.ts, worked out on the server.
 */

/** The Moon's radius in km, as the pipeline's stereographic maps take it. */
export const R_MOON_KM = 1737.4;

/** South polar stereographic, true scale at the pole, in km: x = ρ sin λ, y = ρ cos λ (pipeline: ps_south_xy_m). */
export function psSouthKm(latDeg: number, lonDeg: number): { x: number; y: number } {
  const rho = 2 * R_MOON_KM * Math.tan(((90 - Math.abs(latDeg)) * Math.PI) / 360);
  const lon = (lonDeg * Math.PI) / 180;
  return { x: rho * Math.sin(lon), y: rho * Math.cos(lon) };
}

/** The inverse: a point of the stereographic plane, in km, as latitude and longitude in degrees. */
export function psSouthLatLon(x: number, y: number): { lat: number; lon: number } {
  const rho = Math.hypot(x, y);
  return { lat: -90 + (2 * Math.atan(rho / (2 * R_MOON_KM)) * 180) / Math.PI, lon: (Math.atan2(x, y) * 180) / Math.PI };
}

/** A pin of the relief map (u right, v down, 0 to 1 across `halfKm` × 2) as a point of the plane, in km. */
export const reliefKm = (u: number, v: number, halfKm: number) => ({ x: (u - 0.5) * 2 * halfKm, y: (0.5 - v) * 2 * halfKm });

/**
 * A point on the unit globe as three.js's sphere has it (u = φ / 2π, and the Moon's map centred on 0° longitude, so
 * φ = λ + π): x = −cos φ cos β, y = sin β, z = sin φ cos β, for latitude β.
 */
export function globePoint(latDeg: number, lonDeg: number): [number, number, number] {
  const b = (latDeg * Math.PI) / 180, phi = ((lonDeg + 180) * Math.PI) / 180;
  return [-Math.cos(phi) * Math.cos(b), Math.sin(b), Math.sin(phi) * Math.cos(b)];
}

/** The descent's stages, each a stretch of the scroll (0 to 1) and a stop the rail can jump to. */
export const STAGES = [
  { id: 'moon', label: 'The Moon', from: 0, to: 0.07, stop: 0 },
  { id: 'turn', label: 'It turns', from: 0.15, to: 0.34, stop: 0.25 },
  { id: 'pole', label: 'The south pole', from: 0.44, to: 0.62, stop: 0.54 },
  { id: 'site', label: 'The site', from: 0.8, to: 0.87, stop: 0.83 },
  { id: 'answer', label: 'The answer', from: 0.95, to: 1, stop: 1 },
] as const;
export type StageId = (typeof STAGES)[number]['id'];

/**
 * How much of a stage's words show at progress `p`: in over 0.04 before it, out over 0.04 after it (the ends stay).
 * Between two stages one has gone before the next comes, so two lines of words never stand on each other.
 */
export function stageOpacity(stage: (typeof STAGES)[number], p: number): number {
  const fade = 0.04;
  const rise = stage.from <= 0 ? 1 : Math.min(1, Math.max(0, (p - (stage.from - fade)) / fade));
  const fall = stage.to >= 1 ? 1 : Math.min(1, Math.max(0, (stage.to + fade - p) / fade));
  return Math.min(rise, fall);
}

/** The stage the progress is in or nearest to, for the rail. */
export function stageAt(p: number): StageId {
  let best: (typeof STAGES)[number] = STAGES[0], d = Infinity;
  for (const s of STAGES) {
    const k = p < s.from ? s.from - p : p > s.to ? p - s.to : 0;
    if (k < d) {
      d = k;
      best = s;
    }
  }
  return best.id;
}

/** Clamped to 0..1. */
const unit = (t: number) => Math.min(1, Math.max(0, t));
/**
 * Slow, then faster, fast, then slow: the smootherstep, whose speed and acceleration are both nil at either end, so a
 * motion never starts or stops with a jolt.
 */
export const ease = (t: number) => {
  const x = unit(t);
  // Never a hair past 1 by rounding: a picture that is whole reads as exactly 1.
  return Math.min(1, x * x * x * (x * (x * 6 - 15) + 10));
};
const between = (p: number, a: number, b: number) => ease((p - a) / (b - a));

/** Full turns the Moon makes as it comes down, settling on the site. */
export const TURNS = 1.25;
/** How far the descent runs to its last view, the site, as a share of the scroll: where the site's words start to come in. */
const AT_SITE = 0.76;
/**
 * The turn has settled here, before the site's shadows come in (they show from 0.6), so they arrive upright, as on the
 * Choose a site map, and never turn under the eye.
 */
export const SPIN_DONE = 0.6;
/**
 * The dive from the polar map to the site. The map is 480 m a pixel and the site's picture 20 m, too far apart to
 * meet: between them lies the same hour's shadows 82 km across (160 m a pixel), which come in here with a wide soft
 * edge, in the map's place, before the view is close enough for the map to blur. The site's own picture sharpens
 * inside them a little later, as a lens finds its focus; both are whole well before the site's words.
 */
export const WIDE_IN = [SPIN_DONE, 0.65] as const;
export const SITE_IN = [SPIN_DONE, 0.665] as const;
/**
 * The first screen's words are gone here (their stage ends at 0.07 and fades out over 0.04): the Moon keeps its first
 * place and size until then, so it never moves under the words while they still show.
 */
export const WORDS_GONE = 0.11;
/** Where the Moon has left the first screen's place for the middle of the view. */
const CENTRED = 0.3;

/**
 * The first screen's Moon for the camera: the centre of its disc in the view's own measure (−1 to 1 across and up),
 * and the zoom that gives it its size.
 */
export interface FirstScreen {
  nx: number;
  ny: number;
  zoom: number;
}

/** The first screen when the page has not measured its words yet: right of them on a wide view, under them on a tall one. */
export function defaultFirst(aspect: number): FirstScreen {
  const zMoon = 0.78 * Math.min(1, aspect);
  return aspect >= 1 ? { nx: 0.4, ny: 0, zoom: zMoon * 0.97 } : { nx: 0, ny: -0.46, zoom: zMoon * 0.9 };
}

/** A disc in the picture's pixels, x right and y down from its top left corner. */
export interface Disc {
  cx: number;
  cy: number;
  r: number;
}

/** The first screen's disc as the camera takes it, for a picture `w` by `h` px. */
export function firstFromDisc(d: Disc, w: number, h: number): FirstScreen {
  return { nx: (d.cx - w / 2) / (w / 2), ny: (h / 2 - d.cy) / (h / 2), zoom: (2 * d.r) / h };
}

export interface DescentPose {
  /** The tip of the polar axis towards us, radians: −π/2 has the south pole facing the camera. */
  tilt: number;
  /** Turns about the polar axis since the start, radians; the scene adds its own resting turn. */
  spin: number;
  /** The camera's zoom: the view is 2 / zoom units tall, the Moon 2 units across. */
  zoom: number;
  /** How far the view has moved from the Moon's centre, through the pole, to the site: 0 the centre, 1 the site. */
  toSite: number;
  /** How much of the first screen's place the Moon keeps: 1 on the first screen, 0 once it is in the middle. */
  offset: number;
  /** Where the Moon's centre stands in the view (−1 to 1 across and up): the first screen's place, then the middle. */
  shiftX: number;
  shiftY: number;
  /** How much of each finer picture shows: the polar relief map, the shadows round the site (as the map dims round
   * them) and the site's own shadow picture, sharpening inside those. */
  relief: number;
  wide: number;
  site: number;
  /** How far the site's picture has drawn out its soft edge: 0 a wide one, as it sharpens inside the shadows round it;
   * 1 at the site, where the picture is sharp to the edge of the view. */
  focus: number;
  /** Earth beside the Moon: gone once the Moon fills the view. */
  earth: number;
}

/**
 * Where the camera is and what shows at progress `p` (0 to 1) for a view of `aspect` (width / height), with the first
 * screen's Moon where `first` puts it (beside or under the words, measured by the page). The zoom is eased on a log
 * scale between its stops, so each doubling of the closeness takes as long as the last and each move starts and ends
 * gently: from the whole Moon (it fills four fifths of the view's shorter side) to the polar cap (the 500 km map fills
 * it) to the site (its 20 km picture covers the whole view, a tenth to spare, so no frame of blurred map is left
 * round it). Nothing moves before the first screen's words have gone.
 */
export function descentPose(p: number, aspect: number, sizes: { reliefHalfKm: number; windowKm: number }, first: FirstScreen = defaultFirst(aspect)): DescentPose {
  const short = Math.min(1, aspect);
  const zMoon = 0.78 * short;
  const zPole = (2 * short) / ((2 * sizes.reliefHalfKm) / R_MOON_KM);
  const zSite = (1.1 * 2 * Math.max(1, aspect)) / (sizes.windowKm / R_MOON_KM);
  // Never closer and then farther: a first screen with a big Moon holds its size until the pole comes nearer.
  const z0 = Math.min(first.zoom, zPole);
  const keys: [number, number][] = [
    [0, z0],
    [WORDS_GONE, z0],
    [0.28, Math.max(zMoon, z0)],
    [0.55, zPole],
    [AT_SITE, zSite],
    [1, zSite * 1.12],
  ];
  let zoom = keys[keys.length - 1][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [pa, za] = keys[i], [pb, zb] = keys[i + 1];
    if (p <= pb) {
      zoom = Math.exp(Math.log(za) + (Math.log(zb) - Math.log(za)) * ease((p - pa) / (pb - pa)));
      break;
    }
  }
  const offset = 1 - between(p, WORDS_GONE, CENTRED);
  return {
    tilt: -0.32 - (Math.PI / 2 - 0.32) * between(p, 0.08, 0.42),
    spin: -TURNS * 2 * Math.PI * (1 - ease(p / SPIN_DONE)),
    zoom,
    // On the site before its picture is whole, so the shadows grow from the middle of the view, the same on every side.
    toSite: between(p, 0.5, SITE_IN[1]),
    offset,
    shiftX: first.nx * offset,
    shiftY: first.ny * offset,
    relief: between(p, 0.3, 0.44),
    wide: between(p, WIDE_IN[0], WIDE_IN[1]),
    site: between(p, SITE_IN[0], SITE_IN[1]),
    focus: between(p, SITE_IN[1], AT_SITE),
    earth: 1 - between(p, 0.12, 0.32),
  };
}

/** A box in the picture's pixels: left, top, right, bottom. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The free room the first screen's Moon is fitted to. */
export interface FirstMoon extends Disc {
  /** Right of the words (a wide view) or under them (a tall one). */
  side: 'beside' | 'below';
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Where the first screen's Moon stands, as large as the room allows and never under the words (the eyebrow, the title,
 * the sentence and the buttons) nor the stages' rail: in the room right of the words, or in the room under them,
 * whichever holds the larger Moon. Right of the words it keeps to the part of the picture on screen before the page has
 * scrolled (`seen` px from its top), so it shows whole at once; under them it may run on past the window's foot, a Moon
 * rising over the edge of a phone. `view` is the picture (the sticky screen) in px; the boxes are in its pixels.
 */
export function firstMoon(view: { w: number; h: number; seen: number }, words: Box, rail: Box | null): FirstMoon {
  const margin = Math.max(16, Math.min(48, view.w * 0.03));
  const gap = Math.max(24, Math.min(64, view.w * 0.04));
  /** The right edge of a room spanning `y0` to `y1`: short of the rail where the rail stands beside it. */
  const rightOf = (y0: number, y1: number) => (rail && rail.y0 < y1 && y0 < rail.y1 ? Math.min(view.w - margin, rail.x0 - gap / 2) : view.w - margin);
  const seen = Math.max(0, Math.min(view.h, view.seen));
  const beside = { x0: words.x1 + gap, y0: margin, y1: Math.max(margin, seen - margin), x1: 0 };
  beside.x1 = rightOf(beside.y0, beside.y1);
  const below = { x0: margin, y0: words.y1 + gap, y1: view.h - margin, x1: 0 };
  below.x1 = rightOf(below.y0, below.y1);
  const size = (b: Box) => Math.max(0, Math.min(b.x1 - b.x0, b.y1 - b.y0));
  const side = size(below) > size(beside) ? 'below' : 'beside';
  const room = side === 'below' ? below : beside;
  // A Moon at least a few pixels across, even in a window too small for one: it never grows into the words.
  const r = Math.max(4, Math.min(size(room), 0.86 * view.h) / 2);
  return { cx: (room.x0 + room.x1) / 2, cy: (room.y0 + room.y1) / 2, r, side };
}

/**
 * Where Earth stands beside the first screen's Moon: off its lower left limb right of the words, off its upper right
 * limb under them, else the first spot round it that is clear of the words, the rail, anything else in `avoid` (Luna at
 * the corner) and the picture's edges.
 */
export function earthSpot(view: { w: number; h: number }, moon: FirstMoon, words: Box, rail: Box | null, avoid: Box[] = []): Disc {
  const r = Math.max(14, Math.min(42, moon.r * 0.13));
  const d = moon.r + r * 1.5 + 10;
  // Directions round the Moon, x right and y down, the preferred first.
  const tries = (moon.side === 'beside' ? [135, 225, 45, 180, 315, 90, 270, 0] : [315, 225, 0, 180, 270, 45, 135, 90]).map((deg) => (deg * Math.PI) / 180);
  const pad = 12;
  const clear = (x: number, y: number) => {
    const b = { x0: x - r - pad, y0: y - r - pad, x1: x + r + pad, y1: y + r + pad };
    // The rail is a thin line of dots: Earth may come closer to it than to the words.
    const near = { x0: x - r - 4, y0: y - r - 4, x1: x + r + 4, y1: y + r + 4 };
    return b.x0 >= 0 && b.y0 >= 0 && b.x1 <= view.w && b.y1 <= view.h && !overlaps(b, words) && !(rail && overlaps(near, rail)) && !avoid.some((a) => overlaps(b, a));
  };
  for (const a of tries) {
    const x = moon.cx + d * Math.cos(a), y = moon.cy + d * Math.sin(a);
    if (clear(x, y)) return { cx: x, cy: y, r };
  }
  const a = tries[0];
  return { cx: moon.cx + d * Math.cos(a), cy: moon.cy + d * Math.sin(a), r };
}
