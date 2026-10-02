import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}

/** True when the browser lets the page put one element on the whole screen; false during SSR. */
export function useFullscreenEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => typeof document !== 'undefined' && document.fullscreenEnabled === true, () => false);
}

/** True while the element matching `selector` is the one on the whole screen. */
export function useIsFullscreen(selector: string): boolean {
  return useSyncExternalStore(subscribe, () => (typeof document !== 'undefined' && document.fullscreenElement?.matches(selector)) === true, () => false);
}
