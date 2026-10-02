import { parseMoonOrientation, type MoonOrientation } from '../sky/moonOrientation';
import { parseStars, type Stars } from '../sky/stars';
import { fetchBytes, fetchJson } from './loaders';

/** What the stand view's sky needs: the stars, the Moon's orientation, and NASA's Earth maps. */
export interface SkyAssets { stars: Stars; moon: MoonOrientation; earthDayUrl: string; earthCloudsUrl: string }

const own = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export async function loadSkyAssets(base: string): Promise<SkyAssets> {
  const [starsMeta, starBytes, moonMeta, moonBytes] = await Promise.all([
    fetchJson<{ count: number }>(`${base}/sky/stars.json`),
    fetchBytes(`${base}/sky/stars.bin`),
    fetchJson<{ start_utc: string; step_hours: number; count: number }>(`${base}/sky/moon_me_6h.json`),
    fetchBytes(`${base}/sky/moon_me_6h.f32`),
  ]);
  return {
    stars: parseStars(own(starBytes), starsMeta.count),
    moon: parseMoonOrientation(own(moonBytes), moonMeta),
    earthDayUrl: `${base}/sky/earth_day_2048.jpg`,
    earthCloudsUrl: `${base}/sky/earth_clouds_2048.jpg`,
  };
}
