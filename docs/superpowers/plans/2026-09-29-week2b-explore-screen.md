# Week 2B — Explore Screen (one site) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first real Earthrise screen: `/explore` shows one landing site with a sky-dome (terrain skyline, Sun and Earth tracks), a timeline of sunlit hours and Earth visibility, a time scrubber that drives both, summary tiles, and a site picker with custom lat/lon (mask computed in a Web Worker). Real data, real engine, no placeholders.

**Architecture:** Client-side React (Next.js App Router, `'use client'` views) on top of the Week 2A engine. A Zustand store holds site/window/cursor state and the computed series; a `data/` loader layer fetches `public/data` artifacts (ephemeris, sites, masks, tiles) with `NEXT_PUBLIC_DATA_BASE` (default `/data`); a Web Worker runs `computeSiteMask` for custom sites through a `FetchTileSource`. Visualizations are hand-built SVG (no chart library) following the dataviz method: one accent hue per body, validated palette, hover tooltips, direct labels, table view for the summary.

**Tech Stack:** Next.js 16, React 19, Tailwind 4 (`@theme` tokens in CSS), Zustand 5, vitest 5 + jsdom + @testing-library/react for component tests, Playwright MCP screenshots for visual critique. Fonts via `next/font/google`: Bricolage Grotesque (display), IBM Plex Sans (text, tabular numerals).

**Spec:** `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md` (sections 2, 3 MVP rows Site picker / Sky-dome / Timeline, 4 Explore, 5.5 n/a, 8 Week 2). Engine API: `web/src/lib/engine/index.ts` (Week 2A).

## Design plan (frontend-design + dataviz)

**Subject:** planning a landing at the lunar south pole where the Sun never climbs more than 1.5° and Earth sits on the horizon. The page's job: show *when the site is lit* and *when Earth is in view*, for one site and one date window, so a planner can decide in a minute.

**Principles:** light is data — brightness on the page encodes illumination (sunlit hours are the brightest thing on screen, unlit hours are near-black); the sky-dome is the one bold element, everything else is quiet instrumentation; copy is plain planner language ("Sun above the skyline", "Earth in view").

**Color (dark-first, validated):**
- `--canvas #2A2D33` basalt page, `--panel #1C1F24` shadowed regolith panels, `--sky #000000` dome/timeline sky, `--line #3A3E45` hairlines.
- Text `--ink #EDEAE4` (sunlit regolith white), `--ink-2 #B4B0A8`, `--ink-3 #7E7A73`.
- Series: Sun `--sun #c98500`, Earth `--earth #3987e5` — validated with the dataviz validator on `#2A2D33`, `#000000` and `#15181D` (all checks pass, ΔE 27 CVD / 31 normal). `--sun-bright #F2B134` is a *fill highlight* for lit hours only, never a series identity.
- Terrain ground fill `--terrain #6F6A62`, edge `--terrain-edge #A39E94` (fills, not series). Unlit hours `--night #0A0B0D`. Status: good `#199e70`, warn `#c98500`, bad `#e66767` (with icon + label, never color alone).

**Type:** Bricolage Grotesque for the wordmark, page titles and the big numbers in the summary tiles; IBM Plex Sans for everything else, `font-variant-numeric: tabular-nums` on all numeric text. No all-caps labels, no monospace labels, no eyebrow strings.

**Layout (desktop ≥ 1024 px; narrower widths stack, no horizontal scroll):**

```
┌ header: Earthrise ─────────────── Explore · Compare (soon) · Learn (soon) ┐
│ [Site ▾ Shackleton rim (high point)]  [Start 2027-01-01] [14 | 30 | 90 d] │
├──────────────────────────────────────┬────────────────────────────────────┤
│                                      │  Sun above the skyline   90.7 %    │
│           SKY-DOME (hero)            │  Longest night            63 h     │
│   skyline · Sun track · Earth track  │  Earth in view            50.0 %   │
│                                      │  Longest Earth gap       334 h     │
│                                      │  Both at once            45.4 %    │
├──────────────────────────────────────┴────────────────────────────────────┤
│ timeline: sunlit strip (amber bars) / Earth strip (blue band) / day ticks │
│ ◀ ▶  ────────────●──────────────────────────  2027-01-14 06:00 UTC        │
└───────────────────────────────────────────────────────────────────────────┘
```
Left-aligned text everywhere; the dome is centred in its panel; filters sit in one row above the charts.

**Anti-default check:** no cream/serif/clay, no acid accent, no card kit with uniform shadows (panels are flat with one hairline), no eyebrows or middle-dot meta strings, motion only in response to the scrubber (and a reduced-motion guard on play).

## Global Constraints

- Everything under `web/`; run commands from inside `web/` (`cd web && ...`). npm with `legacy-peer-deps=true` (already in `.npmrc`).
- Engine files stay pure; browser-only code lives in `src/lib/data/`, `src/workers/`, `src/components/`, `src/app/`.
- Data base URL: `process.env.NEXT_PUBLIC_DATA_BASE ?? '/data'`. Local dev serves `web/public/data` (gitignored) after `uv run python -m lunar_pipeline.cli sync-local --tiles` from `pipeline/`.
- Default window: start `2027-01-01T00:00:00`, 30 days, cursor at hour 0. Window lengths 14 / 30 / 90 days. Step 1 h.
- Featured sites use the committed masks (`data/masks/<id>.json`, mast 2 m). Custom sites compute in the worker with mast 2 m; non-polar sites (lat > −60) are refused with the engine's "no DEM coverage" message shown in the UI.
- Tests: `npm test` (vitest). Component tests declare `// @vitest-environment jsdom` at the top. No snapshot tests.
- Code, comments, docs, commit messages: normal English. Copy in the UI: sentence case, plain verbs.

## Review Focus

1. **Data files missing** (`/data/...` 404 because `sync-local` was not run): the Explore page shows an explanatory empty state with the exact command to run, not a blank screen or an unhandled promise. Pinned by Task 2 `loadSites reports a missing file with its URL` and Task 7 `renders the data-missing state`.
2. **Window runs past the ephemeris table** (start 2036-12-20 + 90 days): the store sets an error message and keeps the previous series, never throws in render. Pinned by Task 3 `setWindow past the table sets an error and keeps state`.
3. **Custom site north of 60°S**: the worker returns the engine error and the UI shows it next to the form; the featured site stays selected. Pinned by Task 4 `handler returns an error for a site without DEM coverage` and Task 6 `custom site form shows the coverage error`.
4. **Scrubber cursor outside the window** after the window shrinks (cursor at hour 2000, window changed to 14 days = 336 h): cursor clamps to the last hour. Pinned by Task 3 `setWindow clamps the cursor`.
5. **Keyboard use**: the scrubber is a native range input (arrow keys move one hour), the site select is a native select, all interactive elements have visible focus. Pinned by Task 6 `scrubber moves one hour per arrow key`.

---

### Task 1: Design tokens, fonts, app frame

**Files:**
- Modify: `web/src/app/globals.css`
- Modify: `web/src/app/layout.tsx`
- Create: `web/src/components/AppFrame.tsx`
- Modify: `web/src/app/page.tsx`
- Create: `web/src/components/AppFrame.test.tsx`
- Modify: `web/package.json` (devDependencies), `web/vitest.config.mts`

**Interfaces:**
- Produces: CSS custom properties listed in the design plan, Tailwind theme tokens (`bg-canvas`, `bg-panel`, `bg-sky`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `text-sun`, `text-earth`, `font-display`, `font-text`); `<AppFrame title?>{children}</AppFrame>` with the header/nav.

- [ ] **Step 1: Install component-test tooling**

```bash
cd web && npm install -D jsdom@^26 @testing-library/react@^16 @testing-library/dom@^10 @vitejs/plugin-react@^6 zustand@^5
```
(`zustand` is a runtime dependency: `npm install zustand@^5`.)

Update `web/vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
```

- [ ] **Step 2: Write the failing frame test**

`web/src/components/AppFrame.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppFrame } from './AppFrame';

describe('AppFrame', () => {
  it('renders the wordmark, navigation and children', () => {
    render(
      <AppFrame>
        <p>hello</p>
      </AppFrame>,
    );
    expect(screen.getByRole('link', { name: 'Earthrise' })).toHaveProperty('href', expect.stringContaining('/'));
    expect(screen.getByRole('link', { name: 'Explore' })).toBeTruthy();
    expect(screen.getByText('Compare')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
```

Run: `cd web && npx vitest run src/components/AppFrame.test.tsx`
Expected: FAIL `Cannot find module './AppFrame'`

- [ ] **Step 3: Tokens, fonts, frame**

`web/src/app/globals.css` (replace the generated file):

```css
@import "tailwindcss";

:root {
  --canvas: #2a2d33;
  --panel: #1c1f24;
  --sky: #000000;
  --line: #3a3e45;
  --ink: #edeae4;
  --ink-2: #b4b0a8;
  --ink-3: #7e7a73;
  --sun: #c98500;
  --sun-bright: #f2b134;
  --earth: #3987e5;
  --terrain: #6f6a62;
  --terrain-edge: #a39e94;
  --night: #0a0b0d;
  --good: #199e70;
  --warn: #c98500;
  --bad: #e66767;
  color-scheme: dark;
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-panel: var(--panel);
  --color-sky: var(--sky);
  --color-line: var(--line);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-sun: var(--sun);
  --color-sun-bright: var(--sun-bright);
  --color-earth: var(--earth);
  --color-terrain: var(--terrain);
  --color-night: var(--night);
  --color-good: var(--good);
  --color-warn: var(--warn);
  --color-bad: var(--bad);
  --font-display: var(--font-bricolage), "Bricolage Grotesque", system-ui, sans-serif;
  --font-text: var(--font-plex), "IBM Plex Sans", system-ui, sans-serif;
}

html {
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-text);
  font-variant-numeric: tabular-nums;
}

:focus-visible {
  outline: 2px solid var(--sun-bright);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

`web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', weight: ['500', '600', '700'] });
const plex = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-plex', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Earthrise — lunar landing site and date planner',
  description:
    'Compare lunar south-pole landing sites and dates: Sun and Earth above the terrain horizon, solar power potential, direct-to-Earth communication windows. NASA Space Apps 2026, team Astroy/Ed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${plex.variable} h-full`}>
      <body className="min-h-full bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
```

`web/src/components/AppFrame.tsx`:

```tsx
import Link from 'next/link';

const NAV = [
  { href: '/explore', label: 'Explore', ready: true },
  { href: '/compare', label: 'Compare', ready: false },
  { href: '/learn', label: 'Learn', ready: false },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-baseline gap-8 border-b border-line px-6 py-3">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          Earthrise
        </Link>
        <nav aria-label="Sections" className="flex gap-5 text-sm">
          {NAV.map((item) =>
            item.ready ? (
              <Link key={item.href} href={item.href} className="text-ink-2 hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span key={item.href} className="text-ink-3" title="Coming in a later week">
                {item.label}
              </span>
            ),
          )}
        </nav>
        <span className="ml-auto text-xs text-ink-3">NASA Space Apps 2026, team Astroy/Ed</span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

`web/src/app/page.tsx`:

```tsx
import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';

export default function Home() {
  return (
    <AppFrame>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-20">
        <h1 className="font-display text-6xl font-semibold tracking-tight">
          When is the Sun up, and can Earth hear you?
        </h1>
        <p className="max-w-prose text-lg text-ink-2">
          Earthrise compares lunar south-pole landing sites and dates. It draws the terrain skyline from
          NASA LOLA elevation data, moves the Sun and Earth with the JPL DE440 ephemeris, and tells you how
          many hours a site is lit and how many hours Earth is in view.
        </p>
        <Link
          href="/explore"
          className="w-fit rounded-md bg-sun px-4 py-2 font-medium text-night hover:bg-sun-bright"
        >
          Explore a site
        </Link>
      </main>
    </AppFrame>
  );
}
```

- [ ] **Step 4: Run tests and build**

Run: `cd web && npx vitest run src/components/AppFrame.test.tsx && npm run build`
Expected: `1 passed`; build succeeds (fonts are fetched at build time; if the network blocks Google Fonts, set `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` is not needed — instead retry; the build must pass).

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat(web): design tokens, fonts and app frame for Earthrise"
```

---

### Task 2: Browser data loaders and fetch tile source

**Files:**
- Create: `web/src/lib/data/loaders.ts`
- Create: `web/src/lib/engine/tiles.fetch.ts`
- Create: `web/src/lib/data/loaders.test.ts`

**Interfaces:**
- Produces: `dataBase(): string`; `DataError` (Error with `url` and `status`); `fetchJson<T>(url)`; `fetchBytes(url)`; `loadSites(base): Promise<Site[]>` (`Site { id; name; lat; lon; category; polar; source }`, featured + derived merged); `loadEphemerisFromUrl(base): Promise<Ephemeris>`; `loadMask(base, siteId): Promise<MaskDoc>` (`MaskDoc { site_id; lat; lon; mast_m; site_height_m; elevation_deg: number[]; bands; fallback_bands }`); `class FetchTileSource implements TileSource` (constructor `(base: string)`, 404 → null); `loadManifest(base): Promise<TileManifest>`.

- [ ] **Step 1: Write the failing tests (real files over a local HTTP server)**

`web/src/lib/data/loaders.test.ts`:

```ts
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError, loadEphemerisFromUrl, loadManifest, loadMask, loadSites } from './loaders';
import { FetchTileSource } from '../engine/tiles.fetch';
import { LevelSampler, levelById } from '../engine/tiles';
import { hasFile, repoPath } from '../engine/__tests__/helpers';

const publicData = repoPath('web', 'public', 'data');
const present = hasFile('web', 'public', 'data', 'sites.json');
let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(publicData, decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (!file.startsWith(publicData) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200).end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => server.close());

describe.skipIf(!present)('data loaders against web/public/data', () => {
  it('loads featured and derived sites', async () => {
    const sites = await loadSites(base);
    expect(sites.map((s) => s.id)).toContain('shackleton_center_rim_high');
    expect(sites.find((s) => s.id === 'blue_ghost_m1')?.polar).toBe(false);
  });
  it('loads the ephemeris and a mask', async () => {
    const eph = await loadEphemerisFromUrl(base);
    expect(eph.n).toBe(113_976);
    const mask = await loadMask(base, 'south_pole');
    expect(mask.elevation_deg.length).toBe(720);
    expect(mask.mast_m).toBe(2);
  });
  it('loadSites reports a missing file with its URL', async () => {
    await expect(loadSites(`${base}/nope`)).rejects.toMatchObject({ name: 'DataError', status: 404 });
    await expect(loadSites(`${base}/nope`)).rejects.toThrow(/nope\/sites\.json/);
  });
});

describe.skipIf(!hasFile('web', 'public', 'data', 'tiles', 'manifest.json'))('FetchTileSource', () => {
  it('samples the south pole through HTTP tiles and returns null for a missing tile', async () => {
    const manifest = await loadManifest(base);
    const src = new FetchTileSource(base);
    const l0 = levelById(manifest, 'L0');
    const sampler = new LevelSampler(l0, src);
    expect(await sampler.valueAt(-90, 0)).toBeCloseTo(1290.12, 1);
    expect(await src.getTileBytes(l0, 999, 999)).toBeNull();
  });
});
```

Run: `cd web && npx vitest run src/lib/data/loaders.test.ts`
Expected: FAIL `Cannot find module './loaders'`

- [ ] **Step 2: Implement**

`web/src/lib/engine/tiles.fetch.ts`:

```ts
import { tilePath, type TileLevel, type TileSource } from './tiles';

/** Reads tiles over HTTP from `${base}/tiles/<level path>`; a 404 means "no tile" (null). */
export class FetchTileSource implements TileSource {
  constructor(private base: string) {}
  async getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null> {
    const res = await fetch(`${this.base}/tiles/${tilePath(level, ty, tx)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`tile ${level.id} ${ty}_${tx}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
```

`web/src/lib/data/loaders.ts`:

```ts
import { loadEphemeris, type Ephemeris, type EphemerisHeader } from '../engine/ephemeris';
import type { TileManifest } from '../engine/tiles';

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
  polar: boolean;
  source: string;
}

export interface MaskDoc {
  site_id: string;
  lat: number;
  lon: number;
  mast_m: number;
  site_height_m: number;
  elevation_deg: number[];
  bands: { grid: string; r_min_m: number; r_max_m: number; step_m: number }[];
  fallback_bands: { grid: string; r_min_m: number; r_max_m: number; step_m: number }[];
}

export class DataError extends Error {
  readonly name = 'DataError';
  constructor(readonly url: string, readonly status: number) {
    super(`could not load ${url} (HTTP ${status})`);
  }
}

export function dataBase(): string {
  return process.env.NEXT_PUBLIC_DATA_BASE ?? '/data';
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new DataError(url, res.status);
  return res;
}

export async function fetchJson<T>(url: string): Promise<T> {
  return (await get(url)).json() as Promise<T>;
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await get(url)).arrayBuffer());
}

export async function loadSites(base: string): Promise<Site[]> {
  const featured = await fetchJson<{ sites: Site[] }>(`${base}/sites.json`);
  let derived: Site[] = [];
  try {
    derived = (await fetchJson<{ sites: Site[] }>(`${base}/sites_derived.json`)).sites;
  } catch (err) {
    if (!(err instanceof DataError && err.status === 404)) throw err;
  }
  return [...featured.sites, ...derived];
}

export async function loadEphemerisFromUrl(base: string): Promise<Ephemeris> {
  const header = await fetchJson<EphemerisHeader>(`${base}/ephemeris/moon_me_2024_2036_1h.json`);
  const bytes = await fetchBytes(`${base}/ephemeris/moon_me_2024_2036_1h.f32`);
  return loadEphemeris(bytes, header);
}

export async function loadMask(base: string, siteId: string): Promise<MaskDoc> {
  return fetchJson<MaskDoc>(`${base}/masks/${siteId}.json`);
}

export async function loadManifest(base: string): Promise<TileManifest> {
  return fetchJson<TileManifest>(`${base}/tiles/manifest.json`);
}
```

- [ ] **Step 3: Run tests**

Run: `cd web && npx vitest run src/lib/data/loaders.test.ts`
Expected: `4 passed` (requires `sync-local --tiles` having been run; otherwise the suites skip — run `uv run --directory ../pipeline python -m lunar_pipeline.cli sync-local --tiles` first, it copies 238 MB into `web/public/data/tiles`).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/data/loaders.ts web/src/lib/data/loaders.test.ts web/src/lib/engine/tiles.fetch.ts
git commit -m "feat(web): data loaders for sites, ephemeris, masks and HTTP tiles"
```

---

### Task 3: Explore store (Zustand) with engine recompute

**Files:**
- Create: `web/src/lib/store/explore.ts`
- Create: `web/src/lib/store/explore.test.ts`

**Interfaces:**
- Produces: `WINDOW_DAYS = [14, 30, 90] as const`; `interface ExploreState { base; status: 'idle' | 'loading' | 'ready' | 'error'; error: string | null; sites: Site[]; eph: Ephemeris | null; siteId: string | null; site: Site | null; mask: Float64Array | null; maskMeta: { siteHeightM: number; source: 'featured' | 'computed' } | null; startUtc: string; days: 14 | 30 | 90; cursorHour: number; series: Series | null; summary: Summary | null; customError: string | null }` plus actions `init(loaders)`, `selectSite(id)`, `setWindow(startUtc, days)`, `setCursor(hour)`, `applyMask(site, mask, meta)`, `setCustomError(msg)`; pure `recompute(eph, site, mask, startUtc, days): { series; summary }` (throws RangeError past the table); `useExploreStore` hook; `createExploreStore()` factory for tests.
- Consumes: `hourlySeries`, `summarize`, `utcToEt` (engine); loaders (Task 2) injected as an object `{ loadSites, loadEphemeris, loadMask }` so tests inject file-backed versions.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/store/explore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { createExploreStore, recompute } from './explore';
import { readBytes, readJson } from '../engine/__tests__/helpers';
import type { Site } from '../data/loaders';

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
const sites = [
  ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
  ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
];
const maskOf = (id: string) => readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);

function fileLoaders() {
  return {
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id: string) => {
      const m = maskOf(id);
      return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  };
}

describe('recompute', () => {
  it('returns a series and summary for a featured site', () => {
    const site = sites.find((s) => s.id === 'shackleton_center_rim_high')!;
    const { series, summary } = recompute(eph, site, Float64Array.from(maskOf(site.id).elevation_deg), '2025-01-01T00:00:00', 30);
    expect(series.hours).toBe(720);
    expect(summary.illumFraction).toBeGreaterThan(0.5);
  });
});

describe('explore store', () => {
  it('init loads sites, ephemeris and the default site', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const s = store.getState();
    expect(s.status).toBe('ready');
    expect(s.siteId).toBe('shackleton_center_rim_high');
    expect(s.series?.hours).toBe(30 * 24);
    expect(s.summary?.longestDarkH).toBeGreaterThanOrEqual(0);
  });
  it('selectSite recomputes and resets the cursor', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().setCursor(100);
    await store.getState().selectSite('shackleton_center');
    const s = store.getState();
    expect(s.siteId).toBe('shackleton_center');
    expect(s.summary?.illumFraction).toBe(0);
    expect(s.cursorHour).toBe(0);
  });
  it('setWindow clamps the cursor', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().setWindow('2027-01-01T00:00:00', 90);
    store.getState().setCursor(2000);
    store.getState().setWindow('2027-01-01T00:00:00', 14);
    expect(store.getState().cursorHour).toBe(14 * 24 - 1);
  });
  it('setWindow past the table sets an error and keeps state', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const before = store.getState().series;
    store.getState().setWindow('2036-12-20T00:00:00', 90);
    const s = store.getState();
    expect(s.error).toMatch(/ephemeris table/);
    expect(s.series).toBe(before);
    expect(s.days).toBe(30);
  });
  it('applyMask installs a computed mask for a custom site', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const custom: Site = { id: 'custom', name: 'Custom site', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };
    store.getState().applyMask(custom, new Float64Array(720).fill(0), { siteHeightM: 0, source: 'computed' });
    expect(store.getState().siteId).toBe('custom');
    expect(store.getState().summary?.illumFraction).toBeGreaterThan(0);
  });
});
```

Run: `cd web && npx vitest run src/lib/store/explore.test.ts`
Expected: FAIL `Cannot find module './explore'`

- [ ] **Step 2: Implement**

`web/src/lib/store/explore.ts`:

```ts
import { create, createStore, type StoreApi } from 'zustand';
import { useStore } from 'zustand';
import { dataBase, loadEphemerisFromUrl, loadMask, loadSites, type MaskDoc, type Site } from '../data/loaders';
import type { Ephemeris } from '../engine/ephemeris';
import { hourlySeries, summarize, type Series, type Summary } from '../engine/metrics';
import { utcToEt } from '../engine/time';

export const WINDOW_DAYS = [14, 30, 90] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];
export const DEFAULT_SITE = 'shackleton_center_rim_high';
export const DEFAULT_START = '2027-01-01T00:00:00';

export interface Loaders {
  loadSites: () => Promise<Site[]>;
  loadEphemeris: () => Promise<Ephemeris>;
  loadMask: (siteId: string) => Promise<MaskDoc>;
}

export interface MaskMeta {
  siteHeightM: number;
  source: 'featured' | 'computed';
}

export interface ExploreState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  customError: string | null;
  sites: Site[];
  eph: Ephemeris | null;
  siteId: string | null;
  site: Site | null;
  mask: Float64Array | null;
  maskMeta: MaskMeta | null;
  startUtc: string;
  days: WindowDays;
  cursorHour: number;
  series: Series | null;
  summary: Summary | null;
  init: () => Promise<void>;
  selectSite: (id: string) => Promise<void>;
  setWindow: (startUtc: string, days: WindowDays) => void;
  setCursor: (hour: number) => void;
  applyMask: (site: Site, mask: Float64Array, meta: MaskMeta) => void;
  setCustomError: (message: string | null) => void;
}

export function recompute(eph: Ephemeris, site: Site, mask: Float64Array, startUtc: string, days: number): { series: Series; summary: Summary } {
  const series = hourlySeries(site, mask, eph, utcToEt(startUtc), days * 24);
  return { series, summary: summarize(series) };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createExploreStore(loaders: Loaders): StoreApi<ExploreState> {
  return createStore<ExploreState>((set, get) => ({
    status: 'idle',
    error: null,
    customError: null,
    sites: [],
    eph: null,
    siteId: null,
    site: null,
    mask: null,
    maskMeta: null,
    startUtc: DEFAULT_START,
    days: 30,
    cursorHour: 0,
    series: null,
    summary: null,

    async init() {
      set({ status: 'loading', error: null });
      try {
        const [sites, eph] = await Promise.all([loaders.loadSites(), loaders.loadEphemeris()]);
        set({ sites, eph });
        await get().selectSite(DEFAULT_SITE);
        set({ status: 'ready' });
      } catch (err) {
        set({ status: 'error', error: message(err) });
      }
    },

    async selectSite(id) {
      const { sites, eph, startUtc, days } = get();
      const site = sites.find((s) => s.id === id);
      if (!site || !eph) {
        set({ error: `unknown site ${id}` });
        return;
      }
      try {
        const doc = await loaders.loadMask(id);
        const mask = Float64Array.from(doc.elevation_deg);
        const { series, summary } = recompute(eph, site, mask, startUtc, days);
        set({ siteId: id, site, mask, maskMeta: { siteHeightM: doc.site_height_m, source: 'featured' }, series, summary, cursorHour: 0, error: null, customError: null });
      } catch (err) {
        set({ error: message(err) });
      }
    },

    setWindow(startUtc, days) {
      const { eph, site, mask, cursorHour } = get();
      if (!eph || !site || !mask) {
        set({ startUtc, days });
        return;
      }
      try {
        const { series, summary } = recompute(eph, site, mask, startUtc, days);
        set({ startUtc, days, series, summary, cursorHour: Math.min(cursorHour, days * 24 - 1), error: null });
      } catch (err) {
        set({ error: message(err) });
      }
    },

    setCursor(hour) {
      const { series } = get();
      const max = series ? series.hours - 1 : 0;
      set({ cursorHour: Math.max(0, Math.min(max, Math.round(hour))) });
    },

    applyMask(site, mask, meta) {
      const { eph, startUtc, days, sites } = get();
      if (!eph) return;
      try {
        const { series, summary } = recompute(eph, site, mask, startUtc, days);
        const known = sites.some((s) => s.id === site.id) ? sites : [...sites, site];
        set({ sites: known, siteId: site.id, site, mask, maskMeta: meta, series, summary, cursorHour: 0, error: null, customError: null });
      } catch (err) {
        set({ error: message(err) });
      }
    },

    setCustomError(customError) {
      set({ customError });
    },
  }));
}

const browserLoaders: Loaders = {
  loadSites: () => loadSites(dataBase()),
  loadEphemeris: () => loadEphemerisFromUrl(dataBase()),
  loadMask: (id) => loadMask(dataBase(), id),
};

export const exploreStore = createExploreStore(browserLoaders);

export function useExploreStore<T>(selector: (s: ExploreState) => T): T {
  return useStore(exploreStore, selector);
}

// `create` is re-exported for consumers that want a hook-bound store in tests.
export { create };
```

- [ ] **Step 3: Run tests**

Run: `cd web && npx vitest run src/lib/store/explore.test.ts`
Expected: `6 passed`

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/store/
git commit -m "feat(web): explore store with engine recompute, window and cursor rules"
```

---

### Task 4: Engine Web Worker and client

**Files:**
- Create: `web/src/lib/engine/worker-handler.ts`
- Create: `web/src/workers/engine.worker.ts`
- Create: `web/src/lib/engine-client.ts`
- Create: `web/src/lib/engine/worker-handler.test.ts`

**Interfaces:**
- Produces: `type EngineRequest = { id: number; type: 'mask'; lat: number; lon: number; base: string; mastM?: number }`; `type EngineResponse = { id: number; type: 'mask'; mask: Float64Array; siteHeightM: number; bands: BandInfo[]; fallbackBands: BandInfo[]; ms: number } | { id: number; type: 'error'; message: string }`; `handleEngineRequest(req, deps: { manifest: (base) => Promise<TileManifest>; source: (base) => TileSource })`: Promise<EngineResponse>`; `class EngineClient { computeMask(lat, lon, opts?): Promise<MaskResult>; dispose() }` using a module Worker when available and falling back to `handleEngineRequest` with fetch deps on the main thread.
- Consumes: `computeSiteMask`, `LevelSampler`, `levelById` (engine), `FetchTileSource`, `loadManifest` (Task 2).

- [ ] **Step 1: Write the failing tests**

`web/src/lib/engine/worker-handler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { handleEngineRequest } from './worker-handler';
import { FsTileSource, readManifest } from './tiles.node';
import { hasFile, readJson, repoPath } from './__tests__/helpers';

const tiles = repoPath('data_out', 'tiles');
const deps = { manifest: async () => readManifest(tiles), source: () => new FsTileSource(tiles) };

describe.skipIf(!hasFile('data_out', 'tiles', 'manifest.json'))('handleEngineRequest', () => {
  it('computes a mask for a featured site that matches the committed one', async () => {
    const py = readJson<{ lat: number; lon: number; elevation_deg: number[] }>('data', 'masks', 'south_pole.json');
    const res = await handleEngineRequest({ id: 1, type: 'mask', lat: py.lat, lon: py.lon, base: 'unused' }, deps);
    expect(res.type).toBe('mask');
    if (res.type !== 'mask') return;
    expect(res.id).toBe(1);
    let worst = 0;
    for (let k = 0; k < 720; k++) worst = Math.max(worst, Math.abs(res.mask[k] - py.elevation_deg[k]));
    expect(worst).toBeLessThan(0.01);
  }, 120_000);
  it('handler returns an error for a site without DEM coverage', async () => {
    const res = await handleEngineRequest({ id: 2, type: 'mask', lat: 18.56, lon: 61.81, base: 'unused' }, deps);
    expect(res).toMatchObject({ id: 2, type: 'error' });
    if (res.type === 'error') expect(res.message).toMatch(/no DEM coverage/);
  });
});
```

Run: `cd web && npx vitest run src/lib/engine/worker-handler.test.ts`
Expected: FAIL `Cannot find module './worker-handler'`

- [ ] **Step 2: Implement**

`web/src/lib/engine/worker-handler.ts`:

```ts
import { computeSiteMask, type BandInfo, type Samplers } from './horizon';
import { LevelSampler, levelById, type TileManifest, type TileSource } from './tiles';

export type EngineRequest = { id: number; type: 'mask'; lat: number; lon: number; base: string; mastM?: number };

export type MaskResult = { mask: Float64Array; siteHeightM: number; bands: BandInfo[]; fallbackBands: BandInfo[]; ms: number };

export type EngineResponse =
  | ({ id: number; type: 'mask' } & MaskResult)
  | { id: number; type: 'error'; message: string };

export interface EngineDeps {
  manifest: (base: string) => Promise<TileManifest>;
  source: (base: string) => TileSource;
}

const samplerCache = new Map<string, Samplers>();

async function samplersFor(base: string, deps: EngineDeps): Promise<Samplers> {
  const cached = samplerCache.get(base);
  if (cached) return cached;
  const manifest = await deps.manifest(base);
  const source = deps.source(base);
  const samplers: Samplers = {
    L0: new LevelSampler(levelById(manifest, 'L0'), source),
    L1: new LevelSampler(levelById(manifest, 'L1'), source),
    L2: new LevelSampler(levelById(manifest, 'L2'), source),
  };
  samplerCache.set(base, samplers);
  return samplers;
}

export async function handleEngineRequest(req: EngineRequest, deps: EngineDeps): Promise<EngineResponse> {
  try {
    const t0 = Date.now();
    const samplers = await samplersFor(req.base, deps);
    const { mask, siteHeightM, bands, fallbackBands } = await computeSiteMask(req.lat, req.lon, samplers, { mastM: req.mastM ?? 2 });
    return { id: req.id, type: 'mask', mask, siteHeightM, bands, fallbackBands, ms: Date.now() - t0 };
  } catch (err) {
    return { id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
```

`web/src/workers/engine.worker.ts`:

```ts
import { loadManifest } from '@/lib/data/loaders';
import { FetchTileSource } from '@/lib/engine/tiles.fetch';
import { handleEngineRequest, type EngineRequest } from '@/lib/engine/worker-handler';

const deps = { manifest: (base: string) => loadManifest(base), source: (base: string) => new FetchTileSource(base) };

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const res = await handleEngineRequest(event.data, deps);
  if (res.type === 'mask') (self as unknown as Worker).postMessage(res, [res.mask.buffer]);
  else (self as unknown as Worker).postMessage(res);
};
```

`web/src/lib/engine-client.ts`:

```ts
import { loadManifest } from './data/loaders';
import { FetchTileSource } from './engine/tiles.fetch';
import { handleEngineRequest, type EngineRequest, type EngineResponse, type MaskResult } from './engine/worker-handler';

/** Runs mask computations off the main thread when Workers exist; falls back to inline execution. */
export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: MaskResult) => void; reject: (e: Error) => void }>();

  constructor(private base: string) {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<EngineResponse>) => {
        const res = event.data;
        const slot = this.pending.get(res.id);
        if (!slot) return;
        this.pending.delete(res.id);
        if (res.type === 'error') slot.reject(new Error(res.message));
        else slot.resolve(res);
      };
      this.worker.onerror = (e) => {
        for (const slot of this.pending.values()) slot.reject(new Error(e.message));
        this.pending.clear();
      };
    }
  }

  async computeMask(lat: number, lon: number, opts: { mastM?: number } = {}): Promise<MaskResult> {
    const req: EngineRequest = { id: this.nextId++, type: 'mask', lat, lon, base: this.base, mastM: opts.mastM };
    if (!this.worker) {
      const res = await handleEngineRequest(req, { manifest: loadManifest, source: (b) => new FetchTileSource(b) });
      if (res.type === 'error') throw new Error(res.message);
      return res;
    }
    return new Promise<MaskResult>((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject });
      this.worker!.postMessage(req);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
```

- [ ] **Step 3: Run tests and type-check**

Run: `cd web && npx vitest run src/lib/engine/worker-handler.test.ts && npx tsc --noEmit`
Expected: `2 passed`; no type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/engine/worker-handler.ts web/src/lib/engine/worker-handler.test.ts web/src/workers/engine.worker.ts web/src/lib/engine-client.ts
git commit -m "feat(web): engine web worker with inline fallback for custom-site masks"
```

---

### Task 5: Sky-dome and timeline geometry helpers + components

**Files:**
- Create: `web/src/lib/viz/dome.ts`, `web/src/lib/viz/dome.test.ts`
- Create: `web/src/lib/viz/timeline.ts`, `web/src/lib/viz/timeline.test.ts`
- Create: `web/src/components/SkyDome.tsx`, `web/src/components/SkyDome.test.tsx`
- Create: `web/src/components/Timeline.tsx`, `web/src/components/Timeline.test.tsx`

**Interfaces:**
- `dome.ts`: `EL_MIN = -10`; `domeRadius(el, R)`; `domeProject(az, el, R): { x; y }` (north up, east right, centre 0,0); `skylinePath(mask: ArrayLike<number>, R): string` (closed path along the skyline); `groundPath(mask, R): string` (annulus between skyline and outer rim, even-odd); `trackPath(az: ArrayLike<number>, el: ArrayLike<number>, R, from, to, every = 1): string` (polyline with `M` breaks on NaN / wrap jumps > 180° az are fine since we project to xy).
- `timeline.ts`: `binSeries(series: Series, bins: number): { sunMax: Float64Array; sunMean: Float64Array; earthFrac: Float64Array; hoursPerBin: number }`; `hourAtX(x, width, hours)`; `xAtHour(hour, width, hours)`; `dayTicks(startUtc, hours, width, minPx = 56): { x: number; label: string }[]` (labels like `Jan 14`).
- Components: `<SkyDome mask series cursor size?/>` (SVG, `role="img"`, `aria-label` with the cursor's Sun/Earth positions); `<Timeline series startUtc cursor onCursor/>` (SVG with pointer handling; `role="group"`; tooltips via `<title>` + a hover readout).

- [ ] **Step 1: Write the failing helper tests**

`web/src/lib/viz/dome.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { domeProject, domeRadius, groundPath, skylinePath, trackPath } from './dome';

describe('dome projection', () => {
  it('puts the zenith at the centre, the horizon at 90 % radius and -10 deg at the rim', () => {
    expect(domeRadius(90, 100)).toBeCloseTo(0, 9);
    expect(domeRadius(0, 100)).toBeCloseTo(90, 9);
    expect(domeRadius(-10, 100)).toBeCloseTo(100, 9);
    expect(domeRadius(-30, 100)).toBeCloseTo(100, 9);
  });
  it('maps azimuth clockwise from north (up) to east (right)', () => {
    expect(domeProject(0, 0, 100)).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(-90, 9) });
    expect(domeProject(90, 0, 100)).toEqual({ x: expect.closeTo(90, 9), y: expect.closeTo(0, 9) });
    expect(domeProject(180, 45, 100)).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(45, 9) });
  });
  it('builds closed skyline and ground paths', () => {
    const mask = new Float64Array(720).fill(2);
    const sky = skylinePath(mask, 100);
    expect(sky.startsWith('M')).toBe(true);
    expect(sky.endsWith('Z')).toBe(true);
    expect(sky.split('L').length).toBe(720);
    expect(groundPath(mask, 100).split('Z').length).toBe(3);
  });
  it('breaks a track at NaN samples', () => {
    const az = Float64Array.from([0, 10, NaN, 30, 40]);
    const el = Float64Array.from([1, 2, 3, 4, 5]);
    const d = trackPath(az, el, 100, 0, 5);
    expect(d.split('M').length - 1).toBe(2);
  });
});
```

`web/src/lib/viz/timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import { binSeries, dayTicks, hourAtX, xAtHour } from './timeline';

function series(hours: number): Series {
  const sunFraction = new Float64Array(hours);
  const earthVisible = new Uint8Array(hours);
  for (let h = 0; h < hours; h++) {
    sunFraction[h] = h % 48 < 24 ? 1 : 0;
    earthVisible[h] = h % 96 < 48 ? 1 : 0;
  }
  return { i0: 0, hours, sunAz: new Float64Array(hours), sunEl: new Float64Array(hours), earthAz: new Float64Array(hours), earthEl: new Float64Array(hours), sunFraction, earthVisible };
}

describe('timeline helpers', () => {
  it('bins hours into max / mean / fraction', () => {
    const b = binSeries(series(96), 4);
    expect(b.hoursPerBin).toBe(24);
    expect(Array.from(b.sunMax)).toEqual([1, 0, 1, 0]);
    expect(Array.from(b.sunMean)).toEqual([1, 0, 1, 0]);
    expect(Array.from(b.earthFrac)).toEqual([1, 1, 0, 0]);
  });
  it('maps x to hours and back', () => {
    expect(hourAtX(0, 720, 720)).toBe(0);
    expect(hourAtX(719.9, 720, 720)).toBe(719);
    expect(hourAtX(-5, 720, 720)).toBe(0);
    expect(xAtHour(360, 720, 720)).toBeCloseTo(360.5, 9);
  });
  it('labels days without crowding', () => {
    const ticks = dayTicks('2027-01-01T00:00:00', 14 * 24, 700, 56);
    expect(ticks[0]).toEqual({ x: 0, label: 'Jan 1' });
    expect(ticks.length).toBeLessThanOrEqual(13);
    expect(ticks.every((t, i) => i === 0 || t.x - ticks[i - 1].x >= 56)).toBe(true);
  });
});
```

Run: `cd web && npx vitest run src/lib/viz`
Expected: FAIL `Cannot find module './dome'` / `'./timeline'`

- [ ] **Step 2: Implement helpers**

`web/src/lib/viz/dome.ts`:

```ts
export const EL_MIN = -10;
const DEG = Math.PI / 180;

/** Radius for an elevation: zenith at the centre, horizon at 0.9 R, EL_MIN at the rim (clamped). */
export function domeRadius(elDeg: number, R: number): number {
  const el = Math.max(EL_MIN, Math.min(90, elDeg));
  return (R * (90 - el)) / (90 - EL_MIN);
}

export function domeProject(azDeg: number, elDeg: number, R: number): { x: number; y: number } {
  const r = domeRadius(elDeg, R);
  return { x: r * Math.sin(azDeg * DEG), y: -r * Math.cos(azDeg * DEG) };
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

export function skylinePath(mask: ArrayLike<number>, R: number): string {
  const n = mask.length;
  const parts: string[] = [];
  for (let k = 0; k < n; k++) {
    const { x, y } = domeProject((k * 360) / n, mask[k], R);
    parts.push(`${k === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`);
  }
  return `${parts.join('')}Z`;
}

/** Outer rim minus the skyline (fill-rule evenodd) = the ground below the terrain horizon. */
export function groundPath(mask: ArrayLike<number>, R: number): string {
  return `M${fmt(-R)} 0A${fmt(R)} ${fmt(R)} 0 1 0 ${fmt(R)} 0A${fmt(R)} ${fmt(R)} 0 1 0 ${fmt(-R)} 0Z${skylinePath(mask, R)}`;
}

/** Polyline through (az, el) samples [from, to); NaN samples break the line. */
export function trackPath(az: ArrayLike<number>, el: ArrayLike<number>, R: number, from: number, to: number, every = 1): string {
  let d = '';
  let pen = false;
  for (let i = from; i < to; i += every) {
    if (Number.isNaN(az[i]) || Number.isNaN(el[i])) {
      pen = false;
      continue;
    }
    const { x, y } = domeProject(az[i], el[i], R);
    d += `${pen ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`;
    pen = true;
  }
  return d;
}
```

`web/src/lib/viz/timeline.ts`:

```ts
import type { Series } from '../engine/metrics';

export function binSeries(series: Series, bins: number): { sunMax: Float64Array; sunMean: Float64Array; earthFrac: Float64Array; hoursPerBin: number } {
  const hoursPerBin = series.hours / bins;
  const sunMax = new Float64Array(bins), sunMean = new Float64Array(bins), earthFrac = new Float64Array(bins);
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * hoursPerBin), end = Math.floor((b + 1) * hoursPerBin);
    let max = 0, sum = 0, vis = 0;
    for (let h = start; h < end; h++) {
      const f = series.sunFraction[h];
      if (f > max) max = f;
      sum += f;
      vis += series.earthVisible[h];
    }
    const n = Math.max(1, end - start);
    sunMax[b] = max;
    sunMean[b] = sum / n;
    earthFrac[b] = vis / n;
  }
  return { sunMax, sunMean, earthFrac, hoursPerBin };
}

export function hourAtX(x: number, width: number, hours: number): number {
  return Math.max(0, Math.min(hours - 1, Math.floor((x / width) * hours)));
}

export function xAtHour(hour: number, width: number, hours: number): number {
  return ((hour + 0.5) / hours) * width;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One tick per UTC day at x = day start, thinned so ticks are at least minPx apart. */
export function dayTicks(startUtc: string, hours: number, width: number, minPx = 56): { x: number; label: string }[] {
  const start = new Date(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  const ticks: { x: number; label: string }[] = [];
  let lastX = -Infinity;
  for (let h = 0; h < hours; h += 24) {
    const d = new Date(start.getTime() + h * 3_600_000);
    const x = (h / hours) * width;
    if (x - lastX < minPx) continue;
    ticks.push({ x, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` });
    lastX = x;
  }
  return ticks;
}
```

Run: `cd web && npx vitest run src/lib/viz`
Expected: `7 passed`

- [ ] **Step 3: Write the failing component tests**

`web/src/components/SkyDome.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { SkyDome } from './SkyDome';

function series(hours: number): Series {
  const s: Series = { i0: 0, hours, sunAz: new Float64Array(hours), sunEl: new Float64Array(hours), earthAz: new Float64Array(hours), earthEl: new Float64Array(hours), sunFraction: new Float64Array(hours), earthVisible: new Uint8Array(hours) };
  for (let h = 0; h < hours; h++) {
    s.sunAz[h] = (h * 360) / 708; s.sunEl[h] = 1.2; s.sunFraction[h] = 1;
    s.earthAz[h] = 20; s.earthEl[h] = 3 * Math.sin(h / 100); s.earthVisible[h] = s.earthEl[h] > 0 ? 1 : 0;
  }
  return s;
}

describe('SkyDome', () => {
  it('draws the ground, both tracks and the cursor markers', () => {
    const { container, getByRole } = render(<SkyDome mask={new Float64Array(720).fill(1)} series={series(240)} cursor={10} />);
    expect(container.querySelector('[data-part="ground"]')).toBeTruthy();
    expect(container.querySelector('[data-part="sun-track"]')?.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('[data-part="earth-track"]')?.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('[data-part="sun-now"]')).toBeTruthy();
    expect(container.querySelector('[data-part="earth-now"]')).toBeTruthy();
    expect(getByRole('img').getAttribute('aria-label')).toMatch(/Sun .* Earth /);
  });
});
```

`web/src/components/Timeline.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { Timeline } from './Timeline';

function series(hours: number): Series {
  const s: Series = { i0: 0, hours, sunAz: new Float64Array(hours), sunEl: new Float64Array(hours), earthAz: new Float64Array(hours), earthEl: new Float64Array(hours), sunFraction: new Float64Array(hours), earthVisible: new Uint8Array(hours) };
  for (let h = 0; h < hours; h++) { s.sunFraction[h] = h % 48 < 24 ? 1 : 0; s.earthVisible[h] = h % 96 < 48 ? 1 : 0; }
  return s;
}

describe('Timeline', () => {
  it('renders lit bars and reports the clicked hour', () => {
    const onCursor = vi.fn();
    const { container } = render(<Timeline series={series(336)} startUtc="2027-01-01T00:00:00" cursor={0} onCursor={onCursor} width={672} />);
    expect(container.querySelectorAll('[data-part="sun-bar"]').length).toBeGreaterThan(100);
    const surface = container.querySelector('[data-part="hit"]') as SVGRectElement;
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 672, height: 80, right: 672, bottom: 80, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(surface, { clientX: 336, clientY: 10 });
    expect(onCursor).toHaveBeenCalledWith(168);
  });
});
```

Run: `cd web && npx vitest run src/components/SkyDome.test.tsx src/components/Timeline.test.tsx`
Expected: FAIL `Cannot find module './SkyDome'` / `'./Timeline'`

- [ ] **Step 4: Implement components**

`web/src/components/SkyDome.tsx`:

```tsx
'use client';
import type { Series } from '@/lib/engine/metrics';
import { domeProject, groundPath, skylinePath, trackPath } from '@/lib/viz/dome';

const R = 260;
const VIEW = 600;

function fmtAzEl(az: number, el: number): string {
  return `azimuth ${az.toFixed(0)}°, elevation ${el.toFixed(1)}°`;
}

export function SkyDome({ mask, series, cursor, size = '100%' }: { mask: ArrayLike<number>; series: Series; cursor: number; size?: number | string }) {
  const sun = domeProject(series.sunAz[cursor], series.sunEl[cursor], R);
  const earth = domeProject(series.earthAz[cursor], series.earthEl[cursor], R);
  const lit = series.sunFraction[cursor] > 0;
  const earthUp = series.earthVisible[cursor] === 1;
  const label = `Sky dome. Sun ${fmtAzEl(series.sunAz[cursor], series.sunEl[cursor])}, ${lit ? 'above' : 'below'} the skyline. Earth ${fmtAzEl(series.earthAz[cursor], series.earthEl[cursor])}, ${earthUp ? 'in view' : 'hidden'}.`;
  const rings = [0, 30, 60];
  return (
    <svg viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`} width={size} height={size} role="img" aria-label={label} className="block">
      <circle r={R} fill="var(--sky)" />
      {rings.map((el) => (
        <circle key={el} r={(R * (90 - el)) / 100} fill="none" stroke="var(--line)" strokeDasharray={el === 0 ? undefined : '3 5'} />
      ))}
      <path data-part="ground" d={groundPath(mask, R)} fill="var(--terrain)" fillRule="evenodd" />
      <path data-part="skyline" d={skylinePath(mask, R)} fill="none" stroke="var(--terrain-edge)" strokeWidth={1.5} />
      <path data-part="sun-track" d={trackPath(series.sunAz, series.sunEl, R, 0, series.hours)} fill="none" stroke="var(--sun)" strokeWidth={2} strokeOpacity={0.85} />
      <path data-part="earth-track" d={trackPath(series.earthAz, series.earthEl, R, 0, series.hours)} fill="none" stroke="var(--earth)" strokeWidth={2} strokeOpacity={0.85} />
      <circle data-part="earth-now" cx={earth.x} cy={earth.y} r={7} fill="var(--earth)" stroke="var(--sky)" strokeWidth={2} opacity={earthUp ? 1 : 0.45} />
      <circle data-part="sun-now" cx={sun.x} cy={sun.y} r={9} fill={lit ? 'var(--sun-bright)' : 'var(--sun)'} stroke="var(--sky)" strokeWidth={2} opacity={lit ? 1 : 0.45} />
      {[
        ['N', 0, -R - 16],
        ['E', R + 16, 0],
        ['S', 0, R + 20],
        ['W', -R - 16, 0],
      ].map(([t, x, y]) => (
        <text key={t as string} x={x as number} y={y as number} textAnchor="middle" dominantBaseline="middle" fill="var(--ink-2)" fontSize={14}>
          {t}
        </text>
      ))}
      <text x={-R} y={R + 40} fill="var(--ink-3)" fontSize={12}>
        rings: horizon, 30°, 60° · rim −10°
      </text>
    </svg>
  );
}
```

`web/src/components/Timeline.tsx`:

```tsx
'use client';
import { useMemo, useRef } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { binSeries, dayTicks, hourAtX, xAtHour } from '@/lib/viz/timeline';

const H_SUN = 44;
const H_EARTH = 14;
const H_AXIS = 22;
const GAP = 6;

export function Timeline({ series, startUtc, cursor, onCursor, width = 960 }: { series: Series; startUtc: string; cursor: number; onCursor: (hour: number) => void; width?: number }) {
  const bins = Math.min(series.hours, Math.max(48, Math.floor(width / 3)));
  const binned = useMemo(() => binSeries(series, bins), [series, bins]);
  const ticks = useMemo(() => dayTicks(startUtc, series.hours, width), [startUtc, series.hours, width]);
  const dragging = useRef(false);
  const height = H_SUN + GAP + H_EARTH + GAP + H_AXIS;
  const binW = width / bins;
  const cursorX = xAtHour(cursor, width, series.hours);

  const pick = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onCursor(hourAtX(((e.clientX - box.left) / box.width) * width, width, series.hours));
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="group" aria-label="Timeline of sunlit hours and Earth visibility" className="block select-none">
      <rect x={0} y={0} width={width} height={H_SUN} fill="var(--night)" />
      {Array.from(binned.sunMax, (v, b) => (
        v > 0 ? (
          <rect key={b} data-part="sun-bar" x={b * binW} y={H_SUN * (1 - v)} width={Math.max(1, binW - 0.5)} height={H_SUN * v} fill={v >= 0.999 ? 'var(--sun-bright)' : 'var(--sun)'} />
        ) : null
      ))}
      <rect x={0} y={H_SUN + GAP} width={width} height={H_EARTH} fill="var(--night)" />
      {Array.from(binned.earthFrac, (v, b) => (
        v > 0 ? <rect key={b} data-part="earth-bar" x={b * binW} y={H_SUN + GAP} width={Math.max(1, binW - 0.5)} height={H_EARTH} fill="var(--earth)" opacity={0.35 + 0.65 * v} /> : null
      ))}
      {ticks.map((t) => (
        <g key={t.x}>
          <line x1={t.x} x2={t.x} y1={0} y2={H_SUN + GAP + H_EARTH} stroke="var(--canvas)" strokeOpacity={0.6} />
          <text x={t.x + 3} y={height - 6} fill="var(--ink-3)" fontSize={11}>{t.label}</text>
        </g>
      ))}
      <line data-part="cursor" x1={cursorX} x2={cursorX} y1={0} y2={H_SUN + GAP + H_EARTH} stroke="var(--ink)" strokeWidth={2} />
      <rect
        data-part="hit"
        x={0}
        y={0}
        width={width}
        height={H_SUN + GAP + H_EARTH}
        fill="transparent"
        style={{ cursor: 'crosshair' }}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); pick(e); }}
        onPointerMove={(e) => { if (dragging.current) pick(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}
      />
    </svg>
  );
}
```

Run: `cd web && npx vitest run src/components src/lib/viz`
Expected: `10 passed`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz web/src/components/SkyDome.tsx web/src/components/SkyDome.test.tsx web/src/components/Timeline.tsx web/src/components/Timeline.test.tsx
git commit -m "feat(web): sky-dome and timeline visualizations with projection helpers"
```

---

### Task 6: Controls — site picker, window controls, scrubber, summary tiles

**Files:**
- Create: `web/src/components/SiteSelect.tsx`, `web/src/components/SiteSelect.test.tsx`
- Create: `web/src/components/WindowControls.tsx`, `web/src/components/WindowControls.test.tsx`
- Create: `web/src/components/SummaryTiles.tsx`, `web/src/components/SummaryTiles.test.tsx`
- Create: `web/src/lib/viz/format.ts`

**Interfaces:**
- `format.ts`: `pct(x)` → `"90.7 %"`; `hoursLabel(h)` → `"63 h"` or `"14 d 6 h"` for ≥ 48 h; `utcLabel(startUtc, hour)` → `"2027-01-14 06:00 UTC"`.
- `<SiteSelect sites value onSelect onCustom(lat, lon) customError busy/>`: native `<select>` labelled "Site" plus a "Custom site" disclosure with latitude/longitude inputs and a "Compute skyline" button; shows `customError` in the form.
- `<WindowControls startUtc days cursor hours onWindow(start, days) onCursor/>`: date input (UTC date), segmented 14/30/90 radio group, native range scrubber `aria-label="Time cursor"` with `step=1`, current time label, play/pause toggling a 12 h/s advance (respects `prefers-reduced-motion`: play disabled with a note).
- `<SummaryTiles summary hours/>`: five tiles + a "table" toggle rendering the same numbers as a `<table>`.

- [ ] **Step 1: Write the failing tests**

`web/src/components/SummaryTiles.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryTiles } from './SummaryTiles';

describe('SummaryTiles', () => {
  it('shows the five planner numbers and a table view', () => {
    render(<SummaryTiles summary={{ hours: 720, illumFraction: 0.9068, meanSunFraction: 0.86, longestDarkH: 63, earthVisFraction: 0.4998, longestEarthGapH: 334, jointFraction: 0.454 }} />);
    expect(screen.getByText('90.7 %')).toBeTruthy();
    expect(screen.getByText('63 h')).toBeTruthy();
    expect(screen.getByText('13 d 22 h')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.getByRole('table')).toBeTruthy();
  });
});
```

`web/src/components/WindowControls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WindowControls } from './WindowControls';

describe('WindowControls', () => {
  it('scrubber moves one hour per arrow key and reports window changes', () => {
    const onCursor = vi.fn();
    const onWindow = vi.fn();
    render(<WindowControls startUtc="2027-01-01T00:00:00" days={30} cursor={10} hours={720} onWindow={onWindow} onCursor={onCursor} />);
    const slider = screen.getByRole('slider', { name: 'Time cursor' }) as HTMLInputElement;
    expect(slider.step).toBe('1');
    expect(slider.max).toBe('719');
    fireEvent.change(slider, { target: { value: '11' } });
    expect(onCursor).toHaveBeenCalledWith(11);
    fireEvent.click(screen.getByRole('radio', { name: '14 days' }));
    expect(onWindow).toHaveBeenCalledWith('2027-01-01T00:00:00', 14);
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2027-03-05' } });
    expect(onWindow).toHaveBeenCalledWith('2027-03-05T00:00:00', 30);
    expect(screen.getByText('2027-01-01 10:00 UTC')).toBeTruthy();
  });
});
```

`web/src/components/SiteSelect.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteSelect } from './SiteSelect';

const sites = [
  { id: 'a', name: 'Site A', lat: -89, lon: 0, category: 'classic', polar: true, source: '' },
  { id: 'b', name: 'Site B', lat: -85, lon: 10, category: 'clps_landed', polar: true, source: '' },
];

describe('SiteSelect', () => {
  it('selects featured sites and submits a custom site', () => {
    const onSelect = vi.fn();
    const onCustom = vi.fn();
    render(<SiteSelect sites={sites} value="a" onSelect={onSelect} onCustom={onCustom} customError={null} busy={false} />);
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'b' } });
    expect(onSelect).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Custom site' }));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-88.5' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compute skyline' }));
    expect(onCustom).toHaveBeenCalledWith(-88.5, -160);
  });
  it('custom site form shows the coverage error', () => {
    render(<SiteSelect sites={sites} value="a" onSelect={() => {}} onCustom={() => {}} customError="no DEM coverage north of 60S (lat 18.56)" busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom site' }));
    expect(screen.getByRole('alert').textContent).toMatch(/no DEM coverage/);
  });
});
```

Run: `cd web && npx vitest run src/components/SummaryTiles.test.tsx src/components/WindowControls.test.tsx src/components/SiteSelect.test.tsx`
Expected: FAIL (modules missing)

- [ ] **Step 2: Implement**

`web/src/lib/viz/format.ts`:

```ts
export function pct(x: number): string {
  return `${(x * 100).toFixed(1)} %`;
}

export function hoursLabel(h: number): string {
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24), r = h % 24;
  return r === 0 ? `${d} d` : `${d} d ${r} h`;
}

export function utcLabel(startUtc: string, hour: number): string {
  const start = new Date(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  const d = new Date(start.getTime() + hour * 3_600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}
```

`web/src/components/SummaryTiles.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { Summary } from '@/lib/engine/metrics';
import { hoursLabel, pct } from '@/lib/viz/format';

export function SummaryTiles({ summary }: { summary: Summary }) {
  const [table, setTable] = useState(false);
  const rows: [string, string, string][] = [
    ['Sun above the skyline', pct(summary.illumFraction), 'share of hours with any part of the Sun visible'],
    ['Longest night', hoursLabel(summary.longestDarkH), 'longest run of unlit hours'],
    ['Earth in view', pct(summary.earthVisFraction), 'share of hours with Earth above the skyline'],
    ['Longest Earth gap', hoursLabel(summary.longestEarthGapH), 'longest run without direct line of sight'],
    ['Both at once', pct(summary.jointFraction), 'lit and in contact with Earth'],
  ];
  return (
    <section aria-label="Summary" className="flex flex-col gap-3">
      {table ? (
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v, note]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-1 text-left font-normal text-ink-2">{k}</th>
                <td className="py-1 text-right font-medium">{v}</td>
                <td className="py-1 pl-3 text-ink-3">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <dl className="grid gap-3">
          {rows.map(([k, v, note]) => (
            <div key={k} className="border-t border-line pt-2">
              <dt className="text-sm text-ink-2">{k}</dt>
              <dd className="font-display text-3xl font-semibold leading-tight">{v}</dd>
              <dd className="text-xs text-ink-3">{note}</dd>
            </div>
          ))}
        </dl>
      )}
      <button type="button" onClick={() => setTable((t) => !t)} className="w-fit text-xs text-ink-2 underline-offset-4 hover:underline">
        {table ? 'Show as tiles' : 'Show as table'}
      </button>
    </section>
  );
}
```

`web/src/components/WindowControls.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { WINDOW_DAYS, type WindowDays } from '@/lib/store/explore';
import { utcLabel } from '@/lib/viz/format';

export function WindowControls({ startUtc, days, cursor, hours, onWindow, onCursor }: { startUtc: string; days: WindowDays; cursor: number; hours: number; onWindow: (startUtc: string, days: WindowDays) => void; onCursor: (hour: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = cursorRef.current + 1;
      if (next >= hours) setPlaying(false);
      else onCursor(next);
    }, 1000 / 12);
    return () => window.clearInterval(id);
  }, [playing, hours, onCursor]);

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <label className="flex flex-col gap-1 text-sm text-ink-2">
        Start date (UTC)
        <input
          type="date"
          value={startUtc.slice(0, 10)}
          min="2024-01-02"
          max="2036-12-30"
          onChange={(e) => e.target.value && onWindow(`${e.target.value}T00:00:00`, days)}
          className="rounded-md border border-line bg-panel px-2 py-1 text-ink"
        />
      </label>
      <fieldset className="flex items-center gap-1 text-sm">
        <legend className="mb-1 text-ink-2">Window</legend>
        {WINDOW_DAYS.map((d) => (
          <label key={d} className={`cursor-pointer rounded-md border px-3 py-1 ${d === days ? 'border-sun bg-panel text-ink' : 'border-line text-ink-2'}`}>
            <input type="radio" name="window" className="sr-only" checked={d === days} onChange={() => onWindow(startUtc, d)} aria-label={`${d} days`} />
            {d} days
          </label>
        ))}
      </fieldset>
      <div className="flex min-w-[320px] flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          disabled={reduced}
          title={reduced ? 'Autoplay is off because your system prefers reduced motion' : undefined}
          className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink disabled:opacity-50"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          aria-label="Time cursor"
          min={0}
          max={Math.max(0, hours - 1)}
          step={1}
          value={cursor}
          onChange={(e) => onCursor(Number(e.target.value))}
          className="flex-1 accent-[var(--sun)]"
        />
        <span className="w-[170px] text-right text-sm text-ink">{utcLabel(startUtc, cursor)}</span>
      </div>
    </div>
  );
}
```

`web/src/components/SiteSelect.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { Site } from '@/lib/data/loaders';
import { normalizeLon } from '@/lib/engine/geometry';

const GROUPS: [string, string][] = [
  ['classic', 'Classic south-pole sites'],
  ['clps_landed', 'CLPS landings'],
  ['reference', 'Reference'],
  ['custom', 'Custom'],
];

export function SiteSelect({ sites, value, onSelect, onCustom, customError, busy }: { sites: Site[]; value: string | null; onSelect: (id: string) => void; onCustom: (lat: number, lon: number) => void; customError: string | null; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState('-89.5');
  const [lon, setLon] = useState('0');
  const latNum = Number(lat), lonNum = Number(lon);
  const valid = Number.isFinite(latNum) && Number.isFinite(lonNum) && latNum >= -90 && latNum <= 90;
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink-2">
        Site
        <select value={value ?? ''} onChange={(e) => onSelect(e.target.value)} className="min-w-[280px] rounded-md border border-line bg-panel px-2 py-1 text-ink">
          {GROUPS.map(([cat, label]) => {
            const items = sites.filter((s) => s.category === cat && s.polar);
            return items.length ? (
              <optgroup key={cat} label={label}>
                {items.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </label>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink">
        Custom site
      </button>
      {open && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onCustom(latNum, normalizeLon(lonNum));
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-ink-2">
            Latitude
            <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" className="w-28 rounded-md border border-line bg-panel px-2 py-1 text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-2">
            Longitude
            <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" className="w-28 rounded-md border border-line bg-panel px-2 py-1 text-ink" />
          </label>
          <button type="submit" disabled={!valid || busy} className="rounded-md bg-sun px-3 py-1 text-sm font-medium text-night hover:bg-sun-bright disabled:opacity-50">
            {busy ? 'Computing…' : 'Compute skyline'}
          </button>
          {customError && (
            <p role="alert" className="basis-full text-sm text-bad">
              {customError}. Custom sites need LOLA coverage south of 60°S.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
```

Run: `cd web && npx vitest run src/components`
Expected: `7 passed` (AppFrame 1, SkyDome 1, Timeline 1, SummaryTiles 1, WindowControls 1, SiteSelect 2)

- [ ] **Step 3: Commit**

```bash
git add web/src/components web/src/lib/viz/format.ts
git commit -m "feat(web): site picker with custom sites, window controls and scrubber, summary tiles"
```

---

### Task 7: Explore page assembly, empty/error states, visual critique

**Files:**
- Create: `web/src/components/ExploreView.tsx`, `web/src/components/ExploreView.test.tsx`
- Create: `web/src/app/explore/page.tsx`

**Interfaces:**
- `<ExploreView store?>` — client component reading `useExploreStore` (or a store passed for tests), calling `init()` on mount, laying out SiteSelect + WindowControls (top row), SkyDome (left, hero), SummaryTiles (right), Timeline (full width). Uses `EngineClient` for custom sites (created lazily, disposed on unmount). States: `loading` → "Loading NASA data…"; `error` with a `DataError` → "Data files are missing. Run `uv run python -m lunar_pipeline.cli sync-local --tiles` in pipeline/ and reload."; `ready` → the screen.

- [ ] **Step 1: Write the failing test**

`web/src/components/ExploreView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { DataError } from '@/lib/data/loaders';
import { ExploreView } from './ExploreView';

describe('ExploreView', () => {
  it('renders the data-missing state', async () => {
    const store = createExploreStore({
      loadSites: async () => { throw new DataError('/data/sites.json', 404); },
      loadEphemeris: async () => { throw new DataError('/data/ephemeris/x', 404); },
      loadMask: async () => { throw new DataError('/data/masks/x', 404); },
    });
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles/));
  });
});
```

Run: `cd web && npx vitest run src/components/ExploreView.test.tsx`
Expected: FAIL `Cannot find module './ExploreView'`

- [ ] **Step 2: Implement**

`web/src/components/ExploreView.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { SiteSelect } from './SiteSelect';
import { SkyDome } from './SkyDome';
import { SummaryTiles } from './SummaryTiles';
import { Timeline } from './Timeline';
import { WindowControls } from './WindowControls';
import { dataBase } from '@/lib/data/loaders';
import { EngineClient } from '@/lib/engine-client';
import { exploreStore, type ExploreState } from '@/lib/store/explore';

export function ExploreView({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const [busy, setBusy] = useState(false);
  const client = useRef<EngineClient | null>(null);
  useEffect(() => {
    void s.init();
    return () => client.current?.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCustom = useMemo(
    () => async (lat: number, lon: number) => {
      setBusy(true);
      try {
        client.current ??= new EngineClient(dataBase());
        const res = await client.current.computeMask(lat, lon);
        s.applyMask({ id: `custom_${lat}_${lon}`, name: `Custom ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`, lat, lon, category: 'custom', polar: true, source: 'user' }, res.mask, { siteHeightM: res.siteHeightM, source: 'computed' });
      } catch (err) {
        s.setCustomError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [s],
  );

  if (s.status === 'loading' || s.status === 'idle') {
    return (
      <AppFrame>
        <p className="px-6 py-10 text-ink-2">Loading NASA data…</p>
      </AppFrame>
    );
  }
  if (s.status === 'error' || !s.series || !s.summary || !s.mask) {
    const missing = /HTTP 404/.test(s.error ?? '');
    return (
      <AppFrame>
        <div role="alert" className="mx-6 my-10 max-w-prose border-l-2 border-bad pl-4 text-ink-2">
          <p className="text-ink">{missing ? 'Data files are missing.' : 'Something went wrong while loading.'}</p>
          <p className="mt-2 text-sm">
            {missing
              ? 'Run `uv run python -m lunar_pipeline.cli sync-local --tiles` inside pipeline/ and reload this page.'
              : s.error}
          </p>
        </div>
      </AppFrame>
    );
  }
  return (
    <AppFrame>
      <main className="flex flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SiteSelect sites={s.sites} value={s.siteId} onSelect={(id) => void s.selectSite(id)} onCustom={onCustom} customError={s.customError} busy={busy} />
          <WindowControls startUtc={s.startUtc} days={s.days} cursor={s.cursorHour} hours={s.series.hours} onWindow={s.setWindow} onCursor={s.setCursor} />
        </div>
        {s.error && <p role="status" className="text-sm text-warn">{s.error}</p>}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
          <section aria-label="Sky dome" className="rounded-md bg-panel p-4">
            <h1 className="font-display text-2xl font-semibold">{s.site?.name}</h1>
            <p className="text-sm text-ink-2">
              {s.site?.lat.toFixed(3)}°, {s.site?.lon.toFixed(3)}° · skyline from LOLA {s.maskMeta?.source === 'computed' ? 'computed in your browser' : 'precomputed'} · site height {s.maskMeta?.siteHeightM.toFixed(0)} m
            </p>
            <div className="mx-auto mt-3 max-w-[640px]">
              <SkyDome mask={s.mask} series={s.series} cursor={s.cursorHour} />
            </div>
          </section>
          <aside className="rounded-md bg-panel p-4">
            <SummaryTiles summary={s.summary} />
          </aside>
        </div>
        <section aria-label="Timeline" className="rounded-md bg-panel p-4">
          <Timeline series={s.series} startUtc={s.startUtc} cursor={s.cursorHour} onCursor={s.setCursor} />
        </section>
      </main>
    </AppFrame>
  );
}
```

`web/src/app/explore/page.tsx`:

```tsx
import { ExploreView } from '@/components/ExploreView';

export default function ExplorePage() {
  return <ExploreView />;
}
```

- [ ] **Step 3: Tests, type-check, build**

Run: `cd web && npm test && npx tsc --noEmit && npm run build && npm run lint`
Expected: all test files pass (Week 2A 35 + new ≈ 21 = 56), no type errors, build lists `/explore`, lint clean.

- [ ] **Step 4: Visual critique with a real browser**

Run `cd web && npm run dev` (background). Open `http://localhost:3000/explore` with the Playwright MCP (`browser_navigate`, then `browser_take_screenshot`) and look at the screenshot. Check: dome centred, skyline visible as a grey ring with bumps, Sun track skimming the horizon, Earth track near the horizon on one side, timeline bars amber/black in ~2-week bands, tiles readable, no overflow at 1280 px and at 900 px. Fix spacing/contrast issues found, re-screenshot once, then stop (one pass of polish).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ExploreView.tsx web/src/components/ExploreView.test.tsx web/src/app/explore/page.tsx
git commit -m "feat(web): Explore screen for one site with sky-dome, timeline, scrubber and custom sites"
```

---

## Self-review notes

- Spec coverage: §3 MVP Site picker (Task 6, featured + custom), Sky-dome (Task 5), Timeline (Task 5); §4 Explore layout minus the 3D panel (Week 3) and the compare/drawer (Week 4); Review Focus 1–5 pinned by the named tests.
- Not in this plan: Web Worker progress reporting, tile caching in IndexedDB/Cache API (Week 6 offline), best-window UI (Week 4), Learn mode.
- Types: `Site` comes from `lib/data/loaders` and is reused by the store and components; `Series`/`Summary` from the engine; `WindowDays` from the store.
