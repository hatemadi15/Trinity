'use client';
import type { Control } from '@/lib/luna/commands';
import { useLunaControls, type Handler } from '@/lib/luna/controls';

/**
 * Lends Luna a page's controls while it is shown (spec 22), for a page whose handlers exist only once its data has
 * loaded, after the early returns where no hook may be called: render it with them. Renders nothing.
 */
export function LunaControls({ controls }: { controls: Partial<Record<Control, Handler>> }) {
  useLunaControls(controls);
  return null;
}
