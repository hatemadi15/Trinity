import { starColour, type Stars } from './stars';

/** The ecliptic's tilt to the Earth's equator (J2000), radians. */
const OBLIQUITY = (23.4393 * Math.PI) / 180;

/** A star of the header band: where it sits (CSS pixels from the band's bottom middle, y up), its radius, opacity and colour. */
export interface BandStar {
  x: number;
  y: number;
  r: number;
  alpha: number;
  rgb: [number, number, number];
}

/**
 * The low sky over the Moon's south pole, for the band of stars behind each page's header (spec 6): the
 * catalogue's stars from the horizon up, at a fixed hour. The Moon's axis stands within 1.6° of the ecliptic's,
 * so at its south pole a star's height is close to minus its ecliptic latitude, and the hour only turns the sky
 * about the zenith. The band is centred on ecliptic longitude `centreLonDeg`: 255° is Scorpius and Sagittarius,
 * the brightest stretch of the Milky Way. It runs `pxPerDeg` CSS pixels to the degree both ways. Only the stars
 * inside `widthPx` × `heightPx` are returned, faintest first, so the bright ones are drawn on top. They are small
 * (0.8 to 1.6 px), faint (0.14 to 0.55 opaque by magnitude) and pale (halfway to white), so none reads as a stray dot
 * under the header (both readers, part C read 1), and they fade out over the band's lowest third, so they never end
 * in a hard line just above the words.
 */
export function bandStars(stars: Stars, widthPx: number, heightPx: number, pxPerDeg = 16, centreLonDeg = 255): BandStar[] {
  const cosE = Math.cos(OBLIQUITY), sinE = Math.sin(OBLIQUITY);
  const out: BandStar[] = [], mags: number[] = [];
  for (let i = 0; i < stars.count; i++) {
    const x = stars.j2000[i * 3], y = stars.j2000[i * 3 + 1], z = stars.j2000[i * 3 + 2];
    const ye = y * cosE + z * sinE, ze = -y * sinE + z * cosE;
    const up = (Math.asin(Math.max(-1, Math.min(1, -ze))) * 180) / Math.PI;
    if (up < 0) continue;
    const lon = ((((Math.atan2(ye, x) * 180) / Math.PI) % 360) + 360) % 360;
    const d = ((lon - centreLonDeg + 540) % 360) - 180;
    const px = d * pxPerDeg, py = up * pxPerDeg;
    if (Math.abs(px) > widthPx / 2 || py > heightPx) continue;
    const m = stars.vmag[i];
    const fade = Math.min(1, py / (heightPx / 3));
    const c = starColour(stars.bv[i]), pale = (v: number) => Math.round(((v + 1) / 2) * 255);
    out.push({
      x: px,
      y: py,
      r: Math.max(0.8, Math.min(1.6, 2.4 - 0.3 * m)),
      alpha: Math.min(0.55, Math.max(0.14, 0.8 * 10 ** (-0.4 * (m - 1)))) * fade,
      rgb: [pale(c[0]), pale(c[1]), pale(c[2])],
    });
    mags.push(m);
  }
  return out.map((s, k) => [s, mags[k]] as const).sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
