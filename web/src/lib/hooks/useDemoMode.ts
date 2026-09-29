import { useEffect } from 'react';
import type { StoreApi } from 'zustand';
import type { ExploreState } from '../store/explore';

/** sessionStorage flag so demo mode survives client-side navigation and reloads within the tab. */
export const DEMO_KEY = 'earthrise.demo';

/**
 * `?demo=1` in the URL switches the planner to the rehearsed answers for the pitch and remembers it
 * for the tab; `?demo=0` switches back. Read after mount from `window.location`, so the server and
 * the first client render agree and no Suspense boundary is needed.
 */
export function useDemoMode(store: StoreApi<ExploreState>): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let flag: '1' | '0' | null = null;
    try {
      const q = new URLSearchParams(window.location.search).get('demo');
      if (q === '1') {
        flag = '1';
        window.sessionStorage.setItem(DEMO_KEY, '1');
      } else if (q === '0') {
        flag = '0';
        window.sessionStorage.removeItem(DEMO_KEY);
      } else if (window.sessionStorage.getItem(DEMO_KEY) === '1') {
        flag = '1';
      }
    } catch {
      // storage can be unavailable (private mode); the URL still counts
    }
    if (flag === '1') store.getState().setAiMode('cached');
    else if (flag === '0') store.getState().setAiMode('live');
  }, [store]);
}
