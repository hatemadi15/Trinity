export const EL_MIN = -10;
/** Elevation where the magnified horizon band starts: the outer half of the radius covers EL_MIN..EL_BAND. */
export const EL_BAND = 10;
const DEG = Math.PI / 180;

/**
 * Radius for an elevation with a two-zone scale: the inner half of the disc spans EL_BAND..90°
 * (zenith at the centre) and the outer half magnifies the horizon band EL_MIN..EL_BAND, where
 * everything at the lunar poles happens (the Sun never rises above 1.6°, Earth stays within ±7°).
 */
export function domeRadius(elDeg: number, R: number): number {
  const el = Math.max(EL_MIN, Math.min(90, elDeg));
  if (el >= EL_BAND) return (0.5 * R * (90 - el)) / (90 - EL_BAND);
  return 0.5 * R + (0.5 * R * (EL_BAND - el)) / (EL_BAND - EL_MIN);
}

export function domeProject(azDeg: number, elDeg: number, R: number): { x: number; y: number } {
  const r = domeRadius(elDeg, R);
  return { x: r * Math.sin(azDeg * DEG), y: -r * Math.cos(azDeg * DEG) };
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

export function skylinePath(mask: ArrayLike<number>, R: number): string {
  const n = mask.length;
  const parts: string[] = [];
  for (let k = 0; k < n; k++) {
    const { x, y } = domeProject((k * 360) / n, mask[k], R);
    parts.push(`${k === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`);
  }
  return `${parts.join('')}Z`;
}

/** Outer rim minus the skyline (fill-rule evenodd) = the ground below the terrain horizon. */
export function groundPath(mask: ArrayLike<number>, R: number): string {
  return `M${fmt(-R)} 0A${fmt(R)} ${fmt(R)} 0 1 0 ${fmt(R)} 0A${fmt(R)} ${fmt(R)} 0 1 0 ${fmt(-R)} 0Z${skylinePath(mask, R)}`;
}

/** Polyline through (az, el) samples [from, to); NaN samples break the line. */
export function trackPath(az: ArrayLike<number>, el: ArrayLike<number>, R: number, from: number, to: number, every = 1): string {
  let d = '';
  let pen = false;
  for (let i = from; i < to; i += every) {
    if (Number.isNaN(az[i]) || Number.isNaN(el[i])) {
      pen = false;
      continue;
    }
    const { x, y } = domeProject(az[i], el[i], R);
    d += `${pen ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`;
    pen = true;
  }
  return d;
}
