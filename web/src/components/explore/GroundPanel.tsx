'use client';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Scene3DLazy } from '@/components/three';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { shadowLevels, type Heightmap } from '@/lib/data/terrain';
import type { Series } from '@/lib/engine/metrics';
import { sunBearingDeg } from '@/lib/engine/shadow';
import { useFullscreenEnabled, useIsFullscreen } from '@/lib/hooks/useFullscreen';
import { useShadowPicture, type ShadowSource } from '@/lib/hooks/useShadowPicture';
import type { Exaggeration, SceneMode, TerrainState } from '@/lib/store/explore';
import type { SceneState } from '@/lib/viz/scene-state';
import { HorizonView } from './HorizonView';
import { ShadowMap } from './ShadowMap';

/** The page's segmented control, as for the period: the chosen part dark, the others plain. */
const SEG = 'flex h-11 overflow-hidden rounded-lg border border-line-strong bg-surface text-[15px]';
const seg = (on: boolean) => `px-3.5 ${on ? 'bg-ink font-semibold text-page' : 'text-ink-2 hover:bg-surface-2'}`;

export type GroundTab = 'map' | '3d' | 'horizon';
/** The tab the panel opens on: the shadow map reads at a glance, so it comes before the 3D view. */
export const DEFAULT_GROUND_TAB: GroundTab = 'map';
const TABS: { id: GroundTab; label: string }[] = [
  { id: 'map', label: 'Shadow map' },
  { id: '3d', label: '3D' },
  { id: 'horizon', label: 'Horizon' },
];
/** The 3D picture's box, the element put on the whole screen. */
const FULL = '[data-full="3d"]';

/**
 * The ground around the site, lit for the hour of the time bar, three ways: from above with its
 * shadows (the default), in 3D with the same light, and as the horizon all round with the Sun's and
 * Earth's paths. A site with no polar terrain has a flat horizon: no map, and the globe in 3D, where a
 * new place is picked by clicking.
 */
export function GroundPanel({
  site,
  sites,
  scene,
  mode,
  exaggeration,
  heightmap,
  contextHeightmap,
  capHeightmap,
  textureUrl,
  terrainState,
  windowLoading,
  customError,
  when,
  mask,
  series,
  cursor,
  onMode,
  onExaggeration,
  onPick,
  reducedMotion,
  shadowClient,
}: {
  site: Site;
  sites: Site[];
  scene: SceneState;
  mode: SceneMode;
  exaggeration: Exaggeration;
  heightmap: Heightmap | null;
  contextHeightmap: Heightmap | null;
  capHeightmap: Heightmap | null;
  textureUrl: string | null;
  terrainState: TerrainState;
  windowLoading: boolean;
  customError: string | null;
  when: string;
  mask: ArrayLike<number>;
  series: Series;
  cursor: number;
  onMode: (mode: SceneMode) => void;
  onExaggeration: (x: Exaggeration) => void;
  onPick: (lat: number, lon: number) => void;
  reducedMotion: boolean;
  /** The shadow worker's client; tests pass a stub. */
  shadowClient?: ShadowSource;
}) {
  const [tab, setTab] = useState<GroundTab>(DEFAULT_GROUND_TAB);
  const tabs = useRef<Partial<Record<GroundTab, HTMLButtonElement | null>>>({});
  const stage = useRef<HTMLDivElement>(null);
  const canFull = useFullscreenEnabled();
  const isFull = useIsFullscreen(FULL);
  const view: SceneMode = site.polar ? mode : 'globe';
  const loading = terrainState === 'loading' || windowLoading;
  // A window on its way is waited for rather than the coarse cap drawn first.
  const levels = useMemo(() => (site.polar && !(windowLoading && !heightmap) ? shadowLevels(site, heightmap, contextHeightmap, capHeightmap) : []), [site, heightmap, contextHeightmap, capHeightmap, windowLoading]);
  const levelsKey = `${site.id}:${levels.map((l) => `${l.pxM}/${l.width}`).join(',')}`;
  const finest = levels.length > 0 ? levels[levels.length - 1] : null;
  const picture = useShadowPicture(levels, levelsKey, sunBearingDeg(site.lon, scene.sunAz), scene.sunEl, { enabled: tab === 'map' || (tab === '3d' && view === 'terrain'), client: shadowClient });

  const choose = (next: GroundTab) => {
    setTab(next);
    tabs.current[next]?.focus();
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const to = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(TABS[to].id);
  };

  const missing = loading ? 'Loading the terrain…' : 'The terrain files are not on this machine.';
  let caption3d: string;
  if (view === 'globe') caption3d = "The whole Moon, lit for the hour of the time bar. Click anywhere inside the ring at 60° S to get that point's own forecast. Drag to turn, scroll to zoom.";
  else if (heightmap) caption3d = `NASA elevation data at ${heightmap.meta.cell_m} m per pixel, ${(heightmap.meta.width * heightmap.meta.cell_m) / 1000} km across. Drag to turn, scroll to zoom. The light follows the time bar.`;
  else if (loading) caption3d = missing;
  else if (capHeightmap) caption3d = `NASA elevation data at ${capHeightmap.meta.cell_m} m per pixel, 48 km around the site: too coarse to show its own slopes. The light follows the time bar.`;
  else caption3d = missing;

  return (
    <section aria-labelledby="h-ground" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id="h-ground" className="display text-[23px] font-semibold">
          The ground
        </h2>
        <p className="text-[15px] text-ink-2">{when}</p>
      </div>
      <div role="tablist" aria-label="How to look at the ground" className={`${SEG} mt-3 w-fit`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`ground-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`ground-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
            className={seg(tab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="ground-panel-map" aria-labelledby="ground-tab-map" hidden={tab !== 'map'} className="mt-3">
        {tab === 'map' &&
          (!site.polar ? (
            <p className="text-ink-2">This site has no polar terrain: its horizon is taken as flat.</p>
          ) : finest ? (
            <>
              <div className="stage flex aspect-[4/3] justify-center sm:min-h-[380px]">
                <ShadowMap picture={picture} widthKm={(finest.width * finest.pxM) / 1000} siteName={siteLabel(site)} lon={site.lon} sunAz={scene.sunAz} sunEl={scene.sunEl} earthAz={scene.earthAz} earthEl={scene.earthEl} when={when} />
              </div>
              <p className="mt-3 text-[15px] text-ink-2">
                Light ground is in sunlight, dark ground in shadow. Worked out from NASA elevation data at {finest.pxM} m per pixel: {heightmap ? 'computed, not a photograph.' : "too coarse to show the site's own slopes."}
              </p>
            </>
          ) : (
            <p className="text-ink-2">{missing}</p>
          ))}
      </div>

      <div role="tabpanel" id="ground-panel-3d" aria-labelledby="ground-tab-3d" hidden={tab !== '3d'} className="mt-3">
        {tab === '3d' && (
          <>
            <div className="flex flex-wrap gap-2">
              {site.polar && (
                <div role="group" aria-label="View" className={SEG}>
                  <button type="button" aria-pressed={view === 'terrain'} onClick={() => onMode('terrain')} className={seg(view === 'terrain')}>
                    Terrain
                  </button>
                  <button type="button" aria-pressed={view === 'globe'} onClick={() => onMode('globe')} className={seg(view === 'globe')}>
                    Globe
                  </button>
                </div>
              )}
              {view === 'terrain' && (
                <div role="group" aria-label="Heights" className={SEG}>
                  <button type="button" aria-pressed={exaggeration === 1} onClick={() => onExaggeration(1)} className={seg(exaggeration === 1)}>
                    True heights
                  </button>
                  <button type="button" aria-pressed={exaggeration === 3} onClick={() => onExaggeration(3)} className={seg(exaggeration === 3)}>
                    Heights ×3
                  </button>
                </div>
              )}
              {canFull && (
                <button type="button" onClick={() => void stage.current?.requestFullscreen?.()} className="h-11 rounded-lg border border-line-strong bg-surface px-3.5 text-[15px] text-ink hover:bg-surface-2">
                  Full screen
                </button>
              )}
            </div>
            <div ref={stage} data-full="3d" className="stage mt-3 aspect-[4/3] sm:min-h-[380px]">
              <div className="absolute inset-0">
                <Scene3DLazy mode={view} scene={scene} site={site} sites={sites} heightmap={heightmap} capHeightmap={capHeightmap} exaggeration={exaggeration} textureUrl={textureUrl} onPick={onPick} reducedMotion={reducedMotion} picture={view === 'terrain' ? picture : null} />
              </div>
              {isFull && (
                <button type="button" onClick={() => void document.exitFullscreen?.()} className="absolute right-4 top-4 h-11 rounded-lg border border-stage-ink/40 bg-stage/85 px-3.5 text-[15px] text-stage-ink">
                  Leave full screen
                </button>
              )}
            </div>
            <p className="mt-3 text-[15px] text-ink-2">{caption3d}</p>
          </>
        )}
      </div>

      <div role="tabpanel" id="ground-panel-horizon" aria-labelledby="ground-tab-horizon" hidden={tab !== 'horizon'} className="mt-3">
        {tab === 'horizon' && <HorizonView mask={mask} series={series} cursor={cursor} lat={site.lat} />}
      </div>

      {customError && (
        <p role="alert" className="mt-1 text-[15px] text-bad">
          That place cannot be worked out: this tool covers the Moon south of 60° S.
        </p>
      )}
    </section>
  );
}
