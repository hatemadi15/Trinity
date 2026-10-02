/** Geometry and words for the shadow map: its scale bar, the arrows to the Sun and Earth. */

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

/** "Sun 2° up", or "Earth below the horizon". */
export function heightWords(name: 'Sun' | 'Earth', elDeg: number): string {
  return elDeg < 0 ? `${name} below the horizon` : `${name} ${Math.round(elDeg)}° up`;
}
