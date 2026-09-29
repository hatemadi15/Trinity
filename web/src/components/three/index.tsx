'use client';
import dynamic from 'next/dynamic';

/** Client-only 3D view; R3F never renders on the server. */
export const Scene3DLazy = dynamic(() => import('./Scene3D').then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-[320px] items-center justify-center text-ink-3">Loading 3D…</div>,
});
