'use client';
import { useEffect, useState } from 'react';
import { dataBase } from '../data/base';
import { loadColdOverlay, loadColdTraps, type ColdOverlayDoc, type ColdTrapDoc } from './coldtraps';

/** One load per page view of each file; a failed load is tried again on the next mount. */
let sharedDoc: Promise<ColdTrapDoc> | null = null;
let sharedOverlay: Promise<ColdOverlayDoc> | null = null;

function loadSharedDoc(): Promise<ColdTrapDoc> {
  sharedDoc ??= loadColdTraps(dataBase()).catch((err: unknown) => {
    sharedDoc = null;
    throw err;
  });
  return sharedDoc;
}

function loadSharedOverlay(): Promise<ColdOverlayDoc> {
  sharedOverlay ??= loadColdOverlay(dataBase()).catch((err: unknown) => {
    sharedOverlay = null;
    throw err;
  });
  return sharedOverlay;
}

/** A file loaded once `on`, or null while it loads and when it cannot be loaded: the page works without it. */
function useLoaded<T>(on: boolean, load: () => Promise<T>): T | null {
  const [doc, setDoc] = useState<T | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    load()
      .then((d) => {
        if (live) setDoc(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [on, load]);
  return doc;
}

/** The modelled cold traps near each polar site (data/coldtraps/coldtraps.json). */
export function useColdTraps(load: () => Promise<ColdTrapDoc> = loadSharedDoc): ColdTrapDoc | null {
  return useLoaded(true, load);
}

/** The shadow map's layer of cold ground (data/coldtraps/overlay.json), loaded only once it is switched on. */
export function useColdOverlay(on: boolean, load: () => Promise<ColdOverlayDoc> = loadSharedOverlay): ColdOverlayDoc | null {
  return useLoaded(on, load);
}
