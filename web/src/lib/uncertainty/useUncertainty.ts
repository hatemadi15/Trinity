'use client';
import { useEffect, useState } from 'react';
import { dataBase } from '../data/base';
import { loadUncertainty, type UncertaintyDoc } from './budget';

/** One load per page view of the app's budget; a failed load is tried again on the next mount. */
let shared: Promise<UncertaintyDoc> | null = null;
function loadShared(): Promise<UncertaintyDoc> {
  shared ??= loadUncertainty(dataBase()).catch((err: unknown) => {
    shared = null;
    throw err;
  });
  return shared;
}

/** The uncertainty budget, or null while it loads and when it cannot be loaded: the page works without it. */
export function useUncertainty(load: () => Promise<UncertaintyDoc> = loadShared): UncertaintyDoc | null {
  const [doc, setDoc] = useState<UncertaintyDoc | null>(null);
  useEffect(() => {
    let live = true;
    load()
      .then((d) => {
        if (live) setDoc(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);
  return doc;
}
