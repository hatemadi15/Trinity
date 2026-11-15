'use client';
import Link from 'next/link';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChunkBoundary } from '@/components/ChunkBoundary';
import { Fold } from '@/components/Fold';
import { lolaFor, Sources } from '@/components/Sources';
import { Scene3DLazy } from '@/components/three';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { shadowLevels, type Heightmap } from '@/lib/data/terrain';
import type { Series } from '@/lib/engine/metrics';
import { sunBearingDeg } from '@/lib/engine/shadow';
import { useFullscreenEnabled, useIsFullscreen } from '@/lib/hooks/useFullscreen';
import { useShadowPicture, type ShadowSource } from '@/lib/hooks/useShadowPicture';
import { standHref } from '@/lib/links';
import type { Exaggeration, SceneMode, TerrainState } from '@/lib/store/explore';
import { groundWords } from '@/lib/viz/ground';
import type { SceneState } from '@/lib/viz/scene-state';
import { pickProblem } from '@/lib/viz/terrain';
import { decodeMask, overlayFor, overlayRect, type ColdOverlayDoc } from '@/lib/coldtraps/coldtraps';
import { useColdOverlay } from '@/lib/coldtraps/useColdTraps';
import { HorizonView } from './HorizonView';
import { COLD_FILL, ShadowMap } from './ShadowMap';

/** The page's segmented control, as for the period: the chosen part dark, the others plain. */
const SEG = 'flex h-11 overflow-hidden rounded-lg border border-line-strong bg-surface text-[15px]';
const seg = (on: boolean) => `px-3.5 ${on ? 'bg-ink font-semibold text-page' : 'text-ink-2 hover:bg-surface-2'}`;
/** Tabs are underlined words, so they never look like the options inside a tab. On a phone they are 15 px, so all three fit on one line. */
const tabClass = (on: boolean) => `-mb-px h-11 whitespace-nowrap border-b-[3px] px-1 text-[16px] max-sm:text-[15px] max-[389px]:text-[14px] max-[389px]:tracking-tight ${on ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`;
/** The picture beside its reading guide from the medium screen up, above it on a phone. */
const BESIDE = 'grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,560px)_minmax(0,1fr)]';

export type GroundTab = 'map' | '3d' | 'horizon';
/** The tab a polar site opens on: the shadow map reads at a glance, so it comes before "3D from above". */
export const DEFAULT_GROUND_TAB: GroundTab = 'map';
/** The 3D tab is named for where it looks from, so it reads apart from "Stand at the site", at eye level. */
const TABS: { id: GroundTab; label: string }[] = [
  { id: 'map', label: 'Shadow map' },
  { id: '3d', label: '3D from above' },
  { id: 'horizon', label: 'Horizon chart' },
];

/**
 * The line under the tabs that says what the chosen tab shows, so the three read as three different
 * things. The line for "3D from above" uses the tab's name; its ground is the window's own size (about
 * 20 km at 20 m per pixel, 41 km at 80 m), and the globe is the whole Moon.
 */
function aboutTab(tab: GroundTab, view: SceneMode, km: number | null): string {
  if (tab === 'map') return "From above, at the time bar's hour.";
  if (tab === 'horizon') return 'The horizon all round, with the paths of the Sun and Earth.';
  if (view === 'globe') return 'The whole Moon in 3D from above, as a model you can turn.';
  return km === null ? 'The same ground in 3D from above, as a model you can turn.' : `The same ${km} km of ground in 3D from above, as a model you can turn.`;
}
/** The 3D picture's box, the element put on the whole screen. */
const FULL = '[data-full="3d"]';

/**
 * What the 3D tab shows when its code fails to load (after a redeploy while the page is open, or on a dropped
 * connection): the 3D view's own words for a device that cannot show it. The panel keeps its own copy, since the 3D
 * view's is in the code that failed.
 */
function No3D({ siteName }: { siteName: string }) {
  return (
    <div role="status" className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-ink-2">
      <p className="text-ink">3D view is not available on this device.</p>
      <p className="text-[15px]">{siteName} is still shown in the chart above; reload the page to try again.</p>
    </div>
  );
}

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
 * The ground around the site at the time bar's hour, three ways: the shadow map, from above with its
 * shadows (the default for a polar site); "3D from above", the same ground in the same light, to turn;
 * and the horizon chart, the horizon all round in one strip with the Sun's and Earth's paths (the
 * default for a site with no polar terrain, which has no map). Under the tabs one line says what the
 * chosen tab shows, then one sentence, the same for every tab, says whether the site is in sunlight
 * and whether Earth can be reached. Beside the tabs, "Stand at the site" opens the full-window view
 * from the site itself at the same hour (on flat ground where there is no polar terrain); the line that
 * says so waits under the map's "About this view", with the map's notes.
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
  startUtc,
  days,
  mask,
  series,
  cursor,
  onMode,
  onExaggeration,
  onPick,
  reducedMotion,
  shadowClient,
  standLink,
  coldLayer = false,
  coldOverlay,
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
  /** The period's first hour, for the dates on the horizon chart. */
  startUtc: string;
  /** The period's length, for the address of the view from the site. */
  days: number;
  mask: ArrayLike<number>;
  series: Series;
  cursor: number;
  onMode: (mode: SceneMode) => void;
  onExaggeration: (x: Exaggeration) => void;
  onPick: (lat: number, lon: number) => void;
  reducedMotion: boolean;
  /** The shadow worker's client; tests pass a stub. */
  shadowClient?: ShadowSource;
  /** The view from the site's address with the lander's and the radio's settings; without it, the site, period and hour alone. */
  standLink?: string;
  /** Whether the modelled cold-trap layer (data/coldtraps) covers this site, so the map can offer its cold ground. */
  coldLayer?: boolean;
  /** Injected in tests; by default the app's data/coldtraps/overlay.json, loaded once the layer is switched on. */
  coldOverlay?: () => Promise<ColdOverlayDoc>;
}) {
  // Until a tab is chosen, a site with no polar terrain opens on the horizon chart: it has no map.
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
  // The map's notes, among them the line on what Stand at the site does, are in the page only while the map is drawn,
  // so only then can that line describe the button.
  const mapNotes = tab === 'map' && site.polar && finest !== null;
  // The modelled cold ground, off until asked for, on the terrain window it was cut for (never on the coarse cap alone).
  const [coldOn, setColdOn] = useState(false);
  const coldOffered = coldLayer && site.polar && heightmap !== null;
  const coldDoc = useColdOverlay(coldOn && coldOffered, coldOverlay);
  const coldEntry = coldOn && coldOffered ? overlayFor(coldDoc, site.id) : null;
  const cold = useMemo(() => (coldEntry && heightmap ? { mask: decodeMask(coldEntry), width: coldEntry.width, height: coldEntry.height, rect: overlayRect(coldEntry, heightmap.meta) } : null), [coldEntry, heightmap]);

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

  // Without the terrain files the tab says so and names what works without them (data/manifest.json's terrain part).
  const missing = loading ? 'Loading the terrain…' : 'This copy of Earthrise has no terrain files, so the ground cannot be drawn here. The Horizon chart tab works without them.';
  // The window's width, for the line under the tabs and the 3D caption alike.
  const windowKm = heightmap ? Math.round((heightmap.meta.width * heightmap.meta.cell_m) / 1000) : null;
  let caption3d: string;
  if (view === 'globe') caption3d = "The whole Moon, lit for the hour of the time bar. Click anywhere inside the ring at 60° S to get that point's own forecast. Drag to turn, scroll to zoom.";
  else if (heightmap) caption3d = `The same ground in 3D, about ${windowKm} km across, lit exactly as on the shadow map; the yellow pin marks the site. NASA elevation data at ${heightmap.meta.cell_m} m per pixel. Drag to turn, scroll to zoom; the light follows the time bar. Globe shows the whole Moon.`;
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
      {/* The tabs, and beside them the way to stand at the site. Where the row is too narrow for both, the
          button goes above the tabs (wrap-reverse), so the chosen tab's underline stays on the line. On a
          phone the tabs spread across the row instead of keeping 24 px apart. */}
      <div className="mt-2 flex flex-wrap-reverse justify-between gap-x-6 gap-y-2 border-b border-line">
        <div role="tablist" aria-label="How to look at the ground" className="mt-auto flex gap-6 max-sm:w-full max-sm:justify-between max-sm:gap-0">
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
        {/* The line on what the button does waits under "About this view" (spec 20.1). While it is in the page it
            still describes the button, folded away or not, so a screen reader hears it without renaming the button. */}
        <div className="mb-1.5 mt-auto">
          <Link href={standLink ?? standHref(site.id, startUtc, days, cursor)} aria-describedby={mapNotes ? 'ground-stand-note' : undefined} className="btn btn-ink btn-sm">
            Stand at the site
          </Link>
        </div>
      </div>
      <p data-part="about" className="mt-3 text-pretty text-[15px] text-ink-2">
        {aboutTab(tab, view, windowKm)}
      </p>
      {/* The shadow map writes the same on itself (the site lit or dark, the Sun's height, Earth): there the sentence is kept for screen readers alone. */}
      <p data-part="now" className={tab === 'map' && site.polar && finest ? 'sr-only' : 'mt-3 max-w-[62em] text-[17px] leading-relaxed text-ink'}>
        <b className="font-semibold">{words.sun}</b> {words.earth}
      </p>

      <div role="tabpanel" id="ground-panel-map" aria-labelledby="ground-tab-map" hidden={tab !== 'map'} className="mt-4">
        {tab === 'map' &&
          (!site.polar ? (
            <p className="text-ink-2">This tool has height data only around the south pole, so this site&apos;s horizon is taken as flat. The Horizon chart tab shows the paths of the Sun and Earth over it.</p>
          ) : finest ? (
            <div className={BESIDE}>
              <div className="stage aspect-square">
                <ShadowMap
                  picture={picture}
                  widthKm={(finest.width * finest.pxM) / 1000}
                  siteName={siteLabel(site)}
                  lon={site.lon}
                  sunAz={scene.sunAz}
                  sunEl={scene.sunEl}
                  earthAz={scene.earthAz}
                  earthEl={scene.earthEl}
                  when={when}
                  sunHidden={words.sunHidden}
                  earthHidden={words.earthHidden}
                  siteState={words.siteState}
                  cold={cold}
                />
              </div>
              <div className="text-[15px] text-ink-2">
                <ul aria-label="How to read the map" className="flex flex-col gap-2 text-ink">
                  <KeyItem sample={<span className="block h-3.5 w-6 rounded-sm bg-stage-ink" />}>sunlit ground</KeyItem>
                  <KeyItem sample={<span className="block h-3.5 w-6 rounded-sm border border-stage-ink/40 bg-black" />}>shadow</KeyItem>
                  <KeyItem sample={<Arrow color="var(--stage-sun)" />}>towards the Sun</KeyItem>
                  <KeyItem sample={<Arrow color="var(--stage-earth)" dotted />}>towards Earth (dotted when set)</KeyItem>
                  <KeyItem sample={<span className="flex h-6 w-6 items-center justify-center rounded-full border border-stage-ink/40 text-[14px] font-bold leading-none text-stage-ink">N</span>}>north up</KeyItem>
                  {cold && <KeyItem sample={<span className="block h-3.5 w-6 rounded-sm" style={{ background: COLD_FILL }} />}>below 110 K all year in NASA’s Diviner model: modelled conditions where ice could last</KeyItem>}
                </ul>
                {coldOffered && (
                  <button
                    type="button"
                    aria-pressed={coldOn}
                    onClick={() => setColdOn((on) => !on)}
                    className={`mt-4 h-11 rounded-lg border border-line-strong px-3.5 text-[15px] ${coldOn ? 'bg-ink font-semibold text-page' : 'bg-surface text-ink hover:bg-surface-2'}`}
                  >
                    Modelled cold ground
                  </button>
                )}
                {/* How to use the map and how it is made are read once, so they wait one tap away (spec 20.1); the key above
                    reads the map without them. */}
                <Fold label="About this view" className="mt-4">
                  <p className="text-ink">Move the time bar at the bottom of the window, or press Play, to watch the shadows move.</p>
                  <p className="mt-3">
                    Worked out from NASA elevation data at {finest.pxM} m per pixel: {heightmap ? 'computed, not a photograph. Faint stripes are seams in that data, not real ground.' : "too coarse to show the site's own slopes."}
                  </p>
                  <p className="mt-3">
                    Stand at the site <span id="ground-stand-note">fills the whole window: look around as if you stood there.</span>
                  </p>
                  {cold && (
                    <p className="mt-3">
                      The cold ground is NASA’s Diviner temperature model, fitted to one year of measurements in patches about half a kilometre across: modelled conditions where ice could last,
                      not a finding that any is there.
                    </p>
                  )}
                </Fold>
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
                {/* When the 3D view's code fails to load, the tab says so and the other tabs work on, where the failure would
                    otherwise blank the whole page. */}
                <ChunkBoundary fallback={<No3D siteName={siteLabel(site)} />}>
                  <Scene3DLazy mode={view} scene={scene} site={site} sites={sites} heightmap={heightmap} capHeightmap={capHeightmap} exaggeration={exaggeration} textureUrl={textureUrl} onPick={onPick} reducedMotion={reducedMotion} picture={view === 'terrain' ? picture : null} />
                </ChunkBoundary>
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
                    Stretched ×3
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
        {tab === 'horizon' && <HorizonView mask={mask} series={series} cursor={cursor} lat={site.lat} startUtc={startUtc} />}
      </div>

      {customError && (
        <p role="alert" className="mt-1 text-[15px] text-bad">
          {pickProblem(customError)}
        </p>
      )}
      {/* LOLA, on the site's own grid, gives the ground and the hills, and DE440 the light; the sentence for the hour
          uses both on every tab. The globe is coloured with NASA's Moon Kit, so its pill shows while the globe does. */}
      {/* The modelled cold ground, while its layer is on the shadow map, comes from Diviner's model. */}
      <Sources of={tab === '3d' && view === 'globe' && textureUrl ? [...lolaFor(site), 'de440', 'moonkit'] : [...lolaFor(site), 'de440', ...(tab === 'map' && cold ? (['diviner'] as const) : [])]} />
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
