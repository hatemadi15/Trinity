'use client';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { exploreStore } from '@/lib/store/explore';

/** Reads `?demo=1` on every page, so the pitch's landing-card path keeps the rehearsed answers. Renders nothing. */
export function DemoModeGate() {
  useDemoMode(exploreStore);
  return null;
}
