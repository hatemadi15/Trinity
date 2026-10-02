'use client';
import { Scene3DLazy } from '@/components/three';
import type { Site } from '@/lib/data/loaders';
import type { Heightmap } from '@/lib/data/terrain';
import type { Exaggeration, SceneMode, TerrainState } from '@/lib/store/explore';
import type { SceneState } from '@/lib/viz/scene-state';

const SEG = 'flex h-11 overflow-hidden rounded-lg border border-stage-line bg-stage/85 text-[15px] text-stage-ink';
const seg = (on: boolean) => `px-3.5 ${on ? 'bg-stage-ink font-semibold text-stage' : 'hover:bg-white/10'}`;

/**
 * The ground around the site in 3D, lit for the hour of the time bar. A site far from the pole shows
 * the globe instead; the globe is also where a new place is picked by clicking.
 */
export function GroundPanel({
  site,
  sites,
  scene,
  mode,
  exaggeration,
  heightmap,
  capHeightmap,
  textureUrl,
  terrainState,
  windowLoading,
  customError,
  when,
  onMode,
  onExaggeration,
  onPick,
  reducedMotion,
}: {
  site: Site;
  sites: Site[];
  scene: SceneState;
  mode: SceneMode;
  exaggeration: Exaggeration;
  heightmap: Heightmap | null;
  capHeightmap: Heightmap | null;
  textureUrl: string | null;
  terrainState: TerrainState;
  windowLoading: boolean;
  customError: string | null;
  when: string;
  onMode: (mode: SceneMode) => void;
  onExaggeration: (x: Exaggeration) => void;
  onPick: (lat: number, lon: number) => void;
  reducedMotion: boolean;
}) {
  let caption: string;
  if (mode === 'globe') caption = "The whole Moon, lit for the hour of the time bar. Click anywhere inside the ring at 60° S to get that point's own forecast. Drag to turn, scroll to zoom.";
  else if (heightmap) caption = `NASA elevation data at ${heightmap.meta.cell_m} m per pixel, ${(heightmap.meta.width * heightmap.meta.cell_m) / 1000} km across. Drag to turn, scroll to zoom. The light follows the time bar.`;
  else if (terrainState === 'loading' || windowLoading) caption = 'Loading the terrain…';
  else if (capHeightmap) caption = `NASA elevation data at ${capHeightmap.meta.cell_m} m per pixel, 48 km around the site: too coarse to show its own slopes. The light follows the time bar.`;
  else caption = 'The terrain files are not on this machine.';
  return (
    <section aria-labelledby="h-ground" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        {/* Named after what it shows: the globe is the whole Moon, not the ground at the site. */}
        <h2 id="h-ground" className="display text-[23px] font-semibold">
          {mode === 'globe' ? 'The whole Moon' : 'The ground'}
        </h2>
        <p className="text-[15px] text-ink-2">{when}</p>
      </div>
      <div className="stage mt-3 aspect-[4/3] sm:min-h-[380px]">
        <div className="absolute inset-0">
          <Scene3DLazy mode={mode} scene={scene} site={site} sites={sites} heightmap={heightmap} capHeightmap={capHeightmap} exaggeration={exaggeration} textureUrl={textureUrl} onPick={onPick} reducedMotion={reducedMotion} />
        </div>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2">
          <div role="group" aria-label="View" className={`${SEG} pointer-events-auto`}>
            <button type="button" aria-pressed={mode === 'terrain'} onClick={() => onMode('terrain')} className={seg(mode === 'terrain')}>
              Terrain
            </button>
            <button type="button" aria-pressed={mode === 'globe'} onClick={() => onMode('globe')} className={seg(mode === 'globe')}>
              Globe
            </button>
          </div>
          {mode === 'terrain' && (
            <div role="group" aria-label="Heights" className={`${SEG} pointer-events-auto`}>
              <button type="button" aria-pressed={exaggeration === 1} onClick={() => onExaggeration(1)} className={seg(exaggeration === 1)}>
                True heights
              </button>
              <button type="button" aria-pressed={exaggeration === 3} onClick={() => onExaggeration(3)} className={seg(exaggeration === 3)}>
                Heights ×3
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[15px] text-ink-2">{caption}</p>
      {customError && (
        <p role="alert" className="mt-1 text-[15px] text-bad">
          That place cannot be worked out: this tool covers the Moon south of 60° S.
        </p>
      )}
    </section>
  );
}
