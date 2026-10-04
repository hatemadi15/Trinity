import * as THREE from 'three';

const cache = new Map<string, { texture: THREE.Texture; ready: Promise<THREE.Texture> }>();

/**
 * One texture per address for the page's life: a scene rebuilt as data arrives takes it as it is, already
 * loaded, so nothing flickers back to a placeholder. It is marked shared, and disposing a scene leaves it.
 */
export function cachedTexture(url: string, srgb: boolean): { texture: THREE.Texture; ready: Promise<THREE.Texture> } {
  const hit = cache.get(url);
  if (hit) return hit;
  let texture!: THREE.Texture;
  const ready = new Promise<THREE.Texture>((resolve, reject) => {
    texture = new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
  ready.catch(() => {}); // a map that fails to load leaves the smaller one, or the plain colour
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.userData.shared = true;
  const entry = { texture, ready };
  cache.set(url, entry);
  return entry;
}
