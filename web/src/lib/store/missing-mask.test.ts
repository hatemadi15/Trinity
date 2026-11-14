import { describe, expect, it } from 'vitest';
import { fileLoaders } from '../../test/file-loaders';
import { createExploreStore } from './explore';

/** Loaders whose horizon file for one site is missing from the server, as a 404 reads. */
function withoutMask(id: string) {
  const files = fileLoaders();
  return fileLoaders({
    loadMask: (asked: string) => (asked === id ? Promise.reject(new Error(`could not load /data/masks/${asked}.json (HTTP 404)`)) : files.loadMask(asked)),
  });
}

describe('a site whose horizon file is missing', () => {
  it('becomes the selected site with no figures and a plain sentence, never the last site’s figures under a raw error', async () => {
    const store = createExploreStore(withoutMask('nobile_rim_2'));
    await store.getState().init();
    const before = store.getState().site?.id;
    expect(before).not.toBe('nobile_rim_2');
    await store.getState().selectSite('nobile_rim_2');
    const s = store.getState();
    // The page now speaks of the site asked for, and shows nothing that belongs to the one before.
    expect(s.site?.id).toBe('nobile_rim_2');
    expect(s.series).toBeNull();
    expect(s.summary).toBeNull();
    expect(s.power).toBeNull();
    expect(s.mask).toBeNull();
    // In plain words: what is missing and that the other sites still work; no path, no status code.
    expect(s.error).toMatch(/Nobile Rim 2.*horizon file is not on this server/);
    expect(s.error).toMatch(/other sites still work/i);
    expect(s.error).not.toMatch(/\/data\/|HTTP|404|\.json/);
  });

  it('lets the next site load as usual afterwards', async () => {
    const store = createExploreStore(withoutMask('nobile_rim_2'));
    await store.getState().init();
    await store.getState().selectSite('nobile_rim_2');
    await store.getState().selectSite('haworth');
    const s = store.getState();
    expect(s.site?.id).toBe('haworth');
    expect(s.series).not.toBeNull();
    expect(s.error).toBeNull();
  });
});
