/** Geometry and words for the shadow map: its scale bar, the arrows to the Sun and Earth, where the words go. */
import { labelBox, placeMapLabels, plateSize, type LabelBox } from './maplabels';

const ROUND_KM = [0.5, 1, 2, 5, 10, 20, 50];

/** The longest round length (km) that fits in a quarter of a picture this many kilometres wide. */
export function scaleBarKm(widthKm: number): number {
  const room = widthKm / 4;
  let best = ROUND_KM[0];
  for (const km of ROUND_KM) if (km <= room) best = km;
  return best;
}

/** Where an arrow from the middle of a square map ends: along the map bearing (map-up = 0, clockwise), 42 % of the side out. */
export function arrowEnd(bearingDeg: number, sizePx: number): { x: number; y: number } {
  const b = (bearingDeg * Math.PI) / 180;
  const c = sizePx / 2;
  return { x: c + Math.sin(b) * 0.42 * sizePx, y: c - Math.cos(b) * 0.42 * sizePx };
}

/**
 * Where the words at an arrow's end (a point in percent of the map) sit: near the left edge they hang
 * to the right of the point, near the right edge to the left, elsewhere they are centred on it; kept
 * inside the map. Returns the CSS position and the box in fractions of a map `sizePx` pixels wide.
 */
export function arrowPlate(end: { x: number; y: number }, text: string, sizePx: number): { left: number; top: number; across: string; box: LabelBox } {
  const left = Math.min(99, Math.max(1, end.x));
  const top = Math.min(94, Math.max(6, end.y));
  const across = end.x < 25 ? '0' : end.x > 75 ? '-100%' : '-50%';
  const { w, h } = plateSize(text, sizePx);
  const x = left / 100 - (across === '0' ? 0 : across === '-100%' ? w : w / 2);
  return { left, top, across, box: { x, y: top / 100 - h / 2, w, h } };
}

/** The site's name beside the pin at the centre, clear of `keepOut` (the arrows' words, the scale bar); below the pin if nothing is clear. */
export function siteNameBox(name: string, keepOut: LabelBox[], sizePx: number): LabelBox {
  return placeMapLabels([{ id: 'site', u: 0.5, v: 0.5, text: name }], sizePx, keepOut).get('site')?.box ?? labelBox(0.5, 0.5, name, 'below', sizePx);
}

export type Corner = 'tl' | 'tr' | 'br';
/** The corners the compass may take (percent of the map); the bottom left holds the scale bar. */
const CORNERS: [Corner, number, number][] = [
  ['tl', 8, 8],
  ['tr', 92, 8],
  ['br', 92, 92],
];

/** The corner for the compass: the one farthest from the ends of the arrows (points in percent of the map). */
export function compassCorner(ends: { x: number; y: number }[]): Corner {
  let best: Corner = 'tr';
  let far = -1;
  for (const [corner, x, y] of CORNERS) {
    const d = Math.min(...ends.map((e) => Math.hypot(e.x - x, e.y - y)));
    if (d > far) {
      far = d;
      best = corner;
    }
  }
  return best;
}

/** "Sun 2° up", or "Earth below the horizon". */
export function heightWords(name: 'Sun' | 'Earth', elDeg: number): string {
  return elDeg < 0 ? `${name} below the horizon` : `${name} ${Math.round(elDeg)}° up`;
}
