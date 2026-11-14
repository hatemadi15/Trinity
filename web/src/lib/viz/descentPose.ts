/*
 * The home page's descent (spec 23.1): one picture from first screen to last. As the page scrolls the Moon turns, tips
 * its south pole towards us and comes closer, all the way down to one landing site. Three of the app's own pictures
 * lie on the one globe, each in its place: NASA's Moon from space, the relief map of the pole (500 km across, as
 * Choose a site shows it) and the shadow picture of the site (20 km across), all three in the south polar
 * stereographic projection the pipeline uses. Nothing swaps: the closer the view, the finer the picture under it.
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
  { id: 'site', label: 'The site', from: 0.72, to: 0.84, stop: 0.79 },
  { id: 'answer', label: 'The answer', from: 0.92, to: 1, stop: 1 },
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

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const between = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
/** Eases out: fast at first, settling at the end. */
const settle = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Full turns the Moon makes as it comes down, settling on the site. */
export const TURNS = 1.25;
/** How far the descent runs to its last view, the site, as a share of the scroll. */
const AT_SITE = 0.82;

export interface DescentPose {
  /** The tip of the polar axis towards us, radians: −π/2 has the south pole facing the camera. */
  tilt: number;
  /** Turns about the polar axis since the start, radians; the scene adds its own resting turn. */
  spin: number;
  /** The camera's zoom: the view is 2 / zoom units tall, the Moon 2 units across. */
  zoom: number;
  /** How far the view has moved from the Moon's centre, through the pole, to the site: 0 the centre, 1 the site. */
  toSite: number;
  /** The first screen's offset of the Moon, as a share of the half-view: right of the words on a wide screen, under them on a tall one. */
  offset: number;
  /** How much of each finer picture shows: the polar relief map, the site's shadow picture. The site's comes in while
   * it is still a small square on the map, so the view dives into it. */
  relief: number;
  site: number;
  /** Earth beside the Moon: gone once the Moon fills the view. */
  earth: number;
}

/**
 * Where the camera is and what shows at progress `p` (0 to 1) for a view of `aspect` (width / height). The zoom is
 * eased on a log scale, so each doubling of the closeness takes as long as the last: from the whole Moon (it fills
 * four fifths of the view's shorter side) to the polar cap (the 500 km map fills it) to the site (its 20 km picture
 * fills nine tenths of it).
 */
export function descentPose(p: number, aspect: number, sizes: { reliefHalfKm: number; windowKm: number }): DescentPose {
  const short = Math.min(1, aspect);
  const zMoon = (0.78 * 2 * short) / 2;
  const zPole = (2 * short) / ((2 * sizes.reliefHalfKm) / R_MOON_KM);
  const zSite = (0.92 * 2 * short) / (sizes.windowKm / R_MOON_KM);
  const z0 = zMoon * (aspect >= 1 ? 0.97 : 0.9);
  const keys: [number, number][] = [
    [0, z0],
    [0.28, zMoon],
    [0.55, zPole],
    [AT_SITE, zSite],
    [1, zSite * 1.12],
  ];
  let zoom = keys[keys.length - 1][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [pa, za] = keys[i], [pb, zb] = keys[i + 1];
    if (p <= pb) {
      zoom = Math.exp(Math.log(za) + (Math.log(zb) - Math.log(za)) * smooth((p - pa) / (pb - pa)));
      break;
    }
  }
  return {
    tilt: -0.32 - (Math.PI / 2 - 0.32) * between(p, 0.08, 0.42),
    spin: -TURNS * 2 * Math.PI * (1 - settle(p / AT_SITE)),
    zoom,
    toSite: between(p, 0.5, 0.78),
    offset: 1 - between(p, 0.04, 0.26),
    relief: between(p, 0.3, 0.44),
    site: between(p, 0.6, 0.7),
    earth: 1 - between(p, 0.12, 0.32),
  };
}

