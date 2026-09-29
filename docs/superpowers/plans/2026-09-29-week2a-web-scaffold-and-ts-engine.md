# Week 2A — Web Scaffold and TypeScript Science Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Earthrise web app (Next.js 16, `web/`) and port the Week 1 science (time, geometry, ephemeris interpolation, tile sampling, horizon masks, illumination metrics) to TypeScript with tests that prove parity against the Python pipeline's committed artifacts and JPL Horizons.

**Architecture:** Pure TypeScript engine modules under `web/src/lib/engine/` with no DOM or React dependency, so they run in Node (vitest) today and in a Web Worker next. Data comes from the repo's committed `data/` (ephemeris, masks, sites, fixtures) and the gitignored `data_out/tiles` through a `TileSource` interface with a filesystem implementation (tests, scripts) and a fetch implementation (browser). Python gains two golden-fixture commands so every TS module has a numeric parity target.

**Tech Stack:** Next.js 16.3 (App Router, TypeScript, Tailwind, ESLint, `src/`), vitest 5 (node environment), vite-tsconfig-paths, tsx. Python side unchanged (uv, numpy, spiceypy).

**Spec:** `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md` (sections 5, 5.1–5.3, 6). Week 1 artifacts: `data/ephemeris/moon_me_2024_2036_1h.{f32,json}`, `data/masks/*.json`, `data/sites*.json`, `data/fixtures/horizons/*.json`, `data_out/tiles/manifest.json` (+ 706 tiles).

## Global Constraints

- Web app lives in `web/` (sibling of `pipeline/`); Vercel root directory will be `web`. Package manager: npm (pnpm is broken on the dev machine). Node 20.19.
- Engine modules import nothing from React, Next.js, or the DOM. Node-only helpers (`fs`) live only in `*.node.ts` files and `scripts/`.
- Same numeric conventions as Python: `R_MOON_M = 1737400`, angles in degrees at API boundaries, `x = ρ sin λ`, `y = ρ cos λ`, `col = sample_offset + x/scale`, `row = line_offset − y/scale` (0-based pixel centres), azimuth clockwise from north in `[0, 360)`, `TDB − UTC = 69.184 s` (valid until the next leap second; none scheduled).
- Ephemeris binary: little-endian float32, row-major `[step][body][xyz]`, Sun = body 0, Earth = body 1, km. Catmull-Rom interpolation with the Python range rule (`1 ≤ x ≤ n−3`).
- Tiles: `zlib` (RFC 1950) compressed little-endian int16, 512×512 row-major, `nodata = -32768`, DN × 0.5 m.
- Parity gates: Horizons az/el `< 0.002°`; masks vs Python JSON `< 0.01°`; metrics fractions `< 1e-6`, integer hours exact.
- Committed data budget unchanged (`data/` < 30 MB); `web/public/data/` is gitignored and filled by `sync_local`.
- Code, comments, docs, commit messages: normal English.

## Review Focus

1. **A tile is missing or fails to load** (not synced, 404): the sampler must return NaN for that area (treated as no coverage), never throw mid-mask or return 0 m. Pinned by Task 6 `test: missing tile samples as NaN`.
2. **Epoch outside the table** (before 2024-01-01T01:00 or after 2036-12-31T20:00): `interpVectors` throws a `RangeError` naming the range; `hourlySeries` throws before computing. Pinned by Task 5 `interpVectors rejects epochs outside the table` and Task 8 `hourlySeries rejects a span past the table`.
3. **UTC strings without a trailing `Z`** (`2025-03-02T08:34:00`) must be read as UTC, not local time. Pinned by Task 3 `parses naive ISO strings as UTC`.
4. **A site north of 60°S** asked for a horizon mask: explicit error "no DEM coverage", never a silent −90° mask. Pinned by Task 7 `bandsForSite rejects sites north of 60S`.
5. **Corrupt or truncated ephemeris file** (byte length ≠ n·24): `loadEphemeris` throws instead of producing garbage. Pinned by Task 5 `loadEphemeris rejects wrong byte length`.

---

### Task 1: Next.js scaffold, vitest, placeholder page

**Files:**
- Create: `web/` via `create-next-app` (package.json, tsconfig.json, next.config.ts, eslint config, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`)
- Create: `web/vitest.config.mts`
- Create: `web/src/lib/engine/__tests__/helpers.ts`
- Create: `web/src/lib/engine/__tests__/helpers.test.ts`
- Modify: `web/package.json` (scripts, devDependencies)
- Modify: `web/src/app/page.tsx`, `web/src/app/layout.tsx`

**Interfaces:**
- Produces: `repoPath(...parts)`, `hasFile(...parts)`, `readJson<T>(...parts)`, `readBytes(...parts)` in `__tests__/helpers.ts` (repo root = `web/..`), used by every later test.

- [ ] **Step 1: Scaffold the app (network; retry on ECONNRESET)**

Run from the repo root `C:\Users\user\Documents\GitHub\Trinity`:

```bash
npx --yes create-next-app@16.3.6 web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes
```

Expected: `web/` with `package.json` (`next` 16.3.x, `react` 19), `src/app/page.tsx`, `tsconfig.json`; `npm run build` not yet run.

Then add test tooling:

```bash
npm --prefix web install -D vitest@^5.0.2 vite-tsconfig-paths@^6.1.1 tsx@^4.23.15
```

- [ ] **Step 2: Configure vitest and scripts**

`web/vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
```

In `web/package.json` set scripts (keep the generated `dev`, `build`, `start`, `lint`):

```json
"test": "vitest run",
"test:watch": "vitest",
"engine:demo": "tsx scripts/engine-demo.ts"
```

- [ ] **Step 3: Write the failing helper test**

`web/src/lib/engine/__tests__/helpers.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

/** Repo root: vitest runs with cwd = web/. */
export const REPO_ROOT = path.resolve(process.cwd(), '..');
export const repoPath = (...parts: string[]): string => path.join(REPO_ROOT, ...parts);
export const hasFile = (...parts: string[]): boolean => fs.existsSync(repoPath(...parts));
export const readJson = <T>(...parts: string[]): T =>
  JSON.parse(fs.readFileSync(repoPath(...parts), 'utf8')) as T;
export const readBytes = (...parts: string[]): Uint8Array =>
  new Uint8Array(fs.readFileSync(repoPath(...parts)));
```

`web/src/lib/engine/__tests__/helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasFile, readJson, repoPath } from './helpers';

describe('test helpers', () => {
  it('resolves the repository root from web/', () => {
    expect(repoPath('pipeline', 'pyproject.toml')).toMatch(/pipeline[\\/]pyproject\.toml$/);
    expect(hasFile('pipeline', 'pyproject.toml')).toBe(true);
  });
  it('reads committed JSON artifacts', () => {
    const sites = readJson<{ version: number; sites: { id: string }[] }>('data', 'sites.json');
    expect(sites.version).toBe(1);
    expect(sites.sites.map((s) => s.id)).toContain('shackleton_center');
  });
});
```

Run: `npm --prefix web test`
Expected: FAIL (before Step 4 the helpers file exists, so this passes — to see RED, run the test before creating `helpers.ts`: `Cannot find module './helpers'`). Create the test first, run, observe the failure, then create `helpers.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix web test`
Expected: `2 passed`

- [ ] **Step 5: Placeholder page**

`web/src/app/layout.tsx` — set metadata:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Earthrise — lunar landing site and date planner',
  description:
    'Compare lunar south-pole landing sites and dates: Sun and Earth above the terrain horizon, solar power potential, direct-to-Earth communication windows. NASA Space Apps 2026, team Astroy/Ed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
```

`web/src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">NASA Space Apps 2026 · Astroy/Ed</p>
      <h1 className="text-5xl font-semibold tracking-tight">Earthrise</h1>
      <p className="text-lg text-zinc-300">
        Pick a lunar landing site and a date in 60 seconds. See exactly when the Sun powers you and
        when Earth can hear you.
      </p>
      <p className="text-sm text-zinc-500">
        Engine status: TypeScript port of the LOLA / SPICE pipeline in progress (Week 2).
      </p>
    </main>
  );
}
```

Run: `npm --prefix web run build`
Expected: build succeeds (`✓ Compiled`, route `/` static).

- [ ] **Step 6: Commit**

```bash
git add web/ .gitignore
git commit -m "feat(web): scaffold Earthrise Next.js app with vitest and repo test helpers"
```

(If `create-next-app` added its own `web/.gitignore`, keep it; the root `.gitignore` already ignores `node_modules/`, `.next/`, `public/data/`.)

---

### Task 2: Python golden fixtures and local data sync

**Files:**
- Create: `pipeline/lunar_pipeline/fixtures.py`
- Create: `pipeline/lunar_pipeline/sync_local.py`
- Create: `pipeline/tests/test_fixtures.py`
- Modify: `pipeline/lunar_pipeline/cli.py` (add `fixture-time`, `fixture-metrics`, `sync-local`)
- Create (generated, committed): `data/fixtures/time/utc_et.json`, `data/fixtures/metrics/shackleton_center_rim_high_2025-01-01_730d.json`, `data/fixtures/metrics/im1_odysseus_2025-01-01_730d.json`

**Interfaces:**
- Produces: `data/fixtures/time/utc_et.json` = `{"tdb_minus_utc_s": 69.184, "pairs": [{"utc": "2024-01-01T00:17:05", "et": ...}, ...]}` (50 pairs).
- Produces: metrics fixture = `{site_id, lat, lon, start_utc, days, start_index, metrics: {hours, illum_fraction, mean_sun_fraction, longest_dark_h, earth_vis_fraction, longest_earth_gap_h, joint_fraction}, sample_indexes: [...], samples: {sun_az, sun_el, earth_az, earth_el, sun_fraction}, earth_visible: [...]}`.
- Produces: `sync_local.sync(web_data: Path, tiles: bool) -> list[Path]`.

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_fixtures.py`:

```python
import json

import pytest

from lunar_pipeline import config
from lunar_pipeline.fixtures import metrics_fixture, time_pairs, write_metrics_fixture, write_time_fixture
from lunar_pipeline.sync_local import sync
from tests.conftest import needs_kernels, needs_lola


@needs_kernels
def test_time_pairs_are_monotonic_and_offset_by_tdb_minus_utc():
    pairs = time_pairs(n=12)
    assert len(pairs) == 12 and all(p["utc"].endswith(":05") or p["utc"][-2:].isdigit() for p in pairs)
    ets = [p["et"] for p in pairs]
    assert ets == sorted(ets)
    # J2000 = 2000-01-01T12:00:00 TDB; for 2024+ dates TDB-UTC = 69.184 s to within 2 ms.
    from datetime import datetime, timezone
    for p in pairs:
        unix = datetime.strptime(p["utc"], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
        assert abs((unix - 946728000.0 + 69.184) - p["et"]) < 0.002


@needs_kernels
def test_write_time_fixture(tmp_path):
    path = write_time_fixture(out=tmp_path / "utc_et.json", n=5)
    doc = json.loads(path.read_text())
    assert doc["tdb_minus_utc_s"] == 69.184 and len(doc["pairs"]) == 5


@pytest.mark.data
@needs_kernels
@needs_lola
def test_metrics_fixture_matches_report(tmp_path):
    from lunar_pipeline.illumination import report

    doc = metrics_fixture("shackleton_center_rim_high", "2025-01-01T00:00:00", 30)
    assert doc["metrics"] == report("shackleton_center_rim_high", "2025-01-01T00:00:00", 30)["metrics"]
    assert doc["sample_indexes"][:3] == [0, 1, 2] and len(doc["samples"]["sun_az"]) == len(doc["sample_indexes"])
    assert all(0.0 <= az < 360.0 for az in doc["samples"]["sun_az"])
    path = write_metrics_fixture("shackleton_center_rim_high", "2025-01-01T00:00:00", 30, out_dir=tmp_path)
    assert path.name == "shackleton_center_rim_high_2025-01-01_30d.json"


def test_sync_local_copies_small_artifacts(tmp_path):
    copied = sync(web_data=tmp_path / "public" / "data", tiles=False)
    assert (tmp_path / "public" / "data" / "sites.json").exists()
    assert (tmp_path / "public" / "data" / "ephemeris" / "moon_me_2024_2036_1h.json").exists()
    assert (tmp_path / "public" / "data" / "masks" / "south_pole.json").exists()
    assert not (tmp_path / "public" / "data" / "tiles").exists()
    assert copied
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest tests/test_fixtures.py -q`
Expected: collection error `No module named 'lunar_pipeline.fixtures'`

- [ ] **Step 3: Implement fixtures.py, sync_local.py, CLI entries**

`pipeline/lunar_pipeline/fixtures.py`:

```python
"""Golden fixtures for the TypeScript engine port."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config
from .ephemeris import load_table
from .illumination import hourly_series, summarize
from .masks import load_mask
from .sites import all_sites
from .spice_env import spice_kernels, utc_to_et

SAMPLE_INDEXES = list(range(48)) + list(range(48, 17520, 500))


def time_pairs(n: int = 50) -> list[dict]:
    """UTC strings spread over the table span at odd offsets, with SPICE's TDB seconds past J2000."""
    t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
    out: list[dict] = []
    with spice_kernels():
        for i in range(n):
            t = t0 + timedelta(days=(97 * i) % 4700, hours=(3 * i) % 24, minutes=17, seconds=5 + (i % 50))
            utc = t.strftime("%Y-%m-%dT%H:%M:%S")
            out.append({"utc": utc, "et": utc_to_et(utc)})
    return out


def write_time_fixture(out: Path = config.DATA_DIR / "fixtures" / "time" / "utc_et.json", n: int = 50) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"tdb_minus_utc_s": 69.184, "pairs": time_pairs(n)}, indent=1) + "\n")
    return out


def metrics_fixture(site_id: str, start_utc: str, days: int) -> dict:
    site = next(s for s in all_sites() if s.id == site_id)
    table, header = load_table()
    mask = load_mask(site_id)
    series = hourly_series(site, mask, table, header, start_utc, days * 24)
    idx = [i for i in SAMPLE_INDEXES if i < days * 24]
    return {
        "site_id": site_id,
        "lat": site.lat,
        "lon": site.lon,
        "start_utc": start_utc,
        "days": days,
        "start_index": int(series["utc_index"][0]),
        "metrics": summarize(series),
        "sample_indexes": idx,
        "samples": {
            key: [float(series[key][i]) for i in idx]
            for key in ("sun_az", "sun_el", "earth_az", "earth_el", "sun_fraction")
        },
        "earth_visible": [bool(series["earth_visible"][i]) for i in idx],
    }


def write_metrics_fixture(
    site_id: str,
    start_utc: str = "2025-01-01T00:00:00",
    days: int = 730,
    out_dir: Path = config.DATA_DIR / "fixtures" / "metrics",
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = metrics_fixture(site_id, start_utc, days)
    path = out_dir / f"{site_id}_{start_utc[:10]}_{days}d.json"
    path.write_text(json.dumps(doc, indent=1) + "\n")
    return path
```

`pipeline/lunar_pipeline/sync_local.py`:

```python
"""Copy committed artifacts (and optionally the DEM tiles) into web/public/data for local development."""

from __future__ import annotations

import shutil
from pathlib import Path

from . import config

WEB_DATA = config.REPO_ROOT / "web" / "public" / "data"
SMALL_DIRS = ["ephemeris", "masks", "fixtures"]
SMALL_FILES = ["sites.json", "sites_derived.json"]


def sync(web_data: Path = WEB_DATA, tiles: bool = False) -> list[Path]:
    copied: list[Path] = []
    web_data.mkdir(parents=True, exist_ok=True)
    for rel in SMALL_DIRS:
        src = config.DATA_DIR / rel
        if src.exists():
            shutil.copytree(src, web_data / rel, dirs_exist_ok=True)
            copied.append(web_data / rel)
    for name in SMALL_FILES:
        src = config.DATA_DIR / name
        if src.exists():
            shutil.copy2(src, web_data / name)
            copied.append(web_data / name)
    if tiles:
        src = config.OUT_DIR / "tiles"
        if not src.exists():
            raise FileNotFoundError(f"{src} missing; run the tiles command first")
        shutil.copytree(src, web_data / "tiles", dirs_exist_ok=True)
        copied.append(web_data / "tiles")
    return copied
```

In `pipeline/lunar_pipeline/cli.py`, inside `build_parser()` add before `return p`:

```python
    ft = sub.add_parser("fixture-time", help="write UTC->ET golden pairs for the TS port")
    ft.add_argument("--n", type=int, default=50)
    fm = sub.add_parser("fixture-metrics", help="write a metrics golden fixture for a site")
    fm.add_argument("--site", required=True)
    fm.add_argument("--start", default="2025-01-01T00:00:00")
    fm.add_argument("--days", type=int, default=730)
    sl = sub.add_parser("sync-local", help="copy artifacts into web/public/data")
    sl.add_argument("--tiles", action="store_true")
```

and in `main()` add branches:

```python
    elif args.cmd == "fixture-time":
        from .fixtures import write_time_fixture
        print(write_time_fixture(n=args.n))
    elif args.cmd == "fixture-metrics":
        from .fixtures import write_metrics_fixture
        print(write_metrics_fixture(args.site, args.start, args.days))
    elif args.cmd == "sync-local":
        from .sync_local import sync
        for path in sync(tiles=args.tiles):
            print(path)
```

Also extend `tests/test_cli.py::test_cli_has_all_subcommands` list with `"fixture-time"`, `"fixture-metrics"`, `"sync-local"` (the `fixture-metrics` case needs `["--site", "x"]` like `report`).

- [ ] **Step 4: Run tests, generate fixtures**

Run: `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest tests/test_fixtures.py tests/test_cli.py -q`
Expected: `6 passed`

Run:
```bash
uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline python -m lunar_pipeline.cli fixture-time
uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline python -m lunar_pipeline.cli fixture-metrics --site shackleton_center_rim_high
uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline python -m lunar_pipeline.cli fixture-metrics --site im1_odysseus
uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline python -m lunar_pipeline.cli sync-local
```
Expected: `data/fixtures/time/utc_et.json` (50 pairs), two metrics fixtures (~15 KB each), and `web/public/data/` populated (gitignored).

- [ ] **Step 5: Commit**

```bash
git add pipeline/ data/fixtures/time data/fixtures/metrics
git commit -m "feat(pipeline): golden time and metrics fixtures for the TypeScript port, local data sync"
```

---

### Task 3: Constants and time conversion

**Files:**
- Create: `web/src/lib/engine/constants.ts`
- Create: `web/src/lib/engine/time.ts`
- Create: `web/src/lib/engine/time.test.ts`

**Interfaces:**
- Produces: `R_MOON_M`, `R_MOON_KM`, `AU_KM`, `SUN_RADIUS_KM`, `TDB_MINUS_UTC_S`, `J2000_UNIX_S`; `utcToEt(utc: string | Date): number`; `etToUtcDate(et: number): Date`; `etToIso(et: number): string` (`YYYY-MM-DDTHH:MM:SS`, UTC).

- [ ] **Step 1: Write the failing tests**

`web/src/lib/engine/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { etToIso, etToUtcDate, utcToEt } from './time';
import { readJson } from './__tests__/helpers';

interface TimeFixture { tdb_minus_utc_s: number; pairs: { utc: string; et: number }[] }

describe('utcToEt', () => {
  it('matches SPICE str2et to 10 ms for every golden pair', () => {
    const fx = readJson<TimeFixture>('data', 'fixtures', 'time', 'utc_et.json');
    expect(fx.pairs.length).toBeGreaterThanOrEqual(50);
    for (const p of fx.pairs) expect(Math.abs(utcToEt(p.utc) - p.et)).toBeLessThan(0.01);
  });
  it('parses naive ISO strings as UTC', () => {
    expect(utcToEt('2025-03-02T08:34:00')).toBe(utcToEt('2025-03-02T08:34:00Z'));
    expect(utcToEt(new Date('2025-03-02T08:34:00Z'))).toBe(utcToEt('2025-03-02T08:34:00'));
  });
  it('rejects garbage', () => {
    expect(() => utcToEt('not a date')).toThrow(/invalid UTC/);
  });
  it('round-trips through etToUtcDate and etToIso', () => {
    const et = utcToEt('2031-07-04T12:34:56');
    expect(etToUtcDate(et).toISOString()).toBe('2031-07-04T12:34:56.000Z');
    expect(etToIso(et)).toBe('2031-07-04T12:34:56');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- time`
Expected: FAIL `Cannot find module './time'`

- [ ] **Step 3: Implement**

`web/src/lib/engine/constants.ts`:

```ts
/** LOLA reference sphere radius (metres) and derived units. */
export const R_MOON_M = 1737400;
export const R_MOON_KM = 1737.4;
export const AU_KM = 149_597_870.7;
export const SUN_RADIUS_KM = 695_700;
/** TDB − UTC in seconds. Valid from 2017-01-01 until the next leap second (none scheduled). */
export const TDB_MINUS_UTC_S = 69.184;
/** 2000-01-01T12:00:00 UTC as Unix seconds. */
export const J2000_UNIX_S = 946_728_000;
```

`web/src/lib/engine/time.ts`:

```ts
import { J2000_UNIX_S, TDB_MINUS_UTC_S } from './constants';

const HAS_ZONE = /(Z|[+-]\d\d:?\d\d)$/;

/** UTC (ISO string or Date) -> TDB seconds past J2000, matching SPICE str2et to a few ms. */
export function utcToEt(utc: string | Date): number {
  const ms = utc instanceof Date ? utc.getTime() : Date.parse(HAS_ZONE.test(utc) ? utc : `${utc}Z`);
  if (Number.isNaN(ms)) throw new Error(`invalid UTC time: ${String(utc)}`);
  return ms / 1000 - J2000_UNIX_S + TDB_MINUS_UTC_S;
}

export function etToUtcDate(et: number): Date {
  return new Date((et - TDB_MINUS_UTC_S + J2000_UNIX_S) * 1000);
}

/** `YYYY-MM-DDTHH:MM:SS` in UTC (no fractional seconds). */
export function etToIso(et: number): string {
  return etToUtcDate(Math.round(et * 1000) / 1000).toISOString().slice(0, 19);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix web test -- time`
Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/engine/constants.ts web/src/lib/engine/time.ts web/src/lib/engine/time.test.ts
git commit -m "feat(engine): constants and UTC/TDB time conversion with SPICE parity test"
```

---

### Task 4: Geometry

**Files:**
- Create: `web/src/lib/engine/geometry.ts`
- Create: `web/src/lib/engine/geometry.test.ts`

**Interfaces:**
- Produces: `type Vec3 = [number, number, number]`; `normalizeLon(lon)`; `siteVectorKm(lat, lon, heightM = 0): Vec3`; `enuBasis(lat, lon): { east: Vec3; north: Vec3; up: Vec3 }`; `azElFromBodyVector(body: ArrayLike<number>, lat, lon, heightM = 0): { az: number; el: number }`; `psSouthXY(lat, lon): { x: number; y: number }`; `psSouthLatLon(x, y): { lat: number; lon: number }`; `wrapAz(deg): number` (`[0, 360)`).

- [ ] **Step 1: Write the failing tests**

`web/src/lib/engine/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { R_MOON_M } from './constants';
import { azElFromBodyVector, enuBasis, normalizeLon, psSouthLatLon, psSouthXY, siteVectorKm, wrapAz } from './geometry';

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('geometry', () => {
  it('normalizeLon wraps into (-180, 180]', () => {
    expect(normalizeLon(200)).toBeCloseTo(-160, 12);
    expect(normalizeLon(-160)).toBeCloseTo(-160, 12);
    expect(normalizeLon(180)).toBe(180);
    expect(normalizeLon(-180)).toBe(180);
    expect(normalizeLon(360)).toBeCloseTo(0, 12);
  });
  it('wrapAz never returns 360', () => {
    expect(wrapAz(-3e-15)).toBe(0);
    expect(wrapAz(-90)).toBe(270);
    expect(wrapAz(450)).toBe(90);
  });
  it('enuBasis is orthonormal and right-handed', () => {
    const { east, north, up } = enuBasis(-85, 30);
    for (const v of [east, north, up]) expect(Math.hypot(...v)).toBeCloseTo(1, 12);
    expect(Math.abs(dot(east, north))).toBeLessThan(1e-12);
    expect(Math.abs(dot(east, up))).toBeLessThan(1e-12);
    const cross = [east[1] * north[2] - east[2] * north[1], east[2] * north[0] - east[0] * north[2], east[0] * north[1] - east[1] * north[0]];
    expect(cross[0]).toBeCloseTo(up[0], 12);
    expect(cross[1]).toBeCloseTo(up[1], 12);
    expect(cross[2]).toBeCloseTo(up[2], 12);
  });
  it('gives cardinal azimuths and zenith', () => {
    const lat = -85, lon = 30;
    const p = siteVectorKm(lat, lon);
    const { east, north, up } = enuBasis(lat, lon);
    const at = (v: number[]) => azElFromBodyVector([p[0] + 1e6 * v[0], p[1] + 1e6 * v[1], p[2] + 1e6 * v[2]], lat, lon);
    expect(at(up).el).toBeCloseTo(90, 6);
    expect(at(east).az).toBeCloseTo(90, 6);
    expect(at(east).el).toBeCloseTo(0, 6);
    expect(at(north).az).toBeCloseTo(0, 6);
    expect(at([-north[0], -north[1], -north[2]]).az).toBeCloseTo(180, 6);
  });
  it('applies Earth parallax at the limb', () => {
    const { az, el } = azElFromBodyVector([384_400, 0, 0], 0, 90);
    expect(el).toBeCloseTo(-(Math.atan2(R_MOON_M / 1000, 384_400) * 180) / Math.PI, 9);
    expect(az).toBeCloseTo(270, 6);
  });
  it('projects 87.5S to 75,820.4 m from the pole', () => {
    const a = psSouthXY(-87.5, 0);
    expect(Math.abs(a.x)).toBeLessThan(1e-6);
    expect(a.y).toBeCloseTo(2 * R_MOON_M * Math.tan((1.25 * Math.PI) / 180), 3);
    expect(a.y).toBeCloseTo(75_820.4, 0);
    const b = psSouthXY(-87.5, 90);
    expect(b.x).toBeCloseTo(75_820.4, 0);
    expect(Math.abs(b.y)).toBeLessThan(1e-6);
  });
  it('round-trips the projection', () => {
    for (let i = 0; i < 200; i++) {
      const lat = -90 + 30 * ((i * 37) % 101) / 100;
      const lon = -180 + 360 * ((i * 53) % 97) / 97;
      const { x, y } = psSouthXY(lat, lon);
      const back = psSouthLatLon(x, y);
      expect(back.lat).toBeCloseTo(lat, 9);
      const dlon = ((back.lon - lon + 540) % 360) - 180;
      expect(Math.abs(dlon)).toBeLessThan(1e-7);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- geometry`
Expected: FAIL `Cannot find module './geometry'`

- [ ] **Step 3: Implement**

`web/src/lib/engine/geometry.ts`:

```ts
import { R_MOON_M } from './constants';

export type Vec3 = [number, number, number];

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Wrap longitude into (-180, 180]. */
export function normalizeLon(lonDeg: number): number {
  const l = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  return l === -180 ? 180 : l;
}

/** Wrap an angle into [0, 360). `x % 360` can return exactly 360 for tiny negatives; fmod-style avoids it. */
export function wrapAz(deg: number): number {
  const w = (deg % 360) + 360;
  return w % 360;
}

export function siteVectorKm(latDeg: number, lonDeg: number, heightM = 0): Vec3 {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const r = (R_MOON_M + heightM) / 1000;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

export function enuBasis(latDeg: number, lonDeg: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return {
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

/**
 * Topocentric azimuth (deg clockwise from north, [0, 360)) and elevation (deg) of a body given
 * by its MOON_ME position vector (km, Moon-centred). The site offset is subtracted (parallax).
 */
export function azElFromBodyVector(body: ArrayLike<number>, latDeg: number, lonDeg: number, heightM = 0): { az: number; el: number } {
  const p = siteVectorKm(latDeg, lonDeg, heightM);
  const dx = body[0] - p[0], dy = body[1] - p[1], dz = body[2] - p[2];
  const { east, north, up } = enuBasis(latDeg, lonDeg);
  const de = dx * east[0] + dy * east[1] + dz * east[2];
  const dn = dx * north[0] + dy * north[1] + dz * north[2];
  const du = dx * up[0] + dy * up[1] + dz * up[2];
  return { az: wrapAz(Math.atan2(de, dn) * RAD), el: Math.atan2(du, Math.hypot(de, dn)) * RAD };
}

/** South polar stereographic (sphere, true scale at the pole): x = ρ sin λ, y = ρ cos λ. */
export function psSouthXY(latDeg: number, lonDeg: number): { x: number; y: number } {
  const rho = 2 * R_MOON_M * Math.tan(((90 - Math.abs(latDeg)) / 2) * DEG);
  const lon = lonDeg * DEG;
  return { x: rho * Math.sin(lon), y: rho * Math.cos(lon) };
}

export function psSouthLatLon(x: number, y: number): { lat: number; lon: number } {
  const rho = Math.hypot(x, y);
  return { lat: -90 + 2 * Math.atan(rho / (2 * R_MOON_M)) * RAD, lon: Math.atan2(x, y) * RAD };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix web test -- geometry`
Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/engine/geometry.ts web/src/lib/engine/geometry.test.ts
git commit -m "feat(engine): site geometry, az/el with parallax, south polar stereographic projection"
```

---

### Task 5: Ephemeris table loader and interpolation (Horizons parity)

**Files:**
- Create: `web/src/lib/engine/ephemeris.ts`
- Create: `web/src/lib/engine/ephemeris.test.ts`

**Interfaces:**
- Produces: `interface EphemerisHeader { t0_et: number; step_s: number; n: number; shape: number[]; bodies: string[]; frame: string }`; `interface Ephemeris { t0Et: number; stepS: number; n: number; data: Float32Array }`; `loadEphemeris(bytes: ArrayBuffer | Uint8Array, header: EphemerisHeader): Ephemeris` (throws on wrong byte length); `rowVectors(eph, i): { sun: Vec3; earth: Vec3 }`; `interpVectors(eph, et): { sun: Vec3; earth: Vec3 }` (RangeError outside `1 ≤ x ≤ n−3`); `indexForEt(eph, et): number` (nearest row); `etForIndex(eph, i): number`.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/engine/ephemeris.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { AU_KM } from './constants';
import { azElFromBodyVector } from './geometry';
import { interpVectors, loadEphemeris, rowVectors, type EphemerisHeader } from './ephemeris';
import { utcToEt } from './time';
import { readBytes, readJson, repoPath } from './__tests__/helpers';

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);

describe('ephemeris', () => {
  it('loads the committed table', () => {
    expect(eph.n).toBe(113_976);
    expect(eph.data.length).toBe(113_976 * 6);
    const { sun, earth } = rowVectors(eph, 0);
    expect(Math.hypot(...sun) / AU_KM).toBeGreaterThan(0.97);
    expect(Math.hypot(...sun) / AU_KM).toBeLessThan(1.03);
    expect(Math.hypot(...earth)).toBeGreaterThan(356_000);
    expect(Math.hypot(...earth)).toBeLessThan(407_000);
  });
  it('loadEphemeris rejects wrong byte length', () => {
    expect(() => loadEphemeris(new Uint8Array(10), header)).toThrow(/byte length/);
  });
  it('interpVectors rejects epochs outside the table', () => {
    expect(() => interpVectors(eph, eph.t0Et - 10)).toThrow(RangeError);
    expect(() => interpVectors(eph, eph.t0Et + (eph.n - 1) * eph.stepS)).toThrow(RangeError);
  });
  it('interpVectors reproduces grid rows exactly and is smooth between them', () => {
    const et = eph.t0Et + 1000 * eph.stepS;
    const a = interpVectors(eph, et);
    const r = rowVectors(eph, 1000);
    expect(a.sun[0]).toBeCloseTo(r.sun[0], 6);
    const mid = interpVectors(eph, et + eph.stepS / 2);
    const next = rowVectors(eph, 1001);
    const between = (v: number, lo: number, hi: number) => v >= Math.min(lo, hi) - 1e3 && v <= Math.max(lo, hi) + 1e3;
    expect(between(mid.sun[0], r.sun[0], next.sun[0])).toBe(true);
  });
  it('matches JPL Horizons az/el to 0.002 deg for every fixture row', () => {
    const dir = repoPath('data', 'fixtures', 'horizons');
    const files = fs.readdirSync(dir).filter((f) => /_(sun|earth)\.json$/.test(f));
    expect(files.length).toBe(12);
    let worstEl = 0, worstAz = 0, rows = 0;
    for (const f of files) {
      const doc = readJson<{ body: string; lat: number; lon: number; rows: { utc: string; az: number; el: number }[] }>('data', 'fixtures', 'horizons', f);
      for (const row of doc.rows) {
        const v = interpVectors(eph, utcToEt(row.utc));
        const { az, el } = azElFromBodyVector(doc.body === 'SUN' ? v.sun : v.earth, doc.lat, doc.lon, 0);
        const dAz = ((az - row.az + 540) % 360) - 180;
        worstAz = Math.max(worstAz, Math.abs(dAz * Math.cos((row.el * Math.PI) / 180)));
        worstEl = Math.max(worstEl, Math.abs(el - row.el));
        rows++;
      }
    }
    expect(rows).toBe(300);
    expect(worstEl).toBeLessThan(0.002);
    expect(worstAz).toBeLessThan(0.002);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- ephemeris`
Expected: FAIL `Cannot find module './ephemeris'`

- [ ] **Step 3: Implement**

`web/src/lib/engine/ephemeris.ts`:

```ts
import type { Vec3 } from './geometry';

export interface EphemerisHeader {
  t0_et: number;
  step_s: number;
  n: number;
  shape: number[];
  bodies: string[];
  frame: string;
}

/** Hourly Sun/Earth positions (km, MOON_ME) as a flat Float32Array laid out [step][body][xyz]. */
export interface Ephemeris {
  t0Et: number;
  stepS: number;
  n: number;
  data: Float32Array;
}

const FLOATS_PER_STEP = 6;

export function loadEphemeris(bytes: ArrayBuffer | Uint8Array, header: EphemerisHeader): Ephemeris {
  const buf = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const expected = header.n * FLOATS_PER_STEP * 4;
  if (buf.byteLength !== expected) {
    throw new Error(`ephemeris byte length ${buf.byteLength} != expected ${expected} (n=${header.n})`);
  }
  // The file is little-endian; every platform we target is too. Guard anyway.
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('big-endian platforms are not supported');
  return { t0Et: header.t0_et, stepS: header.step_s, n: header.n, data: new Float32Array(buf) };
}

export function rowVectors(eph: Ephemeris, i: number): { sun: Vec3; earth: Vec3 } {
  if (!Number.isInteger(i) || i < 0 || i >= eph.n) throw new RangeError(`row ${i} outside 0..${eph.n - 1}`);
  const d = eph.data, o = i * FLOATS_PER_STEP;
  return { sun: [d[o], d[o + 1], d[o + 2]], earth: [d[o + 3], d[o + 4], d[o + 5]] };
}

export function indexForEt(eph: Ephemeris, et: number): number {
  return Math.round((et - eph.t0Et) / eph.stepS);
}

export function etForIndex(eph: Ephemeris, i: number): number {
  return eph.t0Et + i * eph.stepS;
}

/** Catmull-Rom interpolation of both body vectors at TDB epoch `et` (same range rule as Python). */
export function interpVectors(eph: Ephemeris, et: number): { sun: Vec3; earth: Vec3 } {
  const x = (et - eph.t0Et) / eph.stepS;
  const n = eph.n;
  if (!(x >= 1 && x <= n - 3)) {
    throw new RangeError(`epoch outside interpolation range (x=${x.toFixed(3)}, valid 1..${n - 3})`);
  }
  let i = Math.floor(x);
  if (i > n - 3) i = n - 3;
  const t = x - i, t2 = t * t, t3 = t2 * t;
  const d = eph.data;
  const out = new Array<number>(FLOATS_PER_STEP);
  for (let k = 0; k < FLOATS_PER_STEP; k++) {
    const p0 = d[(i - 1) * FLOATS_PER_STEP + k], p1 = d[i * FLOATS_PER_STEP + k];
    const p2 = d[(i + 1) * FLOATS_PER_STEP + k], p3 = d[(i + 2) * FLOATS_PER_STEP + k];
    out[k] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  return { sun: [out[0], out[1], out[2]], earth: [out[3], out[4], out[5]] };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix web test -- ephemeris`
Expected: `5 passed`; the Horizons test prints nothing but passes with worst deltas around 3e-5°.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/engine/ephemeris.ts web/src/lib/engine/ephemeris.test.ts
git commit -m "feat(engine): ephemeris table loader and Catmull-Rom interpolation with Horizons parity"
```

---

### Task 6: Tile decoding and level sampler

**Files:**
- Create: `web/src/lib/engine/tiles.ts`
- Create: `web/src/lib/engine/tiles.node.ts`
- Create: `web/src/lib/engine/tiles.test.ts`

**Interfaces:**
- Produces: `interface TileLevel { id: string; map_scale_m: number; lines: number; samples: number; line_offset_px: number; sample_offset_px: number; max_latitude_deg: number; dn_scale_m: number; tile_size: number; tiles_x: number; tiles_y: number; nodata: number; path: string }`; `interface TileManifest { version: number; reference_radius_m: number; levels: TileLevel[] }`; `interface TileSource { getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null> }`; `decodeTile(bytes: Uint8Array, tileSize: number): Promise<Int16Array>`; `class LevelSampler` with `level`, `pixelFromLatLon(lat, lon)`, `latLonFromPixel(col, row)`, `tilesForPixels(cols, rows): Set<string>`, `ensureTiles(keys)`, `ensureForPixels(cols, rows)`, `dn(row, col)`, `valueBilinear(cols, rows): Float64Array`, `valueAt(lat, lon): Promise<number>`; `class MemoryTileSource` (in-memory Int16Array grid → tiles, for tests); `levelById(manifest, id)`.
- `tiles.node.ts`: `class FsTileSource implements TileSource` (reads `<dir>/<level.path with {y},{x}>`), `readManifest(dir): TileManifest`.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/engine/tiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { decodeTile, LevelSampler, levelById, MemoryTileSource, type TileLevel, type TileManifest } from './tiles';
import { FsTileSource, readManifest } from './tiles.node';
import { hasFile, readJson, repoPath } from './__tests__/helpers';

function syntheticLevel(size: number, scale: number): TileLevel {
  return {
    id: 'T', map_scale_m: scale, lines: size, samples: size, line_offset_px: (size - 1) / 2,
    sample_offset_px: (size - 1) / 2, max_latitude_deg: -89, dn_scale_m: 0.5, tile_size: 512,
    tiles_x: Math.ceil(size / 512), tiles_y: Math.ceil(size / 512), nodata: -32768, path: 'T/{y}_{x}.bin',
  };
}

describe('decodeTile', () => {
  it('round-trips a zlib-compressed int16 tile', async () => {
    const src = new Int16Array(512 * 512);
    for (let i = 0; i < src.length; i++) src[i] = (i % 5000) - 2500;
    const bytes = new Uint8Array(zlib.deflateSync(Buffer.from(src.buffer)));
    const out = await decodeTile(bytes, 512);
    expect(out.length).toBe(512 * 512);
    expect(out[0]).toBe(-2500);
    expect(out[4999]).toBe(2499);
    expect(out[512 * 512 - 1]).toBe(src[512 * 512 - 1]);
  });
});

describe('LevelSampler on a synthetic grid', () => {
  it('interpolates bilinearly, NaN outside, NaN for nodata', async () => {
    const level = syntheticLevel(4, 20);
    const grid = new Int16Array([0, 2, 4, 6, 10, 12, 14, 16, 20, 22, 24, 26, 30, 32, 34, 36]);
    const s = new LevelSampler(level, new MemoryTileSource(level, grid));
    const cols = new Float64Array([0.5, 1.0, -1.0, 3.5]);
    const rows = new Float64Array([0.5, 2.0, 0.0, 0.0]);
    await s.ensureForPixels(cols, rows);
    const v = s.valueBilinear(cols, rows);
    expect(v[0]).toBeCloseTo(0.5 * (0 + 2 + 10 + 12) / 4, 12);
    expect(v[1]).toBeCloseTo(0.5 * 22, 12);
    expect(Number.isNaN(v[2]) && Number.isNaN(v[3])).toBe(true);
    grid[5] = -32768;
    const s2 = new LevelSampler(level, new MemoryTileSource(level, grid));
    await s2.ensureForPixels(cols, rows);
    expect(Number.isNaN(s2.valueBilinear(cols, rows)[0])).toBe(true);
  });
  it('maps lat/lon to pixels like the Python reader', () => {
    const level = syntheticLevel(1024, 20);
    const s = new LevelSampler(level, new MemoryTileSource(level, new Int16Array(1024 * 1024)));
    const p = s.pixelFromLatLon(-90, 0);
    expect(p.col).toBeCloseTo(511.5, 9);
    expect(p.row).toBeCloseTo(511.5, 9);
    const back = s.latLonFromPixel(600, 400);
    const again = s.pixelFromLatLon(back.lat, back.lon);
    expect(again.col).toBeCloseTo(600, 6);
    expect(again.row).toBeCloseTo(400, 6);
  });
  it('samples a missing tile as NaN instead of throwing', async () => {
    const level = syntheticLevel(1100, 20);
    const src = new MemoryTileSource(level, new Int16Array(1100 * 1100).fill(100), new Set(['1_1']));
    const s = new LevelSampler(level, src);
    const cols = new Float64Array([100, 700]);
    const rows = new Float64Array([100, 700]);
    await s.ensureForPixels(cols, rows);
    const v = s.valueBilinear(cols, rows);
    expect(v[0]).toBe(50);
    expect(Number.isNaN(v[1])).toBe(true);
  });
});

const tilesPresent = hasFile('data_out', 'tiles', 'manifest.json');

describe.skipIf(!tilesPresent)('LevelSampler on real LOLA tiles', () => {
  it('reads the south pole height that Python recorded', async () => {
    const manifest: TileManifest = readManifest(repoPath('data_out', 'tiles'));
    const l0 = levelById(manifest, 'L0');
    const s = new LevelSampler(l0, new FsTileSource(repoPath('data_out', 'tiles')));
    const h = await s.valueAt(-90, 0);
    const mask = readJson<{ site_height_m: number }>('data', 'masks', 'south_pole.json');
    expect(h).toBeCloseTo(mask.site_height_m, 1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- tiles`
Expected: FAIL `Cannot find module './tiles'`

- [ ] **Step 3: Implement**

`web/src/lib/engine/tiles.ts`:

```ts
import { psSouthLatLon, psSouthXY } from './geometry';

export interface TileLevel {
  id: string;
  map_scale_m: number;
  lines: number;
  samples: number;
  line_offset_px: number;
  sample_offset_px: number;
  max_latitude_deg: number;
  dn_scale_m: number;
  tile_size: number;
  tiles_x: number;
  tiles_y: number;
  nodata: number;
  path: string;
  source?: string;
}

export interface TileManifest {
  version: number;
  reference_radius_m: number;
  levels: TileLevel[];
}

export interface TileSource {
  /** Raw zlib bytes of one tile, or null when the tile does not exist / cannot be fetched. */
  getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null>;
}

export function levelById(manifest: TileManifest, id: string): TileLevel {
  const level = manifest.levels.find((l) => l.id === id);
  if (!level) throw new Error(`tile level ${id} not in manifest`);
  return level;
}

export function tilePath(level: TileLevel, ty: number, tx: number): string {
  return level.path.replace('{y}', String(ty)).replace('{x}', String(tx));
}

/** zlib (RFC 1950) -> little-endian int16 tile. Uses the platform DecompressionStream. */
export async function decodeTile(bytes: Uint8Array, tileSize: number): Promise<Int16Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const expected = tileSize * tileSize * 2;
  if (raw.byteLength !== expected) throw new Error(`tile decoded to ${raw.byteLength} bytes, expected ${expected}`);
  return new Int16Array(raw.buffer, raw.byteOffset, tileSize * tileSize);
}

/** In-memory grid exposed as tiles (tests). `missing` keys are reported as absent tiles. */
export class MemoryTileSource implements TileSource {
  constructor(private level: TileLevel, private grid: Int16Array, private missing: Set<string> = new Set()) {}
  async getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null> {
    if (this.missing.has(`${ty}_${tx}`)) return null;
    const T = level.tile_size;
    const block = new Int16Array(T * T).fill(level.nodata);
    for (let r = 0; r < T; r++) {
      const gr = ty * T + r;
      if (gr >= this.level.lines) break;
      for (let c = 0; c < T; c++) {
        const gc = tx * T + c;
        if (gc >= this.level.samples) break;
        block[r * T + c] = this.grid[gr * this.level.samples + gc];
      }
    }
    // Encode with a stored (uncompressed) zlib stream so tests need no compressor.
    return zlibStored(new Uint8Array(block.buffer));
  }
}

/** Wrap raw bytes in a valid zlib stream using stored deflate blocks (no compression). */
export function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  const MAX = 65_535;
  for (let off = 0; off < raw.length || (off === 0 && raw.length === 0); off += MAX) {
    const len = Math.min(MAX, raw.length - off);
    const last = off + len >= raw.length ? 1 : 0;
    const head = new Uint8Array(5);
    head[0] = last;
    head[1] = len & 0xff; head[2] = len >> 8; head[3] = ~len & 0xff; head[4] = (~len >> 8) & 0xff;
    blocks.push(head, raw.subarray(off, off + len));
    if (raw.length === 0) break;
  }
  let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  const adler = new Uint8Array([(b >> 8) & 0xff, b & 0xff, (a >> 8) & 0xff, a & 0xff]);
  const total = 2 + blocks.reduce((n, x) => n + x.length, 0) + 4;
  const out = new Uint8Array(total);
  out[0] = 0x78; out[1] = 0x01;
  let p = 2;
  for (const x of blocks) { out.set(x, p); p += x.length; }
  out.set(adler, p);
  return out;
}

/** Bilinear sampler over one tile level. Load tiles with ensure*() before sampling. */
export class LevelSampler {
  private tiles = new Map<string, Int16Array | null>();
  private pending = new Map<string, Promise<void>>();

  constructor(readonly level: TileLevel, private source: TileSource) {}

  pixelFromLatLon(latDeg: number, lonDeg: number): { col: number; row: number } {
    const { x, y } = psSouthXY(latDeg, lonDeg);
    return {
      col: this.level.sample_offset_px + x / this.level.map_scale_m,
      row: this.level.line_offset_px - y / this.level.map_scale_m,
    };
  }

  latLonFromPixel(col: number, row: number): { lat: number; lon: number } {
    const x = (col - this.level.sample_offset_px) * this.level.map_scale_m;
    const y = (this.level.line_offset_px - row) * this.level.map_scale_m;
    return psSouthLatLon(x, y);
  }

  /** Tile keys needed to bilinearly sample the given fractional pixels (only in-grid ones). */
  tilesForPixels(cols: ArrayLike<number>, rows: ArrayLike<number>): Set<string> {
    const T = this.level.tile_size, keys = new Set<string>();
    for (let i = 0; i < cols.length; i++) {
      const c0 = Math.floor(cols[i]), r0 = Math.floor(rows[i]);
      if (!(c0 >= 0 && r0 >= 0 && c0 < this.level.samples - 1 && r0 < this.level.lines - 1)) continue;
      const tx0 = Math.floor(c0 / T), tx1 = Math.floor((c0 + 1) / T);
      const ty0 = Math.floor(r0 / T), ty1 = Math.floor((r0 + 1) / T);
      keys.add(`${ty0}_${tx0}`);
      if (tx1 !== tx0) keys.add(`${ty0}_${tx1}`);
      if (ty1 !== ty0) { keys.add(`${ty1}_${tx0}`); if (tx1 !== tx0) keys.add(`${ty1}_${tx1}`); }
    }
    return keys;
  }

  async ensureTiles(keys: Iterable<string>): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const key of keys) {
      if (this.tiles.has(key)) continue;
      let job = this.pending.get(key);
      if (!job) {
        const [ty, tx] = key.split('_').map(Number);
        job = this.source
          .getTileBytes(this.level, ty, tx)
          .then(async (bytes) => { this.tiles.set(key, bytes ? await decodeTile(bytes, this.level.tile_size) : null); })
          .catch(() => { this.tiles.set(key, null); })
          .finally(() => { this.pending.delete(key); });
        this.pending.set(key, job);
      }
      jobs.push(job);
    }
    await Promise.all(jobs);
  }

  async ensureForPixels(cols: ArrayLike<number>, rows: ArrayLike<number>): Promise<void> {
    await this.ensureTiles(this.tilesForPixels(cols, rows));
  }

  /** Raw DN at an integer pixel; NaN outside the grid, in a missing tile, or at nodata. */
  dn(row: number, col: number): number {
    if (row < 0 || col < 0 || row >= this.level.lines || col >= this.level.samples) return NaN;
    const T = this.level.tile_size;
    const ty = Math.floor(row / T), tx = Math.floor(col / T);
    const tile = this.tiles.get(`${ty}_${tx}`);
    if (tile === undefined) throw new Error(`tile ${ty}_${tx} of ${this.level.id} not loaded; call ensureTiles first`);
    if (tile === null) return NaN;
    const v = tile[(row - ty * T) * T + (col - tx * T)];
    return v === this.level.nodata ? NaN : v;
  }

  /** DN * dn_scale_m (metres) at fractional pixels; NaN where any of the 4 neighbours is unavailable. */
  valueBilinear(cols: ArrayLike<number>, rows: ArrayLike<number>): Float64Array {
    const out = new Float64Array(cols.length).fill(NaN);
    const scale = this.level.dn_scale_m;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i], row = rows[i];
      const c0 = Math.floor(col), r0 = Math.floor(row);
      if (!(c0 >= 0 && r0 >= 0 && c0 < this.level.samples - 1 && r0 < this.level.lines - 1)) continue;
      const fc = col - c0, fr = row - r0;
      const a = this.dn(r0, c0), b = this.dn(r0, c0 + 1), c = this.dn(r0 + 1, c0), d = this.dn(r0 + 1, c0 + 1);
      const top = a * (1 - fc) + b * fc, bottom = c * (1 - fc) + d * fc;
      out[i] = (top * (1 - fr) + bottom * fr) * scale;
    }
    return out;
  }

  async valueAt(latDeg: number, lonDeg: number): Promise<number> {
    const { col, row } = this.pixelFromLatLon(latDeg, lonDeg);
    const cols = new Float64Array([col]), rows = new Float64Array([row]);
    await this.ensureForPixels(cols, rows);
    return this.valueBilinear(cols, rows)[0];
  }
}
```

`web/src/lib/engine/tiles.node.ts`:

```ts
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { tilePath, type TileLevel, type TileManifest, type TileSource } from './tiles';

export function readManifest(dir: string): TileManifest {
  return JSON.parse(fsSync.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as TileManifest;
}

/** Reads tiles from a local `data_out/tiles`-style directory (tests and scripts). */
export class FsTileSource implements TileSource {
  constructor(private dir: string) {}
  async getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await fs.readFile(path.join(this.dir, tilePath(level, ty, tx))));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix web test -- tiles`
Expected: `5 passed` (the real-tile test runs because `data_out/tiles` exists on the dev machine; it skips elsewhere).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/engine/tiles.ts web/src/lib/engine/tiles.node.ts web/src/lib/engine/tiles.test.ts
git commit -m "feat(engine): zlib tile decoding and bilinear level sampler with tile sources"
```

---

### Task 7: Horizon mask with nested bands and fallback (mask parity)

**Files:**
- Create: `web/src/lib/engine/horizon.ts`
- Create: `web/src/lib/engine/horizon.test.ts`

**Interfaces:**
- Produces: `interface Band { sampler: LevelSampler; rMinM: number; rMaxM: number; stepM: number }`; `type Samplers = { L0: LevelSampler; L1: LevelSampler; L2: LevelSampler }`; `bandsForSite(lat, samplers): Band[]` (throws for lat > −60); `siteHeightM(lat, lon, samplers: LevelSampler[]): Promise<number>`; `firstMissingDistanceM(lat, lon, band, nAz, probeStepM): Promise<number | null>`; `fallbackBands(lat, lon, bands, samplers, nAz = 720): Promise<Band[]>`; `horizonMask(lat, lon, bands, { nAz = 720, mastM = 2, siteHeightM? }): Promise<Float64Array>`; `computeSiteMask(lat, lon, samplers, opts): Promise<{ mask: Float64Array; siteHeightM: number; bands: BandInfo[]; fallbackBands: BandInfo[] }>`; `NATIVE_STEP_M = { L0: 10, L1: 40, L2: 120 }`.
- Consumes: `LevelSampler` (Task 6), `enuBasis`, `siteVectorKm` (Task 4).

- [ ] **Step 1: Write the failing tests**

`web/src/lib/engine/horizon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { R_MOON_M } from './constants';
import { bandsForSite, computeSiteMask, horizonMask, type Band, type Samplers } from './horizon';
import { LevelSampler, levelById, MemoryTileSource, type TileLevel } from './tiles';
import { FsTileSource, readManifest } from './tiles.node';
import { hasFile, readJson, repoPath } from './__tests__/helpers';

function syntheticLevel(size: number, scale: number): TileLevel {
  return {
    id: 'T', map_scale_m: scale, lines: size, samples: size, line_offset_px: (size - 1) / 2,
    sample_offset_px: (size - 1) / 2, max_latitude_deg: -89, dn_scale_m: 0.5, tile_size: 512,
    tiles_x: Math.ceil(size / 512), tiles_y: Math.ceil(size / 512), nodata: -32768, path: 'T/{y}_{x}.bin',
  };
}
const SITE = { lat: -89.9, lon: 45.0 };

function paintRing(grid: Int16Array, level: TileLevel, sampler: LevelSampler, rIn: number, rOut: number, dn: number) {
  const { col, row } = sampler.pixelFromLatLon(SITE.lat, SITE.lon);
  for (let r = 0; r < level.lines; r++)
    for (let c = 0; c < level.samples; c++) {
      const d = Math.hypot(c - col, r - row) * level.map_scale_m;
      if (d >= rIn && d <= rOut) grid[r * level.samples + c] = dn;
    }
}

describe('horizonMask on synthetic terrain', () => {
  it('flat sphere from a 2 m mast gives the analytic slightly negative skyline', async () => {
    const level = syntheticLevel(1024, 20);
    const s = new LevelSampler(level, new MemoryTileSource(level, new Int16Array(1024 * 1024)));
    const mask = await horizonMask(SITE.lat, SITE.lon, [{ sampler: s, rMinM: 40, rMaxM: 8000, stepM: 10 }], { mastM: 2 });
    let expected = -90;
    for (let d = 40; d < 8000; d += 10) {
      const el = (Math.atan2(R_MOON_M * Math.cos(d / R_MOON_M) - (R_MOON_M + 2), R_MOON_M * Math.sin(d / R_MOON_M)) * 180) / Math.PI;
      expected = Math.max(expected, el);
    }
    expect(expected).toBeGreaterThan(-0.12);
    expect(expected).toBeLessThan(-0.05);
    expect(mask.length).toBe(720);
    for (const v of mask) expect(Math.abs(v - expected)).toBeLessThan(0.01);
  });
  it('a 1000 m ring wall 5 km away gives 11.2 deg all around', async () => {
    const level = syntheticLevel(1024, 20);
    const grid = new Int16Array(1024 * 1024);
    const s = new LevelSampler(level, new MemoryTileSource(level, grid));
    paintRing(grid, level, s, 5000, 5100, 2000);
    const mask = await horizonMask(SITE.lat, SITE.lon, [{ sampler: s, rMinM: 40, rMaxM: 8000, stepM: 10 }], { mastM: 2 });
    const delta = 5000 / R_MOON_M;
    const expected = (Math.atan2((R_MOON_M + 1000) * Math.cos(delta) - (R_MOON_M + 2), (R_MOON_M + 1000) * Math.sin(delta)) * 180) / Math.PI;
    expect(expected).toBeCloseTo(11.2, 1);
    for (const v of mask) expect(Math.abs(v - expected)).toBeLessThan(0.15);
  });
  it('bandsForSite rejects sites north of 60S', () => {
    const level = syntheticLevel(8, 20);
    const s = new LevelSampler(level, new MemoryTileSource(level, new Int16Array(64)));
    const samplers: Samplers = { L0: s, L1: s, L2: s };
    expect(() => bandsForSite(-59.9, samplers)).toThrow(/no DEM coverage/);
    expect(bandsForSite(-89, samplers).map((b) => b.stepM)).toEqual([10, 40, 120]);
    expect(bandsForSite(-84, samplers).map((b) => b.stepM)).toEqual([20, 120]);
  });
});

const tilesPresent = hasFile('data_out', 'tiles', 'manifest.json');

describe.skipIf(!tilesPresent)('mask parity with the Python pipeline', () => {
  it('reproduces every committed mask to 0.01 deg, including the IM-1 fallback band', async () => {
    const dir = repoPath('data_out', 'tiles');
    const manifest = readManifest(dir);
    const src = new FsTileSource(dir);
    const samplers: Samplers = {
      L0: new LevelSampler(levelById(manifest, 'L0'), src),
      L1: new LevelSampler(levelById(manifest, 'L1'), src),
      L2: new LevelSampler(levelById(manifest, 'L2'), src),
    };
    const files = fs.readdirSync(repoPath('data', 'masks')).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(7);
    for (const f of files) {
      const py = readJson<{ site_id: string; lat: number; lon: number; site_height_m: number; elevation_deg: number[]; fallback_bands: { r_min_m: number }[] }>('data', 'masks', f);
      const ts = await computeSiteMask(py.lat, py.lon, samplers, { mastM: 2 });
      expect(ts.siteHeightM).toBeCloseTo(py.site_height_m, 1);
      let worst = 0;
      for (let k = 0; k < 720; k++) worst = Math.max(worst, Math.abs(ts.mask[k] - py.elevation_deg[k]));
      expect(worst, `${py.site_id} max |dEl| = ${worst}`).toBeLessThan(0.01);
      expect(ts.fallbackBands.length).toBe(py.fallback_bands.length);
      if (py.fallback_bands.length) expect(ts.fallbackBands[0].rMinM).toBeCloseTo(py.fallback_bands[0].r_min_m, 6);
    }
  }, 600_000);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- horizon`
Expected: FAIL `Cannot find module './horizon'`

- [ ] **Step 3: Implement**

`web/src/lib/engine/horizon.ts`:

```ts
import { R_MOON_M } from './constants';
import { enuBasis, siteVectorKm } from './geometry';
import type { LevelSampler } from './tiles';

export interface Band {
  sampler: LevelSampler;
  rMinM: number;
  rMaxM: number;
  stepM: number;
}

export interface BandInfo {
  grid: string;
  rMinM: number;
  rMaxM: number;
  stepM: number;
}

export type Samplers = { L0: LevelSampler; L1: LevelSampler; L2: LevelSampler };

export const NATIVE_STEP_M: Record<'L0' | 'L1' | 'L2', number> = { L0: 10, L1: 40, L2: 120 };
const LEVEL_ORDER: ('L0' | 'L1' | 'L2')[] = ['L0', 'L1', 'L2'];
const AZ_CHUNK = 60;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** numpy.arange(start, stop, step): length = ceil((stop - start) / step). */
function arange(start: number, stop: number, step: number): Float64Array {
  const n = Math.max(0, Math.ceil((stop - start) / step));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = start + i * step;
  return out;
}

export function bandsForSite(latDeg: number, samplers: Samplers): Band[] {
  if (latDeg > -60) throw new Error(`no DEM coverage north of 60S (lat ${latDeg})`);
  if (latDeg <= -87.55) {
    return [
      { sampler: samplers.L0, rMinM: 40, rMaxM: 6_000, stepM: 10 },
      { sampler: samplers.L1, rMinM: 6_000, rMaxM: 100_000, stepM: 40 },
      { sampler: samplers.L2, rMinM: 100_000, rMaxM: 220_000, stepM: 120 },
    ];
  }
  return [
    { sampler: samplers.L1, rMinM: 40, rMaxM: 100_000, stepM: 20 },
    { sampler: samplers.L2, rMinM: 100_000, rMaxM: 220_000, stepM: 120 },
  ];
}

export async function siteHeightM(latDeg: number, lonDeg: number, samplers: LevelSampler[]): Promise<number> {
  for (const s of samplers) {
    const h = await s.valueAt(latDeg, lonDeg);
    if (!Number.isNaN(h)) return h;
  }
  throw new Error(`no grid covers site (${latDeg}, ${lonDeg})`);
}

/** Great-circle sample points for azimuths [az0, az1) at distances d (m): lat/lon arrays of length nAzChunk*k. */
function ringPoints(latDeg: number, lonDeg: number, azDeg: Float64Array, d: Float64Array): { lat: Float64Array; lon: Float64Array } {
  const p = siteVectorKm(latDeg, lonDeg);
  const pn = Math.hypot(p[0], p[1], p[2]);
  const px = p[0] / pn, py = p[1] / pn, pz = p[2] / pn;
  const { east, north } = enuBasis(latDeg, lonDeg);
  const k = d.length, n = azDeg.length;
  const lat = new Float64Array(n * k), lon = new Float64Array(n * k);
  const cosD = new Float64Array(k), sinD = new Float64Array(k);
  for (let j = 0; j < k; j++) { const delta = d[j] / R_MOON_M; cosD[j] = Math.cos(delta); sinD[j] = Math.sin(delta); }
  for (let a = 0; a < n; a++) {
    const az = azDeg[a] * DEG, ca = Math.cos(az), sa = Math.sin(az);
    const tx = ca * north[0] + sa * east[0], ty = ca * north[1] + sa * east[1], tz = ca * north[2] + sa * east[2];
    for (let j = 0; j < k; j++) {
      const qx = cosD[j] * px + sinD[j] * tx, qy = cosD[j] * py + sinD[j] * ty, qz = cosD[j] * pz + sinD[j] * tz;
      const i = a * k + j;
      lat[i] = Math.asin(Math.max(-1, Math.min(1, qz))) * RAD;
      lon[i] = Math.atan2(qy, qx) * RAD;
    }
  }
  return { lat, lon };
}

function pixelsFor(sampler: LevelSampler, lat: Float64Array, lon: Float64Array): { cols: Float64Array; rows: Float64Array } {
  const cols = new Float64Array(lat.length), rows = new Float64Array(lat.length);
  for (let i = 0; i < lat.length; i++) {
    const p = sampler.pixelFromLatLon(lat[i], lon[i]);
    cols[i] = p.col; rows[i] = p.row;
  }
  return { cols, rows };
}

function azimuths(nAz: number): Float64Array {
  const az = new Float64Array(nAz);
  for (let i = 0; i < nAz; i++) az[i] = (i * 360) / nAz;
  return az;
}

/**
 * Terrain skyline elevation (deg) for nAz azimuths (0 = north, clockwise): max over all bands and
 * distances of atan2(r_t cos δ − r_o, r_t sin δ). Samples with no DEM data count as −90.
 */
export async function horizonMask(
  latDeg: number,
  lonDeg: number,
  bands: Band[],
  opts: { nAz?: number; mastM?: number; siteHeightM?: number } = {},
): Promise<Float64Array> {
  const nAz = opts.nAz ?? 720;
  const mastM = opts.mastM ?? 2;
  const h = opts.siteHeightM ?? (await siteHeightM(latDeg, lonDeg, bands.map((b) => b.sampler)));
  const rO = R_MOON_M + h + mastM;
  const mask = new Float64Array(nAz).fill(-90);
  const az = azimuths(nAz);
  for (const band of bands) {
    const d = arange(band.rMinM, band.rMaxM, band.stepM);
    const k = d.length;
    const cosD = new Float64Array(k), sinD = new Float64Array(k);
    for (let j = 0; j < k; j++) { const delta = d[j] / R_MOON_M; cosD[j] = Math.cos(delta); sinD[j] = Math.sin(delta); }
    for (let a0 = 0; a0 < nAz; a0 += AZ_CHUNK) {
      const azChunk = az.subarray(a0, Math.min(nAz, a0 + AZ_CHUNK));
      const { lat, lon } = ringPoints(latDeg, lonDeg, azChunk, d);
      const { cols, rows } = pixelsFor(band.sampler, lat, lon);
      await band.sampler.ensureForPixels(cols, rows);
      const hs = band.sampler.valueBilinear(cols, rows);
      for (let a = 0; a < azChunk.length; a++) {
        let best = mask[a0 + a];
        for (let j = 0; j < k; j++) {
          const ht = hs[a * k + j];
          if (Number.isNaN(ht)) continue;
          const rT = R_MOON_M + ht;
          const el = Math.atan2(rT * cosD[j] - rO, rT * sinD[j]) * RAD;
          if (el > best) best = el;
        }
        mask[a0 + a] = best;
      }
    }
  }
  return mask;
}

/** Distance just before the first ring sample of `band` that lies outside its grid (null when fully covered). */
export async function firstMissingDistanceM(latDeg: number, lonDeg: number, band: Band, nAz: number, probeStepM: number): Promise<number | null> {
  const d = arange(band.rMinM, band.rMaxM, probeStepM);
  const k = d.length;
  const missing = new Uint8Array(k);
  const az = azimuths(nAz);
  for (let a0 = 0; a0 < nAz; a0 += AZ_CHUNK) {
    const azChunk = az.subarray(a0, Math.min(nAz, a0 + AZ_CHUNK));
    const { lat, lon } = ringPoints(latDeg, lonDeg, azChunk, d);
    const { cols, rows } = pixelsFor(band.sampler, lat, lon);
    await band.sampler.ensureForPixels(cols, rows);
    const hs = band.sampler.valueBilinear(cols, rows);
    for (let a = 0; a < azChunk.length; a++)
      for (let j = 0; j < k; j++) if (Number.isNaN(hs[a * k + j])) missing[j] = 1;
  }
  const first = missing.indexOf(1);
  if (first < 0) return null;
  return d[Math.max(first - 1, 0)];
}

function levelKey(sampler: LevelSampler, samplers: Samplers): 'L0' | 'L1' | 'L2' {
  for (const key of LEVEL_ORDER) if (samplers[key] === sampler) return key;
  throw new Error('band sampler is not one of the L0/L1/L2 samplers');
}

/** Coarser-grid bands covering the distances where a primary band runs off its own grid (mirrors Python). */
export async function fallbackBands(latDeg: number, lonDeg: number, bands: Band[], samplers: Samplers, nAz = 720): Promise<Band[]> {
  const out: Band[] = [];
  for (const band of bands) {
    let probe = band;
    const start = LEVEL_ORDER.indexOf(levelKey(band.sampler, samplers)) + 1;
    for (const coarser of LEVEL_ORDER.slice(start)) {
      const step = Math.max(band.stepM, NATIVE_STEP_M[coarser]);
      const d0 = await firstMissingDistanceM(latDeg, lonDeg, probe, nAz, step);
      if (d0 === null) break;
      probe = { sampler: samplers[coarser], rMinM: d0, rMaxM: band.rMaxM, stepM: step };
      out.push(probe);
    }
  }
  return out;
}

function info(b: Band, samplers: Samplers): BandInfo {
  return { grid: levelKey(b.sampler, samplers), rMinM: b.rMinM, rMaxM: b.rMaxM, stepM: b.stepM };
}

/** Full per-site computation: primary bands, fallback bands, site height, mask. */
export async function computeSiteMask(
  latDeg: number,
  lonDeg: number,
  samplers: Samplers,
  opts: { nAz?: number; mastM?: number } = {},
): Promise<{ mask: Float64Array; siteHeightM: number; bands: BandInfo[]; fallbackBands: BandInfo[] }> {
  const nAz = opts.nAz ?? 720;
  const bands = bandsForSite(latDeg, samplers);
  const fallback = await fallbackBands(latDeg, lonDeg, bands, samplers, nAz);
  const h = await siteHeightM(latDeg, lonDeg, bands.map((b) => b.sampler));
  const mask = await horizonMask(latDeg, lonDeg, [...bands, ...fallback], { nAz, mastM: opts.mastM ?? 2, siteHeightM: h });
  return { mask, siteHeightM: h, bands: bands.map((b) => info(b, samplers)), fallbackBands: fallback.map((b) => info(b, samplers)) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix web test -- horizon`
Expected: `4 passed`; the parity test takes 1–3 minutes (7 sites, tiles read from disk). Record the printed worst deltas if any assertion message appears.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/engine/horizon.ts web/src/lib/engine/horizon.test.ts
git commit -m "feat(engine): nested-grid horizon mask with fallback bands, parity with Python masks"
```

---

### Task 8: Illumination metrics, prefix-sum index, best window (metrics parity)

**Files:**
- Create: `web/src/lib/engine/metrics.ts`
- Create: `web/src/lib/engine/metrics.test.ts`

**Interfaces:**
- Produces: `diskFraction(deltaDeg, diskRadiusDeg)`; `sunRadiusDeg(distKm)`; `maskAtAzimuth(mask: ArrayLike<number>, azDeg)`; `interface Series { i0: number; hours: number; sunAz: Float64Array; sunEl; earthAz; earthEl; sunFraction: Float64Array; earthVisible: Uint8Array }`; `hourlySeries(site: { lat: number; lon: number }, mask, eph, startEt, hours): Series`; `longestRun(flags: ArrayLike<number | boolean>, from = 0, to = flags.length)`; `interface Summary { hours; illumFraction; meanSunFraction; longestDarkH; earthVisFraction; longestEarthGapH; jointFraction }`; `summarize(series, from = 0, to = series.hours): Summary`; `class SeriesIndex { constructor(series); window(from, to): Summary }` (O(1) fractions via prefix sums, O(w) runs); `bestWindow(index, windowHours, stepHours = 6, weights = { sun: 1, earth: 1, gap: 1 }): { start: number; score: number; summary: Summary }`.
- Consumes: `azElFromBodyVector` (Task 4), `Ephemeris`, `indexForEt`, `rowVectors` (Task 5), constants (Task 3).

- [ ] **Step 1: Write the failing tests**

`web/src/lib/engine/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AU_KM } from './constants';
import { loadEphemeris, type EphemerisHeader } from './ephemeris';
import { bestWindow, diskFraction, hourlySeries, longestRun, maskAtAzimuth, SeriesIndex, summarize, sunRadiusDeg, type Series } from './metrics';
import { utcToEt } from './time';
import { readBytes, readJson } from './__tests__/helpers';

describe('metrics primitives', () => {
  it('disk fraction endpoints and middle', () => {
    expect(diskFraction(-1, 0.2665)).toBeCloseTo(0, 12);
    expect(diskFraction(1, 0.2665)).toBeCloseTo(1, 12);
    expect(diskFraction(0, 0.2665)).toBeCloseTo(0.5, 12);
    expect(diskFraction(0.13325, 0.2665)).toBeCloseTo(0.8045, 3);
  });
  it('sun radius at 1 AU', () => {
    expect(sunRadiusDeg(AU_KM)).toBeCloseTo(0.2665, 3);
  });
  it('maskAtAzimuth wraps', () => {
    const mask = new Float64Array(720);
    mask[0] = 10;
    expect(maskAtAzimuth(mask, 359.75)).toBeCloseTo(5, 12);
    expect(maskAtAzimuth(mask, 0.25)).toBeCloseTo(5, 12);
  });
  it('longestRun with bounds', () => {
    expect(longestRun([0, 1, 1, 0, 1, 1, 1, 0])).toBe(3);
    expect(longestRun([0, 1, 1, 0, 1, 1, 1, 0], 0, 4)).toBe(2);
    expect(longestRun(new Uint8Array(5))).toBe(0);
  });
  it('summarize on a synthetic series', () => {
    const sunFraction = new Float64Array(100);
    sunFraction.fill(1, 0, 60);
    const earthVisible = new Uint8Array(100);
    earthVisible.fill(1, 0, 50);
    const s = { i0: 0, hours: 100, sunAz: new Float64Array(100), sunEl: new Float64Array(100), earthAz: new Float64Array(100), earthEl: new Float64Array(100), sunFraction, earthVisible } satisfies Series;
    const m = summarize(s);
    expect(m.illumFraction).toBeCloseTo(0.6, 12);
    expect(m.longestDarkH).toBe(40);
    expect(m.earthVisFraction).toBeCloseTo(0.5, 12);
    expect(m.longestEarthGapH).toBe(50);
    expect(m.jointFraction).toBeCloseTo(0.5, 12);
    const idx = new SeriesIndex(s);
    expect(idx.window(0, 100)).toEqual(m);
    expect(idx.window(50, 100).illumFraction).toBeCloseTo(0.2, 12);
    expect(idx.window(50, 100).longestDarkH).toBe(40);
    const best = bestWindow(idx, 24, 1);
    expect(best.start).toBeLessThanOrEqual(26);
    expect(best.summary.illumFraction).toBe(1);
  });
});

interface Fixture {
  site_id: string; lat: number; lon: number; start_utc: string; days: number; start_index: number;
  metrics: { hours: number; illum_fraction: number; mean_sun_fraction: number; longest_dark_h: number; earth_vis_fraction: number; longest_earth_gap_h: number; joint_fraction: number };
  sample_indexes: number[]; samples: Record<'sun_az' | 'sun_el' | 'earth_az' | 'earth_el' | 'sun_fraction', number[]>; earth_visible: boolean[];
}

describe('parity with the Python report', () => {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  for (const name of ['shackleton_center_rim_high_2025-01-01_730d.json', 'im1_odysseus_2025-01-01_730d.json']) {
    it(`matches ${name}`, () => {
      const fx = readJson<Fixture>('data', 'fixtures', 'metrics', name);
      const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', `${fx.site_id}.json`).elevation_deg;
      const series = hourlySeries({ lat: fx.lat, lon: fx.lon }, mask, eph, utcToEt(fx.start_utc), fx.days * 24);
      expect(series.i0).toBe(fx.start_index);
      fx.sample_indexes.forEach((i, k) => {
        expect(series.sunAz[i]).toBeCloseTo(fx.samples.sun_az[k], 6);
        expect(series.sunEl[i]).toBeCloseTo(fx.samples.sun_el[k], 6);
        expect(series.earthAz[i]).toBeCloseTo(fx.samples.earth_az[k], 6);
        expect(series.earthEl[i]).toBeCloseTo(fx.samples.earth_el[k], 6);
        expect(series.sunFraction[i]).toBeCloseTo(fx.samples.sun_fraction[k], 9);
        expect(series.earthVisible[i] === 1).toBe(fx.earth_visible[k]);
      });
      const m = summarize(series);
      expect(m.hours).toBe(fx.metrics.hours);
      expect(m.illumFraction).toBeCloseTo(fx.metrics.illum_fraction, 9);
      expect(m.meanSunFraction).toBeCloseTo(fx.metrics.mean_sun_fraction, 9);
      expect(m.longestDarkH).toBe(fx.metrics.longest_dark_h);
      expect(m.earthVisFraction).toBeCloseTo(fx.metrics.earth_vis_fraction, 9);
      expect(m.longestEarthGapH).toBe(fx.metrics.longest_earth_gap_h);
      expect(m.jointFraction).toBeCloseTo(fx.metrics.joint_fraction, 9);
    });
  }
  it('hourlySeries rejects a span past the table', () => {
    const mask = new Float64Array(720);
    expect(() => hourlySeries({ lat: -89, lon: 0 }, mask, eph, utcToEt('2036-12-01T00:00:00'), 24 * 40)).toThrow(/outside the ephemeris table/);
    expect(() => hourlySeries({ lat: -89, lon: 0 }, mask, eph, utcToEt('2023-12-31T00:00:00'), 24)).toThrow(/outside the ephemeris table/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- metrics`
Expected: FAIL `Cannot find module './metrics'`

- [ ] **Step 3: Implement**

`web/src/lib/engine/metrics.ts`:

```ts
import { SUN_RADIUS_KM } from './constants';
import { indexForEt, type Ephemeris } from './ephemeris';
import { azElFromBodyVector } from './geometry';

const RAD = 180 / Math.PI;

/** Fraction of a disk of angular radius `diskRadiusDeg` above a straight skyline; delta = centre − skyline. */
export function diskFraction(deltaDeg: number, diskRadiusDeg: number): number {
  const x = Math.max(-1, Math.min(1, deltaDeg / diskRadiusDeg));
  return (Math.acos(-x) + x * Math.sqrt(1 - x * x)) / Math.PI;
}

export function sunRadiusDeg(distKm: number): number {
  return Math.asin(SUN_RADIUS_KM / distKm) * RAD;
}

/** Periodic linear interpolation of a 360° mask sampled at k·360/n. */
export function maskAtAzimuth(mask: ArrayLike<number>, azDeg: number): number {
  const n = mask.length, step = 360 / n;
  const x = (((azDeg % 360) + 360) % 360) / step;
  const i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, f = x - Math.floor(x);
  return mask[i0] * (1 - f) + mask[i1] * f;
}

export interface Series {
  i0: number;
  hours: number;
  sunAz: Float64Array;
  sunEl: Float64Array;
  earthAz: Float64Array;
  earthEl: Float64Array;
  sunFraction: Float64Array;
  earthVisible: Uint8Array;
}

/** Hourly series on the ephemeris grid, starting at the row nearest `startEt` (site height 0, like Python). */
export function hourlySeries(site: { lat: number; lon: number }, mask: ArrayLike<number>, eph: Ephemeris, startEt: number, hours: number): Series {
  const i0 = indexForEt(eph, startEt);
  if (i0 < 0 || i0 + hours > eph.n) throw new RangeError(`requested span is outside the ephemeris table (rows ${i0}..${i0 + hours}, table 0..${eph.n})`);
  const sunAz = new Float64Array(hours), sunEl = new Float64Array(hours);
  const earthAz = new Float64Array(hours), earthEl = new Float64Array(hours);
  const sunFraction = new Float64Array(hours), earthVisible = new Uint8Array(hours);
  const d = eph.data;
  for (let h = 0; h < hours; h++) {
    const o = (i0 + h) * 6;
    const sun = [d[o], d[o + 1], d[o + 2]], earth = [d[o + 3], d[o + 4], d[o + 5]];
    const s = azElFromBodyVector(sun, site.lat, site.lon, 0);
    const e = azElFromBodyVector(earth, site.lat, site.lon, 0);
    sunAz[h] = s.az; sunEl[h] = s.el; earthAz[h] = e.az; earthEl[h] = e.el;
    const dist = Math.hypot(sun[0], sun[1], sun[2]);
    sunFraction[h] = diskFraction(s.el - maskAtAzimuth(mask, s.az), sunRadiusDeg(dist));
    earthVisible[h] = e.el - maskAtAzimuth(mask, e.az) > 0 ? 1 : 0;
  }
  return { i0, hours, sunAz, sunEl, earthAz, earthEl, sunFraction, earthVisible };
}

export function longestRun(flags: ArrayLike<number | boolean>, from = 0, to = flags.length): number {
  let best = 0, cur = 0;
  for (let i = from; i < to; i++) {
    cur = flags[i] ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

export interface Summary {
  hours: number;
  illumFraction: number;
  meanSunFraction: number;
  longestDarkH: number;
  earthVisFraction: number;
  longestEarthGapH: number;
  jointFraction: number;
}

export function summarize(series: Series, from = 0, to = series.hours): Summary {
  const n = to - from;
  let lit = 0, vis = 0, joint = 0, sum = 0;
  const dark = new Uint8Array(n), gap = new Uint8Array(n);
  for (let i = from; i < to; i++) {
    const l = series.sunFraction[i] > 0, v = series.earthVisible[i] === 1;
    if (l) lit++;
    if (v) vis++;
    if (l && v) joint++;
    sum += series.sunFraction[i];
    dark[i - from] = l ? 0 : 1;
    gap[i - from] = v ? 0 : 1;
  }
  return {
    hours: n,
    illumFraction: lit / n,
    meanSunFraction: sum / n,
    longestDarkH: longestRun(dark),
    earthVisFraction: vis / n,
    longestEarthGapH: longestRun(gap),
    jointFraction: joint / n,
  };
}

/** Prefix sums so any window's fractions cost O(1); longest runs still cost O(window). */
export class SeriesIndex {
  private lit: Float64Array;
  private vis: Float64Array;
  private joint: Float64Array;
  private sum: Float64Array;

  constructor(readonly series: Series) {
    const n = series.hours;
    this.lit = new Float64Array(n + 1); this.vis = new Float64Array(n + 1);
    this.joint = new Float64Array(n + 1); this.sum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const l = series.sunFraction[i] > 0 ? 1 : 0, v = series.earthVisible[i];
      this.lit[i + 1] = this.lit[i] + l;
      this.vis[i + 1] = this.vis[i] + v;
      this.joint[i + 1] = this.joint[i] + (l && v ? 1 : 0);
      this.sum[i + 1] = this.sum[i] + series.sunFraction[i];
    }
  }

  window(from: number, to: number): Summary {
    const n = to - from;
    const s = this.series;
    let longestDark = 0, longestGap = 0, dark = 0, gap = 0;
    for (let i = from; i < to; i++) {
      dark = s.sunFraction[i] > 0 ? 0 : dark + 1;
      gap = s.earthVisible[i] ? 0 : gap + 1;
      if (dark > longestDark) longestDark = dark;
      if (gap > longestGap) longestGap = gap;
    }
    return {
      hours: n,
      illumFraction: (this.lit[to] - this.lit[from]) / n,
      meanSunFraction: (this.sum[to] - this.sum[from]) / n,
      longestDarkH: longestDark,
      earthVisFraction: (this.vis[to] - this.vis[from]) / n,
      longestEarthGapH: longestGap,
      jointFraction: (this.joint[to] - this.joint[from]) / n,
    };
  }
}

export interface WindowWeights { sun: number; earth: number; gap: number }

/** Best-scoring window of `windowHours`, scanning starts every `stepHours`. Score in [−1, 2]. */
export function bestWindow(index: SeriesIndex, windowHours: number, stepHours = 6, weights: WindowWeights = { sun: 1, earth: 1, gap: 1 }): { start: number; score: number; summary: Summary } {
  const n = index.series.hours;
  if (windowHours > n) throw new RangeError(`window ${windowHours} h longer than series ${n} h`);
  let best = { start: 0, score: -Infinity, summary: index.window(0, windowHours) };
  for (let start = 0; start + windowHours <= n; start += stepHours) {
    const s = index.window(start, start + windowHours);
    const score = weights.sun * s.illumFraction + weights.earth * s.earthVisFraction - (weights.gap * (s.longestDarkH + s.longestEarthGapH)) / (2 * windowHours);
    if (score > best.score) best = { start, score, summary: s };
  }
  return best;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix web test -- metrics`
Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/engine/metrics.ts web/src/lib/engine/metrics.test.ts
git commit -m "feat(engine): illumination metrics, prefix-sum window index and best-window search with Python parity"
```

---

### Task 9: Engine demo script, docs, build gate

**Files:**
- Create: `web/scripts/engine-demo.ts`
- Create: `web/src/lib/engine/index.ts`
- Create: `web/README.md`
- Modify: `README.md` (repo root)

**Interfaces:**
- Produces: `npm run engine:demo -- --site <id> [--start 2025-01-01] [--days 730]` printing JSON `{ site_id, lat, lon, start_utc, days, site_height_m, bands, fallback_bands, mask_vs_python_max_abs_deg, metrics }`; `index.ts` re-exports the engine API.

- [ ] **Step 1: Write the demo script**

`web/src/lib/engine/index.ts`:

```ts
export * from './constants';
export * from './time';
export * from './geometry';
export * from './ephemeris';
export * from './tiles';
export * from './horizon';
export * from './metrics';
```

`web/scripts/engine-demo.ts`:

```ts
/* Prints the same numbers as `python -m lunar_pipeline.cli report` for a site, computed by the TS engine. */
import fs from 'node:fs';
import path from 'node:path';
import { computeSiteMask, hourlySeries, loadEphemeris, LevelSampler, levelById, summarize, utcToEt, type EphemerisHeader, type Samplers } from '../src/lib/engine';
import { FsTileSource, readManifest } from '../src/lib/engine/tiles.node';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const siteId = args.get('site') ?? 'shackleton_center_rim_high';
const start = args.get('start') ?? '2025-01-01';
const days = Number(args.get('days') ?? 730);

const root = path.resolve(process.cwd(), '..');
const sites = [
  ...JSON.parse(fs.readFileSync(path.join(root, 'data', 'sites.json'), 'utf8')).sites,
  ...JSON.parse(fs.readFileSync(path.join(root, 'data', 'sites_derived.json'), 'utf8')).sites,
] as { id: string; lat: number; lon: number }[];
const site = sites.find((s) => s.id === siteId);
if (!site) throw new Error(`unknown site ${siteId}; known: ${sites.map((s) => s.id).join(', ')}`);

async function main() {
  const tilesDir = path.join(root, 'data_out', 'tiles');
  const manifest = readManifest(tilesDir);
  const src = new FsTileSource(tilesDir);
  const samplers: Samplers = {
    L0: new LevelSampler(levelById(manifest, 'L0'), src),
    L1: new LevelSampler(levelById(manifest, 'L1'), src),
    L2: new LevelSampler(levelById(manifest, 'L2'), src),
  };
  const t0 = Date.now();
  const { mask, siteHeightM, bands, fallbackBands } = await computeSiteMask(site!.lat, site!.lon, samplers, { mastM: 2 });
  const maskMs = Date.now() - t0;
  const pyPath = path.join(root, 'data', 'masks', `${siteId}.json`);
  let maskVsPython: number | null = null;
  if (fs.existsSync(pyPath)) {
    const py = JSON.parse(fs.readFileSync(pyPath, 'utf8')).elevation_deg as number[];
    maskVsPython = Math.max(...py.map((v, k) => Math.abs(v - mask[k])));
  }
  const header = JSON.parse(fs.readFileSync(path.join(root, 'data', 'ephemeris', 'moon_me_2024_2036_1h.json'), 'utf8')) as EphemerisHeader;
  const eph = loadEphemeris(new Uint8Array(fs.readFileSync(path.join(root, 'data', 'ephemeris', 'moon_me_2024_2036_1h.f32'))), header);
  const startUtc = start.length === 10 ? `${start}T00:00:00` : start;
  const series = hourlySeries(site!, mask, eph, utcToEt(startUtc), days * 24);
  console.log(JSON.stringify({
    site_id: siteId, lat: site!.lat, lon: site!.lon, start_utc: startUtc, days,
    site_height_m: Math.round(siteHeightM * 100) / 100, mask_ms: maskMs, bands, fallback_bands: fallbackBands,
    mask_vs_python_max_abs_deg: maskVsPython, metrics: summarize(series),
  }, null, 1));
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Run: `npm --prefix web run engine:demo -- --site shackleton_center_rim_high`
Expected: JSON with `mask_vs_python_max_abs_deg` below 0.01, `metrics.illumFraction` ≈ 0.9068, `longestDarkH` 63, `earthVisFraction` ≈ 0.4998, `longestEarthGapH` 334 (identical to the Python report).

Run: `npm --prefix web run engine:demo -- --site im1_odysseus`
Expected: `fallback_bands` has one entry with `grid: "L2"` and `rMinM` 3880.

- [ ] **Step 2: Docs**

`web/README.md`:

```markdown
# Earthrise — web app

Next.js 16 app for the CLPS Lunar Mission Browser (NASA Space Apps 2026, team Astroy/Ed).

## Setup

    npm install
    # copy the pipeline artifacts (run from pipeline/): uv run python -m lunar_pipeline.cli sync-local --tiles
    npm run dev

## Engine

`src/lib/engine/` is a pure-TypeScript port of the Python pipeline science (no DOM, no React):
time (UTC ↔ TDB), geometry (ENU az/el with parallax, south polar stereographic), ephemeris
(Catmull-Rom over the hourly MOON_ME table), tiles (zlib int16 DEM tiles, bilinear sampler),
horizon (nested-grid skyline with fallback bands), metrics (sunlit / Earth-visible series,
prefix-sum window index, best-window search).

Parity gates (all in `npm test`): JPL Horizons az/el < 0.002°, Python masks < 0.01°, metrics
fractions < 1e-6. Demo: `npm run engine:demo -- --site shackleton_center_rim_high`.
```

Root `README.md`:

```markdown
# Earthrise

Compare lunar south-pole landing sites and dates: Sun and Earth above the terrain horizon, solar
power potential, direct-to-Earth communication windows. NASA Space Apps 2026 — challenge
"CLPS Lunar Mission Browser" — team Astroy/Ed.

- `pipeline/` — offline Python pipeline (NASA SPICE, LOLA DEMs, LOLA illumination maps) → `data/`
- `web/` — Next.js app with the TypeScript science engine
- `docs/` — design spec, weekly plans, method notes, data credits
```

- [ ] **Step 3: Build and full test gate**

Run: `npm --prefix web test && npm --prefix web run build && npm --prefix web run lint`
Expected: all vitest files pass (helpers 2, time 4, geometry 7, ephemeris 5, tiles 5, horizon 4, metrics 8 = 35), build succeeds, lint reports no errors (warnings allowed).

- [ ] **Step 4: Commit**

```bash
git add web/scripts/engine-demo.ts web/src/lib/engine/index.ts web/README.md README.md
git commit -m "feat(web): engine demo script and project docs"
```

---

## Self-review notes

- Spec coverage: 5.1 ephemeris + parallax (Tasks 3–5), 5.2 tiles + nested-grid masks (Tasks 6–7), 5.3 metrics + prefix sums + best window (Task 8), 6 validity (Horizons parity in Task 5, mask parity in Task 7, metrics parity in Task 8). Not in this plan by design: Web Worker wrapper, IndexedDB/Cache API, fetch-based tile loading in the browser UI, sky-dome/timeline UI, 3D — those are Week 2B and Week 3.
- Interfaces: `Series` field names (`sunAz`…) are consumed by Task 8 tests and Task 9 script; `computeSiteMask` return shape is consumed by Task 9; `LevelSampler.valueBilinear` NaN semantics mirror Python `value_bilinear` exactly (4-neighbour in-grid rule), which is what the mask parity depends on.
- Review Focus 1–5 pinned by: Task 6 missing-tile test, Task 5 + Task 8 range tests, Task 3 naive-ISO test, Task 7 bandsForSite test, Task 5 byte-length test.
- `zlibStored` in `tiles.ts` exists only so `MemoryTileSource` can produce valid zlib without a compressor in the browser bundle; it is 30 lines and tested indirectly by every synthetic sampler test.
