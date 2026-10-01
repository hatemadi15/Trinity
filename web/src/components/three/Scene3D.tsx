'use client';
import { Component, lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { siteLabel, type Site } from '@/lib/data/loaders';
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
  /** Globe colour map; null renders a plain sphere (texture not synced). */
  textureUrl?: string | null;
  reducedMotion?: boolean;
  /** Called by the canvas when the WebGL context is lost. */
  onContextLost?: () => void;
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

function FallbackPanel({ siteName, reason }: { siteName: string; reason?: string }) {
  return (
    <div role="status" className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-ink-2">
      <p className="text-ink">3D view is not available on this device.</p>
      <p className="text-[15px]">
        {siteName} is still shown in the chart above; {reason ?? 'the 3D terrain needs WebGL.'}
      </p>
    </div>
  );
}

/** Keeps a renderer or texture failure inside the 3D panel: the rest of Explore stays up. */
export class SceneErrorBoundary extends Component<{ siteName: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('3D scene failed:', error);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <FallbackPanel siteName={this.props.siteName} reason="the 3D scene hit a rendering error." />;
    }
    return this.props.children;
  }
}

export function Scene3D(props: Scene3DProps) {
  const [webgl] = useState(() => webglAvailable());
  const [lost, setLost] = useState(false);
  const onContextLost = useCallback(() => setLost(true), []);
  if (!webgl) return <FallbackPanel siteName={siteLabel(props.site)} />;
  if (lost) return <FallbackPanel siteName={siteLabel(props.site)} reason="the graphics context was lost; reload the page to try again." />;
  return (
    <SceneErrorBoundary siteName={siteLabel(props.site)}>
      <Suspense fallback={<div className="flex h-full min-h-[320px] items-center justify-center text-ink-3">Loading 3D…</div>}>
        <Scene3DCanvas {...props} onContextLost={onContextLost} />
      </Suspense>
    </SceneErrorBoundary>
  );
}
