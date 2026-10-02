import { useEffect, useRef, useState } from 'react';
import type { Level } from '../engine/shadow';
import type { ShadowPicture } from '../engine/shadow-handler';
import { ShadowClient } from '../shadow-client';

/** What the hook needs of the shadow worker's client (a stub in tests). */
export interface ShadowSource {
  setLevels: (key: string, levels: Level[]) => Promise<void>;
  picture: (key: string, bearingDeg: number, elDeg: number, half: boolean) => Promise<ShadowPicture | null>;
}

/** A full-resolution picture is asked for once the hour has rested this long. */
export const REST_MS = 250;

let shared: ShadowClient | null = null;
const defaultClient = (): ShadowSource => (shared ??= new ShadowClient());

/**
 * The shadow picture of a site's terrain for one Sun: the levels are handed to the worker once per
 * key (the key names the levels, so new levels need a new key); each hour gets a quick half-resolution
 * picture, and the full one once the hour rests. While switched off it asks for nothing and keeps the
 * last picture. A picture of other levels (an earlier site) is never returned, and a failed sweep
 * leaves the last picture in place.
 */
export function useShadowPicture(levels: Level[], levelsKey: string, bearingDeg: number, elDeg: number, { enabled = true, client }: { enabled?: boolean; client?: ShadowSource } = {}): ShadowPicture | null {
  const [ready, setReady] = useState<{ key: string; source: ShadowSource } | null>(null);
  const [picture, setPicture] = useState<ShadowPicture | null>(null);
  const latest = useRef(levels);
  useEffect(() => {
    latest.current = levels;
  });

  useEffect(() => {
    const held = latest.current;
    if (held.length === 0) return;
    const source = client ?? defaultClient();
    let live = true;
    source.setLevels(levelsKey, held).then(
      () => {
        if (live) setReady({ key: levelsKey, source });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [client, levelsKey]);

  useEffect(() => {
    if (!enabled || !ready || ready.key !== levelsKey) return;
    const { source } = ready;
    let live = true;
    const show = (p: ShadowPicture | null) => {
      if (live && p) setPicture(p);
    };
    const ask = (half: boolean) => source.picture(levelsKey, bearingDeg, elDeg, half).then(show, () => {});
    void ask(true);
    const full = window.setTimeout(() => void ask(false), REST_MS);
    return () => {
      live = false;
      window.clearTimeout(full);
    };
  }, [enabled, ready, levelsKey, bearingDeg, elDeg]);

  return picture && picture.key === levelsKey && levels.length > 0 ? picture : null;
}
