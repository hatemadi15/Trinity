'use client';
import { lazy, Suspense, useState } from 'react';
import type { Site } from '@/lib/data/loaders';
import type { Heightmap } from '@/lib/data/terrain';
import type { SceneState } from '@/lib/viz/scene-state';
import type { SceneMode } from './cameraPresets';

export interface Scene3DProps {
  mode: SceneMode;
  scene: SceneState;
  site: Site;
  sites: Site[];
  heightmap: Heightmap | null;
  capHeightmap: Heightmap | null;
  exaggeration: 1 | 3;
  onPick?: (lat: number, lon: number) => void;
  textureUrl?: string;
  reducedMotion?: boolean;
}

const Scene3DCanvas = lazy(() => import('./Scene3DCanvas').then((m) => ({ default: m.Scene3DCanvas })));

/** True when the browser can create a WebGL context (jsdom and some remote desktops cannot). */
export function webglAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function Scene3D(props: Scene3DProps) {
  const [webgl] = useState(() => webglAvailable());
  if (!webgl) {
    return (
      <div role="status" className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-ink-2">
        <p className="text-ink">3D view is not available on this device.</p>
        <p className="text-sm">
          {props.site.name} is still shown in the sky-dome and the timeline; the 3D terrain needs WebGL.
        </p>
      </div>
    );
  }
  return (
    <Suspense fallback={<div className="flex h-full min-h-[320px] items-center justify-center text-ink-3">Loading 3D…</div>}>
      <Scene3DCanvas {...props} />
    </Suspense>
  );
}
