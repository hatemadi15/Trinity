import { parseMoonOrientation, type MoonOrientation } from '../sky/moonOrientation';
import { parseStars, type Stars } from '../sky/stars';
import { fetchBytes, fetchJson } from './loaders';

/** What the stand view's sky needs: the stars (with the brightest ones' names), the Moon's orientation, and NASA's Earth maps. */
export interface SkyAssets { stars: Stars; moon: MoonOrientation; earthDayUrl: string; earthCloudsUrl: string; names?: { index: number; name: string }[] }

const own = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export async function loadSkyAssets(base: string): Promise<SkyAssets> {
  const [starsMeta, starBytes, moonMeta, moonBytes, names] = await Promise.all([
    fetchJson<{ count: number }>(`${base}/sky/stars.json`),
    fetchBytes(`${base}/sky/stars.bin`),
    fetchJson<{ start_utc: string; step_hours: number; count: number }>(`${base}/sky/moon_me_6h.json`),
    fetchBytes(`${base}/sky/moon_me_6h.f32`),
    // The names are an extra: without the file the stars show unnamed.
    fetchJson<{ names: { index: number; name: string }[] }>(`${base}/sky/star_names.json`).then((d) => d.names, () => []),
  ]);
  return {
    stars: parseStars(own(starBytes), starsMeta.count),
    moon: parseMoonOrientation(own(moonBytes), moonMeta),
    earthDayUrl: `${base}/sky/earth_day_2048.jpg`,
    earthCloudsUrl: `${base}/sky/earth_clouds_2048.jpg`,
    names,
  };
}
