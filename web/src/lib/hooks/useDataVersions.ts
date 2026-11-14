import { useEffect, useState } from 'react';
import { dataBase } from '../data/loaders';
import { loadDataVersions, type DataVersions } from '../share/versions';

let once: Promise<DataVersions> | null = null;

/**
 * The data files' own versions, read once per page load from when `wanted` is first true (Explore asks only once Share
 * opens; the brief at once); null until they are in.
 */
export function useDataVersions(wanted = true, load: () => Promise<DataVersions> = () => loadDataVersions(dataBase())): DataVersions | null {
  const [versions, setVersions] = useState<DataVersions | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    once ??= load();
    void once.then((v) => live && setVersions(v));
    return () => {
      live = false;
    };
    // The loader is read once: a page that passes its own passes the same one every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  return versions;
}
