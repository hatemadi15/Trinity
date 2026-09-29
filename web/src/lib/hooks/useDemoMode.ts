import { useEffect } from 'react';
import type { StoreApi } from 'zustand';
import type { ExploreState } from '../store/explore';

/**
 * `?demo=1` in the URL switches the planner to the rehearsed answers for the pitch. Read after
 * mount from `window.location`, so the server and the first client render agree and no Suspense
 * boundary is needed.
 */
export function useDemoMode(store: StoreApi<ExploreState>): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('demo') === '1') store.getState().setAiMode('cached');
  }, [store]);
}
