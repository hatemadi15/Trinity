// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { cachedTexture, releaseCachedTextures } from './textureCache';

describe('the texture cache', () => {
  it('gives one texture per address, marked shared, for the page’s life', () => {
    const a = cachedTexture('a.jpg', true), b = cachedTexture('a.jpg', true);
    expect(b).toBe(a);
    expect(a.texture.userData.shared).toBe(true);
  });

  it('lets a renderer that goes give the textures’ GPU copies back, keeping each texture for the next renderer to upload again', () => {
    const { texture } = cachedTexture('b.jpg', false);
    const freed = vi.fn();
    texture.addEventListener('dispose', freed);
    releaseCachedTextures();
    // Every renderer listening frees its copy and stops listening (three's own dispose event)...
    expect(freed).toHaveBeenCalledTimes(1);
    // ... and the texture stays in the cache, its image kept, so nothing is fetched again.
    expect(cachedTexture('b.jpg', false).texture).toBe(texture);
    expect(texture).toBeInstanceOf(THREE.Texture);
  });
});
