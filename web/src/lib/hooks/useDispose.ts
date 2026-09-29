import { useEffect } from 'react';

/**
 * Calls `dispose()` on the previous value when it is replaced and on unmount. three.js geometries
 * and materials hold GPU buffers that the garbage collector never frees on its own.
 */
export function useDispose(value: { dispose: () => void } | null | undefined): void {
  useEffect(
    () => () => {
      value?.dispose();
    },
    [value],
  );
}
