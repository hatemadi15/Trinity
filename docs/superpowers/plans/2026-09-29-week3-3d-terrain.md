# Week 3 — 3D Globe, Polar Terrain and Real-Time Sun Shadows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the hero moment: a 3D view of the selected site's terrain built from LOLA elevation data, lit by the real Sun direction at the scrubber time so shadows sweep as the user drags, with a context globe (NASA LRO colour map, site pins, Sun/Earth directions) and click-to-pick custom sites on the globe.

**Architecture:** The Python pipeline cuts per-site heightmap windows and a south-cap heightmap from the local LOLA grids (no new large downloads; the 2K colour map from NASA SVS is 447 KB) into `data_out/terrain/` as zlib-compressed uint16 rasters with JSON sidecars. The web app loads them through the existing tile-decoding path, builds terrain geometry on the CPU (`terrain-mesh.ts`), and renders with React Three Fiber v9 inside a client-only `Scene3D` (dynamic import, `ssr: false`). Frame conversions (`three-frames.ts`) map MOON_ME vectors and local az/el to Three.js coordinates; the store's cursor drives a directional light with shadow maps. Explore's layout becomes 3D left, sky-dome + tiles right, timeline bottom.

**Tech Stack:** three ^0.186, @react-three/fiber ^9, @react-three/drei ^10, @types/three; Python: numpy (windows), Pillow not required (raw uint16 + zlib). Vitest for logic; Playwright MCP screenshots for visual critique (R3F does not render in jsdom).

**Spec:** `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md` (sections 2 hero moment, 3 MVP "3D globe + polar terrain", 4 Explore layout, 5.4 3D, 8 Week 3).

## Design plan (frontend-design)

The 3D viewport is the one bold element; the dome and tiles become supporting instruments on the right. Materials: regolith grey (`#8a857c` base, `#3b3935` shadow) lit only by the Sun (directional) plus a faint ambient (`0.08`) so unlit terrain reads as near-black like the timeline's night. The globe uses NASA's colour map at 2K on a 1-unit sphere against the page `--sky` black with sparse stars (drei `Stars`, count 1500, no motion). Sun marker: a small emissive disc in the Sun direction; Earth: a tiny blue sphere with an `Html` label in the Earth direction. Site pins: 6 px discs in `--sun-bright` for the selected site, `--ink-2` for others. Camera motion only on user action (orbit/zoom) and one 600 ms fly-to on site change (skipped under reduced motion). Copy: "Terrain", "Globe", "Vertical exaggeration 1× / 3×", "Pick a site on the globe".

## Global Constraints

- Coordinates: MOON_ME (x, y, z) → Three.js (x, z, −y) (`moonToThree`); local site frame east → +x, up → +y, north → −z (`localToThree`). Scene units: km. Terrain windows are centred on the site; the site sits at the origin at height 0 (heights are relative to the site height).
- Heightmap raster format (pipeline → web): zlib (RFC 1950) compressed little-endian uint16, row-major, north up (row 0 = northernmost in the polar-stereographic window, i.e. smallest row of the source grid), sidecar JSON `{ site_id, lat, lon, source, level, cell_m, width, height, row0, col0, min_m, max_m, scale_m_per_unit, site_height_m, generated_utc }` with `height_m = min_m + dn * scale_m_per_unit`.
- Featured windows: 1024×1024 at 20 m (20.48 km) from `ldem_875s_20m` for sites south of 87.55°S; 512×512 at 80 m (40.96 km) from `ldem_80s_80m` otherwise. South cap: `ldem_60s_240m` downsampled 4× (1940×1940 at 960 m).
- Globe texture: `lroc_color_2k.jpg` from https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ (447 KB, equirectangular, lon 0 at the centre, LRO WAC colour). Credit NASA SVS / LRO LROC in `docs/data-credits.md`.
- No new dependency in the engine; R3F code lives under `src/components/three/` and is imported only through `next/dynamic` with `ssr: false`.
- Downloads in this plan: 447 KB total. Anything larger (4K/16K colour TIFFs, 16 ppd displacement) waits for the user's go.
- Tests: `npm test` stays green; visual checks via Playwright screenshots at 1360×900 and 1024×900.

## Review Focus

1. **WebGL unavailable or context lost** (old venue laptop, headless): `Scene3D` renders a plain fallback panel with the site name and a note, never a blank canvas or a crash. Pinned by Task 5 `renders the fallback when WebGL is unavailable`.
2. **Heightmap missing for a custom site** (custom sites have no precomputed window): the terrain view shows the south-cap mesh centred on the site with a note "detailed terrain is available for featured sites", never an empty scene. Pinned by Task 6 `custom site without a window falls back to the cap`.
3. **Sun below the terrain horizon**: the directional light must still exist (shadows off, ambient only) and the Sun marker must render below the horizon plane, not disappear. Pinned by Task 4 `sunLight returns intensity 0 below the skyline`.
4. **Clicking the globe north of 60°S**: the pick is refused with the engine's message shown next to the site picker, and the current site stays. Pinned by Task 7 `globe pick north of 60S is refused`.
5. **Reduced motion**: the fly-to on site change is instant when `prefers-reduced-motion` is set. Pinned by Task 5 `camera preset is applied without animation under reduced motion` (pure helper test).

---

### Task 1: Pipeline — terrain windows, south cap, globe texture

**Files:**
- Create: `pipeline/lunar_pipeline/terrain3d.py`
- Create: `pipeline/tests/test_terrain3d.py`
- Modify: `pipeline/lunar_pipeline/fetch.py` (group `textures`: `lroc_color_2k.jpg`)
- Modify: `pipeline/lunar_pipeline/sync_local.py` (copy `data_out/terrain` when `--tiles`)
- Modify: `pipeline/lunar_pipeline/cli.py` (`terrain` command)
- Modify: `docs/data-credits.md` (SVS CGI Moon Kit row)

**Interfaces:**
- Produces: `window_for_site(site, grids) -> tuple[LolaGrid, int, int, int]` (grid, row0, col0, size); `encode_u16(heights_m: np.ndarray) -> tuple[bytes, dict]` (zlib bytes + `{min_m, max_m, scale_m_per_unit}`); `write_site_window(site, grids, out_dir) -> Path`; `write_south_cap(out_dir, factor=4) -> Path`; `write_all(out_dir=config.OUT_DIR / "terrain") -> Path` (manifest `terrain/manifest.json` listing windows + cap + texture file name).
- Consumes: `LolaGrid` (Week 1), `all_sites`, `masks.load_grids`.

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_terrain3d.py`:

```python
import json
import zlib

import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.terrain3d import encode_u16, window_for_site, write_all, write_site_window, write_south_cap
from lunar_pipeline.sites import Site, all_sites
from tests.conftest import needs_lola


def test_encode_u16_roundtrip_and_scale():
    h = np.array([[-1200.0, 0.0], [350.5, 2400.0]])
    payload, meta = encode_u16(h)
    dn = np.frombuffer(zlib.decompress(payload), dtype="<u2").reshape(2, 2)
    back = meta["min_m"] + dn.astype(np.float64) * meta["scale_m_per_unit"]
    assert meta["min_m"] == -1200.0 and meta["max_m"] == 2400.0
    assert np.allclose(back, h, atol=meta["scale_m_per_unit"])
    assert meta["scale_m_per_unit"] == pytest.approx(3600.0 / 65535.0)


@pytest.mark.data
@needs_lola
def test_window_for_site_picks_grid_by_latitude():
    from lunar_pipeline.masks import load_grids

    grids = load_grids()
    deep = next(s for s in all_sites() if s.id == "shackleton_center")
    g, row0, col0, size = window_for_site(deep, grids)
    assert g.label.map_scale_m == 20.0 and size == 1024
    mid = next(s for s in all_sites() if s.id == "im2_athena")
    g2, _, _, size2 = window_for_site(mid, grids)
    assert g2.label.map_scale_m == 80.0 and size2 == 512


@pytest.mark.data
@needs_lola
def test_site_window_has_site_at_centre_and_is_deep_for_shackleton(tmp_path):
    from lunar_pipeline.masks import load_grids

    grids = load_grids()
    site = next(s for s in all_sites() if s.id == "shackleton_center")
    path = write_site_window(site, grids, tmp_path)
    meta = json.loads(path.with_suffix(".json").read_text())
    dn = np.frombuffer(zlib.decompress(path.read_bytes()), dtype="<u2").reshape(meta["height"], meta["width"])
    h = meta["min_m"] + dn.astype(np.float64) * meta["scale_m_per_unit"]
    centre = h[meta["height"] // 2, meta["width"] // 2]
    assert abs(centre - meta["site_height_m"]) < 5.0
    assert h.max() - centre > 2000.0  # crater floor at the centre, rim inside a 10 km window
    assert meta["cell_m"] == 20.0 and meta["width"] == 1024


@pytest.mark.data
@needs_lola
def test_south_cap_downsample(tmp_path):
    path = write_south_cap(tmp_path, factor=4)
    meta = json.loads(path.with_suffix(".json").read_text())
    assert meta["width"] == 1940 and meta["cell_m"] == 960.0
    assert meta["lat"] == -90.0


@pytest.mark.data
@needs_lola
def test_write_all_manifest(tmp_path):
    manifest = json.loads(write_all(tmp_path).read_text())
    ids = {w["site_id"] for w in manifest["windows"]}
    assert {"shackleton_center", "im1_odysseus", "south_pole"} <= ids
    assert manifest["cap"]["file"] == "south_cap.u16"
    assert manifest["globe_texture"] == "lroc_color_2k.jpg"
```

Run: `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest tests/test_terrain3d.py -q`
Expected: collection error `No module named 'lunar_pipeline.terrain3d'`

- [ ] **Step 2: Implement**

`pipeline/lunar_pipeline/terrain3d.py`:

```python
"""Terrain rasters for the 3D view: per-site windows, the south cap, and the globe texture reference."""

from __future__ import annotations

import json
import shutil
import zlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import config
from .lola import LolaGrid
from .masks import load_grids
from .sites import Site, all_sites

TEXTURE_FILE = "lroc_color_2k.jpg"


def encode_u16(heights_m: np.ndarray) -> tuple[bytes, dict]:
    """Quantise metres to uint16 over [min, max] and zlib-compress (little-endian, row-major)."""
    finite = np.isfinite(heights_m)
    lo = float(heights_m[finite].min())
    hi = float(heights_m[finite].max())
    scale = (hi - lo) / 65535.0 if hi > lo else 1.0
    dn = np.zeros(heights_m.shape, dtype="<u2")
    dn[finite] = np.round((heights_m[finite] - lo) / scale).astype("<u2")
    return zlib.compress(dn.tobytes(), 6), {"min_m": lo, "max_m": hi, "scale_m_per_unit": scale}


def window_for_site(site: Site, grids: dict[str, LolaGrid]) -> tuple[LolaGrid, int, int, int]:
    """Grid and top-left pixel of the square window centred on the site (20 m/1024 px south of 87.55S, else 80 m/512 px)."""
    if site.lat <= -87.55:
        grid, size = grids["L0"], 1024
    else:
        grid, size = grids["L1"], 512
    col, row = grid.pixel_from_latlon(site.lat, site.lon)
    row0 = int(round(row)) - size // 2
    col0 = int(round(col)) - size // 2
    row0 = max(0, min(grid.label.lines - size, row0))
    col0 = max(0, min(grid.label.samples - size, col0))
    return grid, row0, col0, size


def _write_raster(path: Path, heights: np.ndarray, meta: dict) -> Path:
    payload, quant = encode_u16(heights)
    path.write_bytes(payload)
    doc = {**meta, **quant, "height": int(heights.shape[0]), "width": int(heights.shape[1]),
           "encoding": "zlib(uint16 little-endian, row-major); height_m = min_m + dn * scale_m_per_unit",
           "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    path.with_suffix(".json").write_text(json.dumps(doc, indent=1) + "\n")
    return path


def write_site_window(site: Site, grids: dict[str, LolaGrid], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    grid, row0, col0, size = window_for_site(site, grids)
    block = grid.data[row0 : row0 + size, col0 : col0 + size].astype(np.float64) * grid.label.scaling_factor
    site_h = float(grid.value_at(site.lat, site.lon))
    meta = {"site_id": site.id, "lat": site.lat, "lon": site.lon, "kind": "window",
            "source": f"{'ldem_875s_20m' if grid.label.map_scale_m == 20.0 else 'ldem_80s_80m'}.img",
            "level": "L0" if grid.label.map_scale_m == 20.0 else "L1", "cell_m": grid.label.map_scale_m,
            "row0": row0, "col0": col0, "site_height_m": site_h,
            "line_offset_px": grid.label.line_offset_px, "sample_offset_px": grid.label.sample_offset_px}
    return _write_raster(out_dir / f"{site.id}.u16", block, meta)


def write_south_cap(out_dir: Path, factor: int = 4) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    grid = LolaGrid.from_pds(config.LOLA_DIR / "ldem_60s_240m.lbl", mmap=False)
    n = grid.label.lines // factor * factor
    block = grid.data[:n, :n].astype(np.float64).reshape(n // factor, factor, n // factor, factor).mean(axis=(1, 3))
    block *= grid.label.scaling_factor
    meta = {"site_id": "south_cap", "lat": -90.0, "lon": 0.0, "kind": "cap", "source": "ldem_60s_240m.img",
            "level": "L2", "cell_m": grid.label.map_scale_m * factor, "row0": 0, "col0": 0, "site_height_m": 0.0,
            "line_offset_px": grid.label.line_offset_px / factor, "sample_offset_px": grid.label.sample_offset_px / factor}
    return _write_raster(out_dir / "south_cap.u16", block, meta)


def write_all(out_dir: Path = config.OUT_DIR / "terrain") -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    grids = load_grids()
    windows = []
    for site in all_sites():
        if not site.polar:
            continue
        path = write_site_window(site, grids, out_dir)
        windows.append({"site_id": site.id, "file": path.name, "meta": path.with_suffix(".json").name})
    cap = write_south_cap(out_dir)
    texture = config.RAW_DIR / "textures" / TEXTURE_FILE
    if texture.exists():
        shutil.copy2(texture, out_dir / TEXTURE_FILE)
    manifest = {"version": 1, "windows": windows, "cap": {"file": cap.name, "meta": cap.with_suffix(".json").name},
                "globe_texture": TEXTURE_FILE, "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    path = out_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=1) + "\n")
    return path
```

`fetch.py`: add `SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"` and in `assets()` append `Asset("lroc_color_2k.jpg", SVS + "lroc_color_2k.jpg", config.RAW_DIR / "textures", "textures")`; add `"textures"` to the CLI `--group` choices. Extend `test_fetch.py::test_manifest_lists_required_files` group set to include `"textures"`.

`sync_local.py`: when `tiles=True`, also `copytree(config.OUT_DIR / "terrain", web_data / "terrain")` if it exists.

`cli.py`: add `sub.add_parser("terrain", help="cut 3D terrain rasters into data_out/terrain")` and dispatch `from .terrain3d import write_all; print(write_all())`; extend `test_cli.py` subcommand list with `"terrain"`.

`docs/data-credits.md`: add a row: NASA SVS CGI Moon Kit (`lroc_color_2k.jpg`, LRO LROC WAC colour mosaic, NASA's Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720) — used as the globe texture.

- [ ] **Step 3: Run tests, generate artifacts**

Run: `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest tests/test_terrain3d.py tests/test_fetch.py tests/test_cli.py -q`
Expected: all pass (5 + 7 + 2).

Run:
```bash
uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline python -m lunar_pipeline.cli fetch --group textures
uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline python -m lunar_pipeline.cli terrain
uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline python -m lunar_pipeline.cli sync-local --tiles
```
Expected: `data_out/terrain/` with 7 windows (`*.u16` + `.json`), `south_cap.u16` (~5 MB), `lroc_color_2k.jpg`, `manifest.json`; copied to `web/public/data/terrain/`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/ docs/data-credits.md
git commit -m "feat(pipeline): terrain windows, south cap raster and globe texture for the 3D view"
```

---

### Task 2: Web — frame conversions and Sun/Earth direction helpers

**Files:**
- Create: `web/src/lib/viz/three-frames.ts`, `web/src/lib/viz/three-frames.test.ts`

**Interfaces:**
- `moonToThree(v: ArrayLike<number>): [number, number, number]` = `[v[0], v[2], -v[1]]`; `localToThree(east, north, up): [x, y, z]` = `[east, up, -north]`; `dirFromAzEl(azDeg, elDeg): [x, y, z]` (unit vector in local Three frame); `sunLight(elDeg, skylineDeg): { intensity: number; castShadow: boolean }` (0 below the skyline, ramps to 1 over the first 0.5° above, casts shadows only when above); `latLonToSphere(lat, lon, r = 1): [x, y, z]` (Three coords on the globe); `sphereToLatLon(p): { lat; lon }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { dirFromAzEl, latLonToSphere, localToThree, moonToThree, sphereToLatLon, sunLight } from './three-frames';

describe('three frames', () => {
  it('moonToThree is a right-handed rotation with the lunar north pole up', () => {
    expect(moonToThree([0, 0, 1])).toEqual([0, 1, -0]);
    expect(moonToThree([1, 0, 0])).toEqual([1, 0, -0]);
    const [ax, ay, az] = moonToThree([1, 0, 0]);
    const [bx, by, bz] = moonToThree([0, 1, 0]);
    const cross = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    expect(cross).toEqual(moonToThree([0, 0, 1]));
  });
  it('local frame: east +x, up +y, north -z', () => {
    expect(localToThree(1, 0, 0)).toEqual([1, 0, -0]);
    expect(localToThree(0, 1, 0)).toEqual([0, 0, -1]);
    expect(localToThree(0, 0, 1)).toEqual([0, 1, -0]);
    expect(dirFromAzEl(0, 0)).toEqual([expect.closeTo(0, 12), expect.closeTo(0, 12), -1]);
    expect(dirFromAzEl(90, 0)).toEqual([1, expect.closeTo(0, 12), expect.closeTo(-0, 12)]);
    expect(dirFromAzEl(0, 90)).toEqual([expect.closeTo(0, 12), 1, expect.closeTo(-0, 12)]);
  });
  it('sunLight returns intensity 0 below the skyline and ramps above it', () => {
    expect(sunLight(-1, 0.5)).toEqual({ intensity: 0, castShadow: false });
    expect(sunLight(0.75, 0.5).intensity).toBeCloseTo(0.5, 9);
    expect(sunLight(2, 0.5)).toEqual({ intensity: 1, castShadow: true });
  });
  it('globe mapping round-trips and puts the south pole at -y', () => {
    expect(latLonToSphere(-90, 0)).toEqual([expect.closeTo(0, 12), -1, expect.closeTo(0, 12)]);
    expect(latLonToSphere(0, 0)).toEqual([1, expect.closeTo(0, 12), expect.closeTo(-0, 12)]);
    const p = latLonToSphere(-85.5, 123.4);
    const back = sphereToLatLon(p);
    expect(back.lat).toBeCloseTo(-85.5, 9);
    expect(back.lon).toBeCloseTo(123.4, 9);
  });
});
```

- [ ] **Step 2: Implement**

```ts
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function moonToThree(v: ArrayLike<number>): [number, number, number] {
  return [v[0], v[2], -v[1]];
}

export function localToThree(east: number, north: number, up: number): [number, number, number] {
  return [east, up, -north];
}

export function dirFromAzEl(azDeg: number, elDeg: number): [number, number, number] {
  const az = azDeg * DEG, el = elDeg * DEG;
  return localToThree(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el));
}

/** Direct sunlight fades in over the first half degree above the terrain skyline. */
export function sunLight(elDeg: number, skylineDeg: number): { intensity: number; castShadow: boolean } {
  const above = elDeg - skylineDeg;
  if (above <= 0) return { intensity: 0, castShadow: false };
  return { intensity: Math.min(1, above / 0.5), castShadow: true };
}

export function latLonToSphere(latDeg: number, lonDeg: number, r = 1): [number, number, number] {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  return moonToThree([r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]);
}

export function sphereToLatLon(p: ArrayLike<number>): { lat: number; lon: number } {
  const x = p[0], y = -p[2], z = p[1]; // inverse of moonToThree
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(z / r) * RAD, lon: Math.atan2(y, x) * RAD };
}
```

Run: `cd web && npx vitest run src/lib/viz/three-frames.test.ts` — Expected `4 passed`. Commit: `feat(web): Three.js frame conversions for lunar and local coordinates`.

---

### Task 3: Web — heightmap loading and terrain geometry

**Files:**
- Create: `web/src/lib/data/terrain.ts`, `web/src/lib/viz/terrain-mesh.ts`, `web/src/lib/viz/terrain-mesh.test.ts`, `web/src/lib/data/terrain.test.ts`

**Interfaces:**
- `terrain.ts`: `interface HeightmapMeta { site_id; lat; lon; kind: 'window' | 'cap'; level; cell_m; width; height; row0; col0; min_m; max_m; scale_m_per_unit; site_height_m; line_offset_px; sample_offset_px }`; `interface Heightmap { meta: HeightmapMeta; heightsM: Float32Array }`; `decodeHeightmap(bytes: Uint8Array, meta): Float32Array` (reuses `DecompressionStream('deflate')` like tiles); `loadTerrainManifest(base)`; `loadHeightmap(base, file, metaFile): Promise<Heightmap>`; `windowFileFor(manifest, siteId): { file; meta } | null`; `pixelToLatLon(meta, col, row)` (uses the sidecar offsets + `psSouthLatLon`).
- `terrain-mesh.ts`: `buildTerrainGeometry(hm: Heightmap, opts: { segments?: number; exaggeration?: number; relativeTo?: number }): { positions: Float32Array; normals: Float32Array; indices: Uint32Array; uv: Float32Array; sizeKm: number }` — resamples the raster to `segments+1` vertices per side (default 256), centre at origin, +x east, −z north, +y up, units km, heights relative to `relativeTo` (site height) times exaggeration; normals by central differences.

- [ ] **Step 1: Failing tests** — `terrain-mesh.test.ts`: a 3×3 synthetic heightmap (cell 1000 m, heights 0 except centre +1000 m) → geometry with `segments = 2` has 9 vertices, centre vertex y = 1 km (× exaggeration 3 → 3), corner x = ±1 km, z sign check (north row → −z), normals unit length, indices 24; `terrain.test.ts`: `decodeHeightmap` round-trips a zlib'd uint16 array produced with `node:zlib` (`deflateSync`); `pixelToLatLon` of the window centre returns the site lat/lon for a real sidecar if `web/public/data/terrain/manifest.json` exists (skip otherwise).
- [ ] **Step 2: Implement** both modules (geometry loops in typed arrays; UV 0..1; index buffer for `segments²` quads × 2 triangles).
- [ ] **Step 3: Run**: `cd web && npx vitest run src/lib/viz/terrain-mesh.test.ts src/lib/data/terrain.test.ts` — Expected `5 passed` (or 4 + 1 skipped without synced terrain). Commit: `feat(web): heightmap loading and terrain geometry builder`.

---

### Task 4: Web — Sun light and scene props from the store

**Files:**
- Create: `web/src/lib/viz/scene-state.ts`, `web/src/lib/viz/scene-state.test.ts`

**Interfaces:**
- `sceneStateAt(eph: Ephemeris, series: Series, mask: ArrayLike<number>, cursor: number, site: { lat; lon }): SceneState` where `SceneState = { sunDirLocal: [x,y,z]; earthDirLocal; sunDirMoon: [x,y,z] (Three coords, unit); earthDirMoon; sunEl; sunAz; earthEl; earthAz; skylineAtSun; skylineAtEarth; light: { intensity; castShadow }; earthVisible: boolean }` — uses `rowVectors(eph, series.i0 + cursor)` for the MOON_ME directions and the series az/el for local directions.

- [ ] Tests: with the real ephemeris + a flat mask, at some cursor the local Sun direction from `dirFromAzEl(sunAz, sunEl)` has unit length and its up-component equals `sin(sunEl)`; `sunLight` used correctly (`intensity 0` when the mask is raised above the Sun); `earthVisible` matches `series.earthVisible[cursor]`; the Moon-frame Sun direction dotted with the site's Three-space up vector equals `sin(sunEl)` within 0.3° (consistency between global and local frames — pins `moonToThree` against the engine). Commit: `feat(web): scene state (Sun and Earth directions, lighting) from the store`.

---

### Task 5: Web — Scene3D with globe mode

**Files:**
- Create: `web/src/components/three/Scene3D.tsx` (dynamic wrapper `Scene3DLazy` exported from `web/src/components/three/index.ts` using `next/dynamic` with `ssr: false` and a `loading` panel), `web/src/components/three/Globe.tsx`, `web/src/components/three/SunAndEarth.tsx`, `web/src/components/three/cameraPresets.ts` (+ test), `web/src/components/three/Scene3D.test.tsx` (jsdom: WebGL unavailable → fallback)
- Modify: `web/package.json` (three, @react-three/fiber, @react-three/drei, @types/three)

**Interfaces:**
- `<Scene3D mode="globe" | "terrain" scene={SceneState} site={Site} sites={Site[]} heightmap={Heightmap | null} capHeightmap={Heightmap | null} exaggeration={1|3} onPick={(lat, lon) => void} />`; `cameraPresetFor(mode, site, reducedMotion): { position: [x,y,z]; target: [x,y,z]; durationMs: number }` (globe: 3.2 units away looking at the south pole tilted 35°; terrain: 18 km south-east of the site at 8 km height looking at the origin; durationMs 0 under reduced motion).
- Globe: `Stars` (drei), sphere r=1 with `useTexture('/data/terrain/lroc_color_2k.jpg')` (texture `colorSpace = SRGBColorSpace`), rotation so that lon 0 faces +x (`latLonToSphere` mapping: set `sphereGeometry` then rotate the mesh by −90° around y if needed — verify by placing a pin at (0,0) and checking it lands on the texture's centre meridian in the screenshot); site pins as small spheres at `latLonToSphere(lat, lon, 1.005)`; selected pin brighter; `onPointerDown` on the sphere → `sphereToLatLon(point)` → `onPick`.
- SunAndEarth: `directionalLight` at `sunDirMoon × 10` with intensity from `scene.light` (globe mode always 1 — the globe shows the terminator), a small emissive sphere at `sunDirMoon × 4`, Earth as `sphere r=0.12` at `earthDirMoon × 6` with an `Html` label "Earth".
- WebGL check: `Scene3D` calls `canvas.getContext('webgl2') ?? getContext('webgl')` on a probe canvas in an effect; when null renders `<div role="status">3D view is not available on this device…</div>`.

- [ ] Tests: `cameraPresets.test.ts` (durations, reduced motion → 0, terrain preset above ground); `Scene3D.test.tsx` renders the fallback in jsdom (no WebGL). Visual: dev server + Playwright screenshot of `/explore` in globe mode showing the textured Moon, the south pole tilted toward the camera, pins, Sun/Earth markers. Commit: `feat(web): 3D globe with site pins and Sun/Earth directions`.

---

### Task 6: Web — polar terrain mode with real-time shadows

**Files:**
- Create: `web/src/components/three/Terrain.tsx`, `web/src/components/three/SiteMarker.tsx`
- Modify: `Scene3D.tsx` (terrain mode), `web/src/lib/store/explore.ts` (add `mode: 'globe' | 'terrain'`, `exaggeration: 1 | 3`, `heightmap`, `capHeightmap`, loaders for terrain; `selectSite`/`applyMask` load the site window when available), `web/src/lib/store/explore.test.ts` (new cases)

**Interfaces:**
- Terrain: `<mesh geometry from buildTerrainGeometry(heightmap, { segments: 256, exaggeration, relativeTo: site_height_m })>` with `MeshStandardMaterial({ color: '#8a857c', roughness: 1, metalness: 0 })`, `receiveShadow`, `castShadow`; `directionalLight` at `sunDirLocal × 60` km with `castShadow`, shadow camera orthographic covering ±12 km (window) or ±1000 km (cap), `shadow.mapSize 2048`, `shadow.bias -0.0005`; `ambientLight 0.08`; `hemisphereLight` off; fog none; a thin ring on the ground at the skyline azimuths is not needed (the dome shows it).
- Custom site without a window: use the cap heightmap re-centred: `buildTerrainGeometry(cap, { relativeTo: cap height at site, centre: pixel of the site })` — implement `centerOn` option in `buildTerrainGeometry` (Task 3 helper extended here with a test).
- Store: `mode` defaults to `'terrain'` for featured polar sites; `setMode`, `setExaggeration`; `heightmap` loaded via `loadHeightmap` when the manifest lists the site, else null (Review Focus 2).

- [ ] Tests: store `selectSite loads the terrain window when listed` and `custom site without a window falls back to the cap` (file-backed loaders); geometry `centerOn` test. Visual: screenshot at cursor hours where the Sun is up and down (shadows long, then gone). Commit: `feat(web): polar terrain with real-time Sun shadows driven by the scrubber`.

---

### Task 7: Explore layout with the 3D hero, mode toggle, globe picking

**Files:**
- Modify: `web/src/components/ExploreView.tsx` (layout: left 3D panel with Globe/Terrain segmented control + exaggeration toggle; right column: SkyDome at `max-w-[320px]` + SummaryTiles; bottom: Timeline + readout), `web/src/components/ExploreView.test.tsx` (data-missing state still passes; new test: globe pick north of 60°S shows the refusal message and keeps the site)
- Modify: `web/src/components/SiteSelect.tsx` (custom form pre-fills from a globe pick)

- [ ] Tests + gates: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Visual critique: two screenshots (globe mode, terrain mode with shadows) at 1360×900 and one at 1024×900; check that the 3D panel is the hero, the dome still reads, and the timeline fits. Commit: `feat(web): Explore layout with 3D hero view, mode toggle and globe site picking`.

---

## Self-review notes

- Spec coverage: §2 hero moment (Task 6 + 7: drag the scrubber → shadows sweep), §3 "3D globe + polar terrain: time-driven real shadows, site pins, fly-to" (Tasks 5–7), §4 layout (Task 7), §5.4 (CGI Moon Kit colour, LOLA heightmaps, directional light = Sun vector, shadow maps, LOD toggle = exaggeration/segments, Earth sprite) — Moon Trek tiles for the polar map are deferred (the cap heightmap serves as the map).
- Downloads: 447 KB. The 4K colour (62 MB) and 16 ppd displacement (33 MB) are optional upgrades gated on the user's go.
- Risk: no dedicated GPU on the dev machine; keep segments at 256 and shadow map 2048; test in Playwright's Chromium (SwiftShader) for correctness, not speed.
