# Redesign part 3: terrain views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every polar site gets sharp terrain, the ground panel opens on a top-down shadow map computed in the browser for the hour of the time bar, the 3D view shows the same light, and a Horizon tab shows the 360° skyline with the Sun's and Earth's paths.

**Architecture:** The pipeline cuts a detailed window for every polar site (20 m inside 87.55° S, 80 m elsewhere) and, for 20 m sites, an 80 m context grid; the manifest lists both. The browser ports the pipeline's exact sweep (`pipeline/lunar_pipeline/shadow.py`) to `web/src/lib/engine/shadow.ts`, chains three levels (a cap crop, the context, the window) coarse to fine, runs it in a worker (half resolution while the time moves, full when it rests) and draws the result on a canvas; the 3D mesh is textured with the same picture instead of GPU shadows. A Python fixture pins the TypeScript port to the reference.

**Tech Stack:** Python 3.12 (uv, numpy, pytest), Next.js 16 App Router, React 19, TypeScript, Tailwind 4, three.js via React Three Fiber, vitest 5 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-redesign-design.md` (sections 6.3 item 4, 8, 15, 16).

## Global Constraints

- Plain words on screen; no instrument or programme names in page text (LOLA, DE440, Horizons, CLPS stay in credits and the Accuracy page).
- Moon's three tones: stage `#000`, page `#dedcd6` (light) / `#222220` (dark), surface `#fff` / `#2c2c2a`; colour only for the Sun (gold) and Earth (blue), green and red for the power verdict.
- Radii: stage 6 px, panels and controls 8 px, plates 5 px; no shadows, gradients or blur.
- No text under 14 px; controls at least 40 px tall; standalone links underlined.
- Numbers keep their unit on the same line (no-break space before "%").
- One gold action per screen.
- Every behaviour change starts with a failing test; gates from `web/`: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; from `pipeline/`: `uv run pytest -q`.
- No downloads over about 100 MB without asking; the 20, 80 and 240 m LOLA grids are already in `data_raw/lola`.
- Never read, print or copy `web/.env.local`; no calls to OpenRouter or other paid APIs in tests.
- Terrain files in `web/public/data/terrain` are git-ignored; tests that need them skip when they are missing.

## Review Focus

1. A site whose window overhangs the edge of its grid (filled from the coarser grid) or holds NaN cells: the sweep must not turn NaN into light or darkness across a whole line. Tests in Tasks 3 and 4.
2. The Sun exactly along a grid axis, on a diagonal, and at a bearing that makes the slope exactly 1: every pixel decided once, no gaps. Tests in Task 3.
3. The Sun below the horizon or grazing at 0°: the map is dark except where terrain reaches above the line; no division by zero in `tan`. Tests in Task 3.
4. Moving the time quickly: requests overtake each other; the picture shown must be the one for the latest hour, never an older reply arriving late. Tests in Task 5.
5. A mare site (no polar terrain): the ground panel must not crash or show an empty canvas; it explains the flat horizon and keeps the globe. Tests in Task 9.

## File map

| File | Responsibility |
|---|---|
| `pipeline/lunar_pipeline/terrain3d.py` | windows for every polar site; 80 m context for 20 m sites; manifest v2 |
| `pipeline/lunar_pipeline/shadow.py` | reference sweep (exists); `fixture-shadow` writer |
| `data/fixtures/shadow/*.json` | golden lit masks and pictures for the TypeScript port |
| `web/src/lib/engine/shadow.ts` | sweep, cast, shade (port) |
| `web/src/lib/engine/shadow-handler.ts` | the worker's pure request handler, level cache, half resolution |
| `web/src/workers/shadow.worker.ts`, `web/src/lib/shadow-client.ts` | the worker and its client (inline fallback, latest reply wins) |
| `web/src/lib/data/terrain.ts` | manifest v2 types, `contextFileFor`, `shadowLevels` |
| `web/src/lib/store/explore.ts` | loads the context grid with the window |
| `web/src/lib/viz/shadowmap.ts` | scale bar, Sun and Earth arrows |
| `web/src/lib/viz/horizon.ts` | panorama geometry |
| `web/src/components/explore/ShadowMap.tsx` | the canvas picture with pin, scale and arrows |
| `web/src/components/explore/HorizonView.tsx` | the 360° skyline with the Sun's and Earth's paths |
| `web/src/components/explore/GroundPanel.tsx` | three tabs; full screen |
| `web/src/components/three/Terrain.tsx`, `Scene3DCanvas.tsx`, `SunAndEarth.tsx` | mesh textured with the shadow picture; no GPU shadows |
| `web/src/components/ExploreView.tsx` | ground panel for every site again |

---

### Task 1: A window for every polar site, and an 80 m context for 20 m sites

**Files:**
- Modify: `pipeline/lunar_pipeline/terrain3d.py`
- Test: `pipeline/tests/test_terrain3d.py`

**Interfaces:**
- Produces: `CONTEXT_PX = 512`; `write_site_context(site, grids, out_dir) -> Path | None` (None for an 80 m site); manifest `version: 2` with `windows[i].context = {"file", "meta", "cell_m", "width", "height"}` for 20 m sites; context sidecar `kind: "context"`.

- [ ] **Step 1: Write the failing tests**

```python
def test_write_site_context_cuts_80_m_around_a_20_m_site(synthetic_grid_factory, tmp_path):
    from lunar_pipeline.terrain3d import CONTEXT_PX, write_site_context

    fine = synthetic_grid_factory(size=2048, scale_m=20.0)
    coarse = synthetic_grid_factory(size=1024, scale_m=80.0)
    cap = synthetic_grid_factory(size=512, scale_m=240.0)
    grids = {"L0": fine, "L1": coarse, "L2": cap}
    site = Site(id="deep", name="Deep", lat=-89.9, lon=10.0, category="test", polar=True, source="test")
    path = write_site_context(site, grids, tmp_path)
    meta = json.loads(path.with_suffix(".json").read_text())
    assert meta["kind"] == "context" and meta["level"] == "L1" and meta["cell_m"] == 80.0
    assert meta["width"] == meta["height"] == CONTEXT_PX
    assert abs(meta["site_col_px"] - CONTEXT_PX // 2) <= 1 and abs(meta["site_row_px"] - CONTEXT_PX // 2) <= 1


def test_write_site_context_is_none_for_an_80_m_site(synthetic_grid_factory, tmp_path):
    from lunar_pipeline.terrain3d import write_site_context

    grids = {"L0": synthetic_grid_factory(256, 20.0), "L1": synthetic_grid_factory(256, 80.0), "L2": synthetic_grid_factory(256, 240.0)}
    site = Site(id="far", name="Far", lat=-85.0, lon=10.0, category="test", polar=True, source="test")
    assert write_site_context(site, grids, tmp_path) is None
```

- [ ] **Step 2: Run them and watch them fail** — `uv run pytest tests/test_terrain3d.py -q -k context` → ImportError (`write_site_context`).

- [ ] **Step 3: Implement**

```python
CONTEXT_PX = 512  # 40.96 km at 80 m around a 20 m site: hills beyond the window still cast into it


def write_site_context(site: Site, grids: dict[str, LolaGrid], out_dir: Path) -> Path | None:
    """The 80 m context grid around a 20 m site (None for a site whose window is already 80 m)."""
    if level_for_site(site) != "L0":
        return None
    out_dir.mkdir(parents=True, exist_ok=True)
    grid = grids["L1"]
    col, row = grid.pixel_from_latlon(site.lat, site.lon)
    row0 = int(round(float(row))) - CONTEXT_PX // 2
    col0 = int(round(float(col))) - CONTEXT_PX // 2
    heights, n_fill = window_heights(grid, row0, col0, CONTEXT_PX, grids.get("L2"))
    meta = {
        "site_id": site.id,
        "lat": site.lat,
        "lon": site.lon,
        "kind": "context",
        "source": f"{GRID_FILES['L1']}.img",
        "level": "L1",
        "cell_m": grid.label.map_scale_m,
        "row0": row0,
        "col0": col0,
        "line_offset_px": grid.label.line_offset_px,
        "sample_offset_px": grid.label.sample_offset_px,
        "site_row_px": float(row) - row0,
        "site_col_px": float(col) - col0,
        "site_height_m": float(grid.value_at(site.lat, site.lon)),
        "fill_source": f"{GRID_FILES['L2']}.img" if n_fill else None,
        "fill_px": n_fill,
    }
    return _write_raster(out_dir / f"{site.id}.context.u16", heights, meta)
```

In `write_all`, after `write_site_window`, call `write_site_context` and, when it returns a path, add to the window entry:

```python
        context = write_site_context(site, grids, out_dir)
        if context is not None:
            cmeta = json.loads(context.with_suffix(".json").read_text())
            entry["context"] = {"file": context.name, "meta": context.with_suffix(".json").name, "cell_m": cmeta["cell_m"], "width": cmeta["width"], "height": cmeta["height"]}
```

and set `"version": 2` in the manifest.

- [ ] **Step 4: Run the tests** — `uv run pytest tests/test_terrain3d.py -q` → pass; `uv run ruff check lunar_pipeline tests` → clean.

- [ ] **Step 5: Regenerate the terrain files (local, no download)** — `uv run python -m lunar_pipeline.cli terrain` then `uv run python -m lunar_pipeline.cli sync-local --tiles`; expect 18 windows in `web/public/data/terrain/manifest.json`, 3 of them (20 m) with a `context`.

- [ ] **Step 6: Commit** — `feat(pipeline): a terrain window for every polar site and an 80 m context grid around each 20 m window`.

### Task 2: Golden shadow fixtures for the TypeScript port

**Files:**
- Modify: `pipeline/lunar_pipeline/shadow.py` (add `fixture_cases()` and `write_fixtures(out_dir)`), `pipeline/lunar_pipeline/cli.py` (`fixture-shadow`)
- Create: `data/fixtures/shadow/ridge.json`, `data/fixtures/shadow/chain.json`
- Test: `pipeline/tests/test_shadow.py`

**Interfaces:**
- Produces: fixture JSON `{ "name", "levels": [{ "heights": number[], "width", "height", "px_m", "site_col", "site_row" }], "cases": [{ "bearing_deg", "el_deg", "lit": (0|1)[], "margin": number[] (rounded to 0.01 m, null for -inf), "shade": number[] }] }`; `lit`, `margin` and `shade` belong to the last (finest) level.

- [ ] **Step 1: Write the failing test**

```python
def test_fixture_cases_hold_what_cast_and_shade_give(tmp_path):
    from lunar_pipeline.shadow import write_fixtures

    paths = write_fixtures(tmp_path)
    assert sorted(p.name for p in paths) == ["chain.json", "ridge.json"]
    doc = json.loads((tmp_path / "ridge.json").read_text())
    level = doc["levels"][-1]
    z = np.array(level["heights"]).reshape(level["height"], level["width"])
    case = doc["cases"][0]
    lit, margin = cast([Level(z, level["px_m"], level["site_col"], level["site_row"])], case["bearing_deg"], case["el_deg"])
    assert case["lit"] == lit.astype(int).ravel().tolist()
    assert case["shade"] == shade(z, level["px_m"], margin, case["bearing_deg"], case["el_deg"]).ravel().tolist()
```

- [ ] **Step 2: Run it and watch it fail** — ImportError (`write_fixtures`).

- [ ] **Step 3: Implement** in `shadow.py`:

```python
def fixture_cases() -> dict[str, list[Level]]:
    """Small grids the TypeScript port is checked against: a ridge, and a coarse level chained into a fine one."""
    h, w = 24, 32
    rows, cols = np.indices((h, w))
    ridge = 300.0 * np.exp(-((cols - 20.0) ** 2) / 18.0) + 20.0 * np.sin(rows / 3.0)
    coarse = np.zeros((16, 16))
    coarse[2:4, :] = 900.0  # a wall far to the north of the fine grid
    fine = 15.0 * np.cos(cols[:20, :20] / 4.0) * np.sin(rows[:20, :20] / 5.0)
    return {
        "ridge": [Level(ridge, 20.0, (w - 1) / 2, (h - 1) / 2)],
        "chain": [Level(coarse, 80.0, 7.5, 7.5), Level(fine, 20.0, 9.5, 9.5)],
    }


FIXTURE_SUNS = [(250.0, 2.0), (0.0, 1.0), (45.0, 4.0), (123.4, 0.5), (300.0, -0.5)]


def write_fixtures(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, levels in fixture_cases().items():
        cases = []
        for bearing, el in FIXTURE_SUNS:
            lit, margin = cast(levels, bearing, el)
            fine = levels[-1]
            cases.append(
                {
                    "bearing_deg": bearing,
                    "el_deg": el,
                    "lit": lit.astype(int).ravel().tolist(),
                    "margin": [None if not np.isfinite(m) else round(float(m), 2) for m in margin.ravel()],
                    "shade": shade(fine.heights_m, fine.px_m, margin, bearing, el).ravel().tolist(),
                }
            )
        doc = {
            "name": name,
            "levels": [
                {"heights": [round(float(v), 4) for v in lv.heights_m.ravel()], "width": int(lv.heights_m.shape[1]), "height": int(lv.heights_m.shape[0]), "px_m": lv.px_m, "site_col": lv.site_col, "site_row": lv.site_row}
                for lv in levels
            ],
            "cases": cases,
        }
        path = out_dir / f"{name}.json"
        path.write_text(json.dumps(doc) + "\n")
        paths.append(path)
    return paths
```

The heights are rounded to 4 decimals before writing; compute the cases from the rounded heights (round the arrays first) so the fixture is self-consistent. Add `fixture-shadow` to `cli.py`: `write_fixtures(config.DATA_DIR / "fixtures" / "shadow")`.

- [ ] **Step 4: Run** — `uv run pytest tests/test_shadow.py -q` → pass; `uv run python -m lunar_pipeline.cli fixture-shadow` → writes the two files.

- [ ] **Step 5: Commit** — `feat(pipeline): golden shadow fixtures for the browser's port of the sweep`.

### Task 3: The sweep in the browser

**Files:**
- Create: `web/src/lib/engine/shadow.ts`, `web/src/lib/engine/shadow.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Level { heights: ArrayLike<number>; width: number; height: number; pxM: number; siteCol: number; siteRow: number }
export function sunBearingDeg(lonDeg: number, sunAzDeg: number): number;
export function sweep(level: Level, bearingDeg: number, elDeg: number, seed?: (x: number, y: number) => number): { lit: Uint8Array; mBefore: Float64Array; margin: Float64Array };
export function cast(levels: Level[], bearingDeg: number, elDeg: number): { lit: Uint8Array; margin: Float64Array };
export function shade(level: Level, margin: ArrayLike<number>, bearingDeg: number, elDeg: number, softM?: number): Uint8Array;
```

- [ ] **Step 1: Write the failing tests** (`shadow.test.ts`): flat ground lit for the Sun up and dark (under 6 %) for the Sun down at ten bearings; every pixel decided once at bearings 0, 45, 90, 135, 180, 225, 270, 315, 12.5 and 298 on a 37 × 53 grid (no NaN in `mBefore` for a flat grid with a seed of 0); a wall of height H shadows exactly `H / tan(el) / px` pixels behind it for the four axis bearings; a NaN cell neither lights nor darkens the rest of its line (treated as -inf height); parity with `data/fixtures/shadow/*.json`: `lit` equal everywhere, `margin` within 0.02 m where finite, `shade` within 2 levels.

```ts
import { describe, expect, it } from 'vitest';
import { readJson } from './__tests__/helpers';
import { cast, shade, sunBearingDeg, sweep, type Level } from './shadow';

const flat = (h = 64, w = 80, px = 20): Level => ({ heights: new Float64Array(h * w), width: w, height: h, pxM: px, siteCol: (w - 1) / 2, siteRow: (h - 1) / 2 });

describe('sweep', () => {
  it('lights flat ground when the Sun is up and darkens it when the Sun is down', () => {
    for (const b of [0, 45, 90, 135, 180, 225, 270, 315, 12.5, 298]) {
      expect(sweep(flat(), b, 3).lit.every((v) => v === 1)).toBe(true);
      const dark = sweep(flat(), b, -3).lit;
      expect(dark.reduce((a, v) => a + v, 0) / dark.length).toBeLessThan(0.06);
    }
  });

  it('decides every pixel exactly once for any bearing', () => {
    for (const b of [0, 45, 90, 135, 180, 225, 270, 315, 12.5, 298]) {
      const { mBefore } = sweep(flat(37, 53), b, 2, () => 0);
      expect(Array.from(mBefore).every((m) => Number.isFinite(m))).toBe(true);
    }
  });

  it('casts a wall's shadow as long as its height over the tangent of the elevation', () => {
    const w = 61, h = 61, px = 10, H = 50, el = 5;
    const heights = new Float64Array(w * h);
    for (let r = 0; r < h; r++) heights[r * w + 30] = H; // a north-south wall in the middle column
    const level: Level = { heights, width: w, height: h, pxM: px, siteCol: 30, siteRow: 30 };
    const { lit } = sweep(level, 90, el); // the Sun due east: the shadow falls west of the wall
    const expected = Math.floor(H / Math.tan((el * Math.PI) / 180) / px);
    let n = 0;
    for (let c = 29; c >= 0 && lit[30 * w + c] === 0; c--) n++;
    expect(Math.abs(n - expected)).toBeLessThanOrEqual(1);
  });

  it('lets a missing height neither light nor darken the rest of its line', () => {
    const level = flat(20, 20);
    (level.heights as Float64Array)[10 * 20 + 10] = NaN;
    const { lit } = sweep(level, 90, 2);
    expect(Array.from(lit).every((v, i) => i === 10 * 20 + 10 || v === 1)).toBe(true);
  });
});

describe('sunBearingDeg', () => {
  it('adds the longitude on the south polar grid', () => {
    expect(sunBearingDeg(-64.31, 30)).toBeCloseTo(325.69, 9);
    expect(sunBearingDeg(120, 300)).toBeCloseTo(60, 9);
  });
});

describe('parity with the pipeline', () => {
  for (const name of ['ridge', 'chain']) {
    it(`matches ${name}`, () => {
      const doc = readJson<{ levels: { heights: number[]; width: number; height: number; px_m: number; site_col: number; site_row: number }[]; cases: { bearing_deg: number; el_deg: number; lit: number[]; margin: (number | null)[]; shade: number[] }[] }>('data', 'fixtures', 'shadow', `${name}.json`);
      const levels: Level[] = doc.levels.map((l) => ({ heights: Float64Array.from(l.heights), width: l.width, height: l.height, pxM: l.px_m, siteCol: l.site_col, siteRow: l.site_row }));
      for (const c of doc.cases) {
        const { lit, margin } = cast(levels, c.bearing_deg, c.el_deg);
        expect(Array.from(lit)).toEqual(c.lit);
        c.margin.forEach((m, i) => (m === null ? expect(Number.isFinite(margin[i])).toBe(false) : expect(Math.abs(margin[i] - m)).toBeLessThanOrEqual(0.02)));
        const pic = shade(levels[levels.length - 1], margin, c.bearing_deg, c.el_deg);
        c.shade.forEach((v, i) => expect(Math.abs(pic[i] - v)).toBeLessThanOrEqual(2));
      }
    });
  }
});
```

- [ ] **Step 2: Run them and watch them fail** — `npx vitest run src/lib/engine/shadow.test.ts` → cannot find `./shadow`.

- [ ] **Step 3: Implement** `shadow.ts`, a line-by-line port of `shadow.py`:

```ts
import { R_MOON_M } from './constants';

export interface Level { heights: ArrayLike<number>; width: number; height: number; pxM: number; siteCol: number; siteRow: number }

/** Map bearing of the Sun, clockwise from map-up (the lon 0 direction), for a site at this longitude. */
export function sunBearingDeg(lonDeg: number, sunAzDeg: number): number {
  return (((lonDeg + sunAzDeg) % 360) + 360) % 360;
}

const DEG = Math.PI / 180;

/** g = tangent height − distance towards the Sun × tan(elevation), per pixel; a missing height counts as −∞. */
function lineValues(level: Level, bearingDeg: number, elDeg: number): Float64Array {
  const { width: w, height: h, pxM, siteCol, siteRow, heights } = level;
  const sx = Math.sin(bearingDeg * DEG);
  const sy = Math.cos(bearingDeg * DEG);
  const t = Math.tan(elDeg * DEG);
  const g = new Float64Array(w * h);
  for (let r = 0; r < h; r++) {
    const y = (siteRow - r) * pxM;
    for (let c = 0; c < w; c++) {
      const x = (c - siteCol) * pxM;
      const z = heights[r * w + c];
      g[r * w + c] = Number.isFinite(z) ? z - (x * x + y * y) / (2 * R_MOON_M) - (x * sx + y * sy) * t : -Infinity;
    }
  }
  return g;
}

export function sweep(level: Level, bearingDeg: number, elDeg: number, seed?: (x: number, y: number) => number) {
  const { width: w, height: h, pxM, siteCol, siteRow } = level;
  const g = lineValues(level, bearingDeg, elDeg);
  const mBefore = new Float64Array(w * h).fill(-Infinity);
  const ux = Math.sin(bearingDeg * DEG);
  const uy = -Math.cos(bearingDeg * DEG);
  const xOf = (c: number) => (c - siteCol) * pxM;
  const yOf = (r: number) => (siteRow - r) * pxM;
  if (Math.abs(ux) >= Math.abs(uy)) {
    const slope = uy / ux;
    const start = ux > 0 ? w - 1 : 0;
    const span = Math.ceil(Math.abs(slope) * (w - 1)) + 1;
    const m = new Float64Array(h + 2 * span).fill(-Infinity);
    const entered = new Uint8Array(h + 2 * span);
    for (let k = 0; k < w; k++) {
      const c = ux > 0 ? w - 1 - k : k;
      const lo = span - Math.floor(slope * (c - start) + 0.5);
      for (let r = 0; r < h; r++) {
        const L = lo + r;
        if (seed && !entered[L]) m[L] = seed(xOf(c), yOf(r));
        entered[L] = 1;
        const i = r * w + c;
        mBefore[i] = m[L];
        if (g[i] > m[L]) m[L] = g[i];
      }
    }
  } else {
    const slope = ux / uy;
    const start = uy > 0 ? h - 1 : 0;
    const span = Math.ceil(Math.abs(slope) * (h - 1)) + 1;
    const m = new Float64Array(w + 2 * span).fill(-Infinity);
    const entered = new Uint8Array(w + 2 * span);
    for (let k = 0; k < h; k++) {
      const r = uy > 0 ? h - 1 - k : k;
      const lo = span - Math.floor(slope * (r - start) + 0.5);
      for (let c = 0; c < w; c++) {
        const L = lo + c;
        if (seed && !entered[L]) m[L] = seed(xOf(c), yOf(r));
        entered[L] = 1;
        const i = r * w + c;
        mBefore[i] = m[L];
        if (g[i] > m[L]) m[L] = g[i];
      }
    }
  }
  const margin = new Float64Array(w * h);
  const lit = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    margin[i] = mBefore[i] - g[i];
    lit[i] = margin[i] <= 0 || !Number.isFinite(g[i]) ? 1 : 0;
  }
  return { lit, mBefore, margin };
}
```

(A missing height is lit and never shades its line: its g is −∞, so it neither raises the running maximum nor falls under it; the Python reference is fed no NaN — `hero_levels` already replaces them — so parity holds.)

`cast` chains the levels with a seed that reads the coarse `mBefore` at the coarse pixel under each entry point (`col = floor(x / px + siteCol + 0.5)`, `row = floor(siteRow − y / px + 0.5)`, −∞ outside), exactly as `_seed_from`. `shade` ports `shade()` with `np.gradient` semantics (central differences inside, one-sided at the edges), the fixed 40° fill, the soft edge over `softM = 6` m, the 92nd percentile of the directly lit values (sort a `Float64Array` of them; linear interpolation between ranks, as numpy's default), and truncation to 8 bits.

- [ ] **Step 4: Run** — the tests pass; `npx tsc --noEmit` and `npm run lint` clean.

- [ ] **Step 5: Commit** — `feat(engine): the shadow sweep in the browser, checked against the pipeline`.

### Task 4: Terrain levels for a site

**Files:**
- Modify: `web/src/lib/data/terrain.ts`, `web/src/lib/store/explore.ts`, `web/src/test/file-loaders.ts`
- Test: `web/src/lib/data/terrain.test.ts`, `web/src/lib/store/explore.test.ts`

**Interfaces:**
- Consumes: manifest v2 (Task 1); `Level` (Task 3).
- Produces: `TerrainWindowEntry.context?: { file: string; meta: string; cell_m: number; width: number; height: number }`; `contextFileFor(manifest, siteId): { file: string; meta: string } | null`; `shadowLevels(window: Heightmap, context: Heightmap | null, cap: Heightmap | null): Level[]` (cap crop of ±240 px around the site, then the context, then the window, each with its own site pixel); store state `contextHeightmap: Heightmap | null`, loaded and cached with the window.

- [ ] **Step 1: Write the failing tests** — `contextFileFor` returns the entry's context and null for an 80 m site; `shadowLevels` orders levels coarse to fine, keeps each level's `siteCol`/`siteRow` from its meta, crops the cap to 481 × 481 around the site (clamped at the cap's edge), and turns a cell that equals `min_m` and lies in the window's `fill_px` area into NaN only when the sidecar says it is missing (it never does in practice; the test checks the heights are passed through unchanged); the store test: after `selectSite('de_gerlache_rim_2')` and `waitForTerrain()`, `contextHeightmap?.meta.kind` is `'context'` (skipped when the manifest is missing), and for an 80 m site it is null.

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement** — `contextFileFor` reads `entry.context`; `loadWindowNow` also loads the context when listed (same cache keyed `${siteId}:context`, same sequence guard); `shadowLevels` uses `cropHeightmap` and `latLonToPixel` for the cap.

- [ ] **Step 4: Run** the terrain and store tests; tsc; lint.

- [ ] **Step 5: Commit** — `feat(web): the context grid is loaded with a site's window, and a site's terrain becomes three shadow levels`.

### Task 5: The shadow worker

**Files:**
- Create: `web/src/lib/engine/shadow-handler.ts`, `web/src/workers/shadow.worker.ts`, `web/src/lib/shadow-client.ts`
- Test: `web/src/lib/engine/shadow-handler.test.ts`, `web/src/lib/shadow-client.test.ts`

**Interfaces:**
- Consumes: `cast`, `shade`, `Level` (Task 3); `shadowLevels` (Task 4).
- Produces:

```ts
export type ShadowRequest =
  | { id: number; type: 'levels'; key: string; levels: Level[] }
  | { id: number; type: 'shade'; key: string; bearingDeg: number; elDeg: number; half: boolean };
export type ShadowResponse =
  | { id: number; type: 'ok' }
  | { id: number; type: 'picture'; key: string; width: number; height: number; pixels: Uint8Array; siteLit: boolean }
  | { id: number; type: 'error'; message: string };
export function createShadowHandler(): (req: ShadowRequest) => ShadowResponse;
export class ShadowClient { setLevels(key: string, levels: Level[]): Promise<void>; picture(key: string, bearingDeg: number, elDeg: number, half: boolean): Promise<ShadowResponse & { type: 'picture' } | null>; dispose(): void }
```

`picture` resolves null when a newer request was sent before its reply arrived (the latest request wins). Half resolution averages 2 × 2 cells of every level (pixel size doubled, site pixel halved) and is cached per key.

- [ ] **Step 1: Write the failing tests** — the handler returns the finest level's picture size (and half of it with `half`), `siteLit` matches `cast` at the site pixel, an unknown key returns an error; the client run inline (no `Worker` in Node) resolves the latest request and null for an overtaken one (two calls without awaiting the first).

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement** the handler (a `Map` of full and half level sets; `half` built on first use), the worker (`self.onmessage` calls the handler and transfers `pixels.buffer`), and the client (as `EngineClient`: a `Worker` from `new URL('../workers/shadow.worker.ts', import.meta.url)` when available, the handler inline otherwise; a `latest` counter per key so an older reply resolves null).

- [ ] **Step 4: Run**; tsc; lint.

- [ ] **Step 5: Commit** — `feat(web): the shadow sweep runs in a worker; the latest hour's picture wins`.

### Task 6: The map agrees with the engine

**Files:**
- Test: `web/src/lib/engine/shadow-acceptance.test.ts`

**Interfaces:**
- Consumes: `shadowLevels` (Task 4), `cast`, `sunBearingDeg` (Task 3), `hourlySeries` (engine).

- [ ] **Step 1: Write the test** (skipped when the terrain files are missing): for de Gerlache Rim 2 over January 2027, every third hour, the site pixel of the window is lit by `cast` exactly when the engine's `sunFraction >= 0.5`, for at least 97 % of the hours, and every disagreement lies within 3 hours of an hour where the engine's answer changes.

```ts
const agree = hours.filter((h) => lit(h) === engineLit(h)).length / hours.length;
expect(agree).toBeGreaterThanOrEqual(0.97);
for (const h of hours.filter((h) => lit(h) !== engineLit(h))) expect(nearTransition(h, 3)).toBe(true);
```

- [ ] **Step 2: Run it.** If it fails, the cause is a sign or frame error (bearing, rows versus y): debug with `superpowers:systematic-debugging` before changing the threshold; a threshold change needs a spec amendment.

- [ ] **Step 3: Commit** — `test(engine): the shadow map agrees with the engine's sunlight at the site`.

### Task 7: The shadow map

**Files:**
- Create: `web/src/lib/viz/shadowmap.ts`, `web/src/components/explore/ShadowMap.tsx`
- Test: `web/src/lib/viz/shadowmap.test.ts`, `web/src/components/explore/ShadowMap.test.tsx`

**Interfaces:**
- Consumes: `ShadowClient` (Task 5), `shadowLevels` (Task 4), `sunBearingDeg` (Task 3), `SceneState` (sun and Earth az/el).
- Produces: `scaleBarKm(widthKm: number): number` (1, 2, 5, 10 or 20: the largest that is at most a quarter of the picture); `arrowEnd(bearingDeg: number, sizePx: number): { x: number; y: number }` (from the centre to 42 % of the side, map-up = lon 0); `<ShadowMap levels when sunAz sunEl earthAz earthEl lon playing />`.

- [ ] **Step 1: Write the failing tests** — `scaleBarKm(20.48)` is 5, `scaleBarKm(40.96)` is 10; `arrowEnd(0, 400)` points straight up, `arrowEnd(90, 400)` right; the component (jsdom, a stub client) draws a canvas labelled "Shadows at {when}", shows the scale words, "Sun" and "Earth" arrows with their heights ("Sun 2° up"), the pin, and says "Earth is below the horizon" when its elevation is under 0.

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement** — the component asks the client for a half-resolution picture on every hour change while `playing` (or while the hour changed within the last 250 ms) and for a full one 250 ms after the last change; it puts the 8-bit picture in an `ImageData` (grey) on a canvas sized to the panel; the pin, scale bar and arrows are SVG over the canvas, words on 5 px plates in 15 px type.

- [ ] **Step 4: Run**; tsc; lint.

- [ ] **Step 5: Commit** — `feat(web): the shadow map: the ground from above, lit for the hour of the time bar`.

### Task 8: The horizon

**Files:**
- Create: `web/src/lib/viz/horizon.ts`, `web/src/components/explore/HorizonView.tsx`
- Test: `web/src/lib/viz/horizon.test.ts`, `web/src/components/explore/HorizonView.test.tsx`

**Interfaces:**
- Produces: `horizonGeometry(mask: ArrayLike<number>, series: Series, width: number, height: number): { skyline: string; sun: { visible: boolean; points: string }[]; earth: { visible: boolean; points: string }[]; x: (azDeg: number) => number; y: (elDeg: number) => number }` (x runs north, east, south, west, north from left to right; the vertical range fits the skyline and both paths with 1° to spare); `<HorizonView mask series cursor />`.

- [ ] **Step 1: Write the failing tests** — the skyline has 721 points; a path that crosses north (az 359 → 1) is split, never drawn across the picture; the component names the compass points along the bottom, marks the Sun and Earth at the cursor hour, and its caption says "Over these days the Sun moves from right to left along its path."

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement** in the chart style of part 2 (stage black, hills `--hill`, Sun gold, Earth blue, dotted while hidden, labels on plates).

- [ ] **Step 4: Run**; tsc; lint.

- [ ] **Step 5: Commit** — `feat(web): the horizon: the skyline all round with the Sun's and Earth's paths`.

### Task 9: The ground panel with three tabs, and the 3D view in the map's light

**Files:**
- Modify: `web/src/components/explore/GroundPanel.tsx`, `web/src/components/three/Terrain.tsx`, `web/src/components/three/Scene3DCanvas.tsx`, `web/src/components/three/SunAndEarth.tsx`, `web/src/components/three/Scene3D.tsx`, `web/src/components/ExploreView.tsx`
- Test: `web/src/components/explore/GroundPanel.test.tsx`, `web/src/components/three/Terrain.test.ts`, `web/src/components/ExploreView.test.tsx`

**Interfaces:**
- Consumes: `ShadowMap` (Task 7), `HorizonView` (Task 8), `ShadowClient` (Task 5).
- Produces: tabs "Shadow map" (default), "3D", "Horizon" (`role="tablist"`); the 3D tab keeps Terrain/Globe and the height switch and adds "Full screen"; `Terrain` takes `picture: { pixels: Uint8Array; width: number; height: number } | null` and paints the window with it (`MeshBasicMaterial`, no GPU shadows); a mare site's shadow tab says "This site has no polar terrain: its horizon is taken as flat." and its 3D tab shows the globe; ExploreView shows the ground panel for every site again (the part 2 rule that hid it goes).

- [ ] **Step 1: Write the failing tests** — tabs and their order, the default tab, the mare-site words, the full-screen button calls `requestFullscreen` on the panel, `Terrain`'s material is a `MeshBasicMaterial` with a map when a picture is given, ExploreView shows a region named "The ground" for de Gerlache Rim 2 when the manifest lists its window.

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement.** Scene3DCanvas drops `shadows`; SunAndEarth keeps its markers and drops the shadow light settings; the context ring is painted a flat dark grey so the window stands out.

- [ ] **Step 4: Run**; tsc; lint; build.

- [ ] **Step 5: Commit** — `feat(web): the ground panel opens on the shadow map; 3D shows the same light; the horizon is a tab`.

### Task 10: Look at it, measure it, read it blind

- [ ] Screenshots of Explore's lower half (ground panel on each tab) at 1440 × 900 light and dark, at 390 and 1024; no text under 14 px, no control under 40 px, no sideways scroll, no overlapping labels.
- [ ] Time: the sweep for a 1024 × 1024 window with its context and cap, full and half resolution, measured in the browser (target: full under 150 ms, half under 50 ms on this laptop).
- [ ] Blind read of the ground panel (two fresh readers, screenshots only; gate 4, 4, 4, 3, 3), fix what both name, repeat until it passes.
- [ ] Badge (`npm run validation:tests`), README (terrain for every polar site, the shadow map, `fixture-shadow`), spec amendments, ledger rulings; commit.
