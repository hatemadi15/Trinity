'use client';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Scene3DLazy } from '@/components/three';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { shadowLevels, type Heightmap } from '@/lib/data/terrain';
import type { Series } from '@/lib/engine/metrics';
import { sunBearingDeg } from '@/lib/engine/shadow';
import { useFullscreenEnabled, useIsFullscreen } from '@/lib/hooks/useFullscreen';
import { useShadowPicture, type ShadowSource } from '@/lib/hooks/useShadowPicture';
import type { Exaggeration, SceneMode, TerrainState } from '@/lib/store/explore';
import { groundWords } from '@/lib/viz/ground';
import type { SceneState } from '@/lib/viz/scene-state';
import { HorizonView } from './HorizonView';
import { ShadowMap } from './ShadowMap';

/** The page's segmented control, as for the period: the chosen part dark, the others plain. */
const SEG = 'flex h-11 overflow-hidden rounded-lg border border-line-strong bg-surface text-[15px]';
const seg = (on: boolean) => `px-3.5 ${on ? 'bg-ink font-semibold text-page' : 'text-ink-2 hover:bg-surface-2'}`;
/** Tabs are underlined words, so they never look like the options inside a tab. */
const tabClass = (on: boolean) => `-mb-px h-11 border-b-[3px] px-1 text-[16px] ${on ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`;
/** The picture beside its reading guide from the medium screen up, above it on a phone. */
const BESIDE = 'grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,560px)_minmax(0,1fr)]';

export type GroundTab = 'map' | '3d' | 'horizon';
/** The tab a polar site opens on: the shadow map reads at a glance, so it comes before the 3D view. */
export const DEFAULT_GROUND_TAB: GroundTab = 'map';
const TABS: { id: GroundTab; label: string }[] = [
  { id: 'map', label: 'Shadow map' },
  { id: '3d', label: '3D' },
  { id: 'horizon', label: 'View all round' },
];
/** The 3D picture's box, the element put on the whole screen. */
const FULL = '[data-full="3d"]';

/** One line of the map's reading guide: a sample and its words. */
function KeyItem({ sample, children }: { sample: ReactNode; children: string }) {
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-6 w-9 shrink-0 items-center justify-center rounded bg-stage">
        {sample}
      </span>
      <span>{children}</span>
    </li>
  );
}

/**
 * The ground around the site at the time bar's hour, three ways: from above with its shadows (the
 * default for a polar site), in 3D with the same light, and the view all round with the Sun's and
 * Earth's paths (the default for a site with no polar terrain, which has no map). Above every tab one
 * sentence says whether the site is in sunlight and whether Earth can be reached.
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
  // Until a tab is chosen, a site with no polar terrain opens on the view all round: it has no map.
  const [chosen, setChosen] = useState<GroundTab | null>(null);
  const tab = chosen ?? (site.polar ? DEFAULT_GROUND_TAB : 'horizon');
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
  const words = groundWords(series, Math.min(series.hours - 1, Math.max(0, cursor)));

  const choose = (next: GroundTab) => {
    setChosen(next);
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
  else if (heightmap) caption3d = `NASA elevation data at ${heightmap.meta.cell_m} m per pixel, about ${Math.round((heightmap.meta.width * heightmap.meta.cell_m) / 1000)} km across, in the light of the shadow map. Drag to turn, scroll to zoom; the light follows the time bar. Globe shows the whole Moon.`;
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
      <div role="tablist" aria-label="How to look at the ground" className="mt-2 flex gap-6 border-b border-line">
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
            onClick={() => setChosen(t.id)}
            onKeyDown={onTabKey}
            className={tabClass(tab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p data-part="now" className="mt-4 max-w-[62em] text-[17px] leading-relaxed text-ink">
        <b className="font-semibold">{words.sun}</b> {words.earth}
      </p>

      <div role="tabpanel" id="ground-panel-map" aria-labelledby="ground-tab-map" hidden={tab !== 'map'} className="mt-4">
        {tab === 'map' &&
          (!site.polar ? (
            <p className="text-ink-2">This tool has height data only around the south pole, so this site&apos;s horizon is taken as flat. The View all round tab shows the paths of the Sun and Earth over it.</p>
          ) : finest ? (
            <div className={BESIDE}>
              <div className="stage aspect-square">
                <ShadowMap picture={picture} widthKm={(finest.width * finest.pxM) / 1000} siteName={siteLabel(site)} lon={site.lon} sunAz={scene.sunAz} sunEl={scene.sunEl} earthAz={scene.earthAz} earthEl={scene.earthEl} when={when} />
              </div>
              <div className="text-[15px] text-ink-2">
                <ul aria-label="How to read the map" className="flex flex-col gap-2 text-ink">
                  <KeyItem sample={<span className="block h-3.5 w-6 rounded-sm bg-stage-ink" />}>ground in sunlight</KeyItem>
                  <KeyItem sample={<span className="block h-3.5 w-6 rounded-sm border border-stage-ink/40 bg-black" />}>ground in shadow</KeyItem>
                  <KeyItem sample={<Arrow color="var(--stage-sun)" />}>towards the Sun</KeyItem>
                  <KeyItem sample={<Arrow color="var(--stage-earth)" dotted />}>towards Earth (dotted when below the horizon)</KeyItem>
                  <KeyItem sample={<span className="text-[14px] font-bold text-stage-ink">N</span>}>north at the site</KeyItem>
                </ul>
                <p className="mt-4 text-ink">Move the time bar at the bottom of the window, or press Play, to watch the shadows move.</p>
                <p className="mt-3">
                  Worked out from NASA elevation data at {finest.pxM} m per pixel: {heightmap ? 'computed, not a photograph. Faint stripes are seams in that data, not real ground.' : "too coarse to show the site's own slopes."}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-ink-2">{missing}</p>
          ))}
      </div>

      <div role="tabpanel" id="ground-panel-3d" aria-labelledby="ground-tab-3d" hidden={tab !== '3d'} className="mt-4">
        {tab === '3d' && (
          <div className={BESIDE}>
            <div ref={stage} data-full="3d" className="stage aspect-square">
              <div className="absolute inset-0">
                <Scene3DLazy mode={view} scene={scene} site={site} sites={sites} heightmap={heightmap} capHeightmap={capHeightmap} exaggeration={exaggeration} textureUrl={textureUrl} onPick={onPick} reducedMotion={reducedMotion} picture={view === 'terrain' ? picture : null} />
              </div>
              {isFull && (
                <button type="button" onClick={() => void document.exitFullscreen?.().catch(() => {})} className="absolute right-4 top-4 h-11 rounded-lg border border-stage-ink/40 bg-stage/85 px-3.5 text-[15px] text-stage-ink">
                  Leave full screen
                </button>
              )}
            </div>
            <div className="flex flex-col items-start gap-3">
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
                <button type="button" onClick={() => void stage.current?.requestFullscreen?.().catch(() => {})} className="h-11 rounded-lg border border-line-strong bg-surface px-3.5 text-[15px] text-ink hover:bg-surface-2">
                  Full screen
                </button>
              )}
              <p className="text-[15px] text-ink-2">{caption3d}</p>
            </div>
          </div>
        )}
      </div>

      <div role="tabpanel" id="ground-panel-horizon" aria-labelledby="ground-tab-horizon" hidden={tab !== 'horizon'} className="mt-4">
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

/** A short arrow on the stage, as the map draws the ways to the Sun and to Earth. */
function Arrow({ color, dotted = false }: { color: string; dotted?: boolean }) {
  return (
    <svg width={28} height={12} viewBox="0 0 28 12">
      <line x1={2} y1={6} x2={20} y2={6} stroke={color} strokeWidth={2.5} strokeDasharray={dotted ? '4 3' : undefined} />
      <polygon points="19,1.5 27,6 19,10.5" fill={color} />
    </svg>
  );
}
