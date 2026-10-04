# Immersive part B: the arrival and the home journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The home page's first screen becomes the Moon seen from space, lit by the real Sun for 1 January 2027 10:00 UTC with Earth beyond, and scrolling (or "Explore a landing site") flies down in four beats (the Moon, the pole, the ridge, standing) to part A's view at de Gerlache Rim 2, where Explore's answer for the site waits with its two actions; the stand view gains the month's Sun and Earth paths and the words both readers of read 12 asked for.

**Architecture:** The pipeline resamples NASA's CGI Moon Kit (the colour map with its poles filled, and LOLA heights at 16 pixels a degree) into a small globe set (colour and normal maps at 1K and 4K, heights at 4 pixels a degree) and adds the hero month's Sun distance, Earth distance, skyline and site height to `home.json`. The stand scene learns to fly: a globe mesh (the same regolith light, the engine's shadow rule over the globe's heights) sits round the measured ground in the site's frame, the sky travels with the camera, and the camera takes a pose from a pure flight-path module whose keyframes are built from the real Sun and Earth. A client `Arrival` section on the home page maps scroll (or a 15-second play) to the flight's progress and keeps its sentences as page text; a lazily loaded canvas draws it, with captured stills for the first paint, reduced motion and browsers without WebGL 2.

**Tech Stack:** Next.js 16 App Router (`next/dynamic` with `ssr: false` inside a client component), React 19, TypeScript, three 0.186 (plain, with the stand view's composer), zustand (stand view only), vitest 5 + Testing Library (jsdom for components, node for maths); Python 3.12 pipeline with NumPy and rasterio (GDAL) for the textures.

**Spec:** `docs/superpowers/specs/2026-10-02-immersive-space-design.md`: section 5 (part B), sections 1, 2, 3.1, 3.2, 7 to 9, and the asks section 13.3 carries to part B (13.2's ruling: part B's reads add a recorded walk). The C++ core (3.4) is not part of this plan.

## Global Constraints

- Nothing in this work changes a computed number; every figure on screen is the engine's or the pipeline's reference figure, and a test says the two agree for the hero month.
- Every body drawn is placed by a tested function: the globe by the site's east, north and up in MOON_ME (the frame the ephemeris uses); the Sun and Earth by the hour's series; Earth from a camera away from the site by its direction from the site and its distance.
- Shadows by the engine's rule (the steepest rise of the ground towards the Sun against the Sun's elevation, the Sun's 0.53° disc for the penumbra), never GPU shadow maps: the measured ground as in part A, the globe beyond it over the globe's own heights, with a TypeScript twin of the globe's rule under test.
- Plain words on screen; instrument and programme names only in credits and the note on what is measured and drawn.
- One gold action per screen; gold is the Sun, blue is Earth, green and red the power verdict.
- No text under 14 px, controls at least 40 px tall, standalone links underlined; reduced motion: no camera flights, no auto-turning, no sweep and no automatic scrolling: the arrival becomes still frames.
- The arrival never blocks reading: its sentences are text in the page, in order (the headline, the three beats, the answer and its two actions), present without JavaScript.
- A "Skip" button is always visible while the arrival plays or is part-way scrolled.
- Offline: every new asset is in the data mirror (`web/public/data/globe`, copied by `sync-local --tiles`) and goes to R2 with `publish-r2`; the Moon textures stay under 15 MB.
- The development laptop (Intel UHD 620) is not a performance target; `?quality=fast` lightens the home page's view too.
- Every behaviour change starts with a failing test; gates from `web/`: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; from `pipeline/`: `uv run pytest -q`.
- Never read, print or copy `web/.env.local`; no calls to OpenRouter or other paid APIs in tests or reviews; ask before any download over about 100 MB (this plan's two downloads total 44 MB).

## Review Focus

1. Data arriving late or not at all (a slow link; the globe or terrain files missing from the mirror, as with an R2 upload made before this plan): the first screen shows its still, scrolling shows the stills beat by beat, and the live view takes over when it can, never a black or frozen stage. Tests in Task 6 (a failed loader calls `onFail`; the stills follow the beat; the ground failing leaves the globe flying).
2. Scrolling backwards or fast through the arrival (wheel flicks, the scrollbar dragged, Page Down, Home): the camera follows the scroll both ways with no jump, and the month's sweep runs backwards. Tests in Task 5 (the pose is continuous across every stop, both ways) and Task 6 (progress from scroll at any position).
3. Resizing the window or turning a phone mid-arrival: the keyframes are rebuilt for the new shape and the beat holds. Test in Task 6 (a new aspect gives a new pose at the same progress).
4. Leaving the home page and coming back by client navigation, several times: each visit's renderer is disposed and gives its WebGL context back. Tests in Task 6 (unmount disposes) and Task 4 (dispose frees the composer's passes and forces the context loss; checked in the browser at Task 7).
5. Play started, then the visitor scrolls, presses a key or Skip: the automatic scroll stops at once and never fights the visitor. Test in Task 6.

## The asks carried from part A (spec 13.3)

Taken here, as the arrival ends in the stand view and part B's read judges it: the month's Sun and Earth paths in the scene with the flags' days marked, a ring on a hidden body and the level horizon (Task 8); captions of two lines at most, the pole first among the reasons with a way to read them all, Earth's rise and the lack of twilight said where they happen, the battery's level (Task 9). Left, each to be ledgered as a ruling when this plan starts: one name for the dark stretch, the phone's card and a classroom mode with larger type go to part C (the words and the type across the app, with the whole app's read); comparing days or sites inside the view stays out (Compare does it; a new feature, not in section 5 or 6); finer models (lander, shadow, rocks, near craters) wait for part B's read to name them again.

## File map

| File | Responsibility |
|---|---|
| `pipeline/lunar_pipeline/globe.py`, `pipeline/tests/test_globe.py` | the CGI Moon Kit resampled: colour and normal maps at 1K and 4K, heights at 4 px/deg, manifest |
| `pipeline/lunar_pipeline/fetch.py`, `cli.py`, `sync_local.py` | the `globe` fetch group and command; the mirror copy |
| `pipeline/lunar_pipeline/home_assets.py`, `pipeline/tests/test_home_assets.py` | the hero month's Sun and Earth distances, skyline, site height and best landing's Earth share in `home.json` |
| `web/src/lib/data/home.ts`, `home.json` | the hero month as the engine's `Series`; the skyline |
| `web/src/lib/viz/arrival.ts` | the hero (site, series, power, skyline, heights) and the arrival's words |
| `web/src/lib/data/globe.ts` | loading the globe set |
| `web/src/lib/sky/textureCache.ts` | one texture per address for the page's life, kept through scene rebuilds |
| `web/src/lib/sky/globe.ts` | the globe's mesh, frame, shader and the twin of its shadow rule |
| `web/src/lib/sky/arrivalTiming.ts` | the flight's timing without three.js (so the home page's first bundle stays small): stops, the sweep, scroll and play |
| `web/src/lib/sky/arrivalPath.ts` | the flight: keyframes from the real Sun and Earth, the pose at any progress |
| `web/src/lib/sky/standRenderer.ts`, `shaders.ts` | flight (pose, sky round the camera, far cut, the globe), scene swaps, projection, guides |
| `web/src/lib/data/terrain.ts` | a wider cap crop on request |
| `web/src/lib/viz/standOpening.ts` | where the lander stands and where the view opens (shared by the stand view and the arrival) |
| `web/src/components/home/Arrival.tsx`, `ArrivalCanvas.tsx` | the arrival section and its live stage |
| `web/src/app/page.tsx` | the home page with the arrival |
| `web/src/lib/viz/stand.ts`, `web/src/components/stand/StandView.tsx`, `StandCanvas.tsx` | the paths' marks, the words (captions, reasons, battery) |
| `web/public/arrival/*.jpg` | the stills, wide and tall, for each beat |

## Execution

Native execution (superpowers:executing-plans) with parallel subagents for independent tasks, as the user asked ("subagent any tasks that can be run in parallel"):

- Wave A, in parallel: Task 1 (pipeline globe), Task 2 (the hero month), Task 5 (the flight path) and Task 9 (the stand view's words) go to subagents; the controller does Task 3, then Task 4 once Task 5 has landed (Task 4 imports Task 5's `Pose`).
- Wave B: Task 6 (the home page), then Task 8 (the paths), by the controller.
- Then Task 7 (the visual checkpoint, with the stills sent to the user as the mockup), Task 10 (the stills), Task 11 (documents, the blind reads, the final review, the pull request).

Subagents never read, print or copy `web/.env.local`, make no calls to paid APIs, commit only the files they changed (`git add <paths> && git commit`; on an `index.lock` error, wait a few seconds and retry), and report the commit hashes and their test runs.

---

### Task 1: The Moon from space, from the pipeline

**Files:**
- Create: `pipeline/lunar_pipeline/globe.py`, `pipeline/tests/test_globe.py`
- Modify: `pipeline/lunar_pipeline/fetch.py` (group `globe`), `pipeline/lunar_pipeline/cli.py` (`fetch --group globe`, command `globe`), `pipeline/lunar_pipeline/sync_local.py` (copy `data_out/globe` with `--tiles`), `pipeline/README.md` (the command)
- Output (git-ignored mirror): `data_out/globe/{moon_color_1k.jpg, moon_color_4k.jpg, moon_normal_1k.jpg, moon_normal_4k.jpg, moon_heights_1440.u16, moon_heights_1440.json, manifest.json}`, copied to `web/public/data/globe/`

**Interfaces:**
- Produces: `data_out/globe/manifest.json` = `{ version: 1, color: { "1k", "4k" }, normal: { "1k", "4k" }, heights: { file, meta }, albedo_scale, radius_m, layout, normal_encoding, heights_reference, sources, credit, generated_utc }`; the heights sidecar `{ width: 1440, height: 720, min_m, max_m, scale_m_per_unit, encoding, bytes }` in the terrain rasters' encoding (`decodeHeightmap` reads it). Maps are equirectangular: longitude −180 to 180 left to right, latitude 90 to −90 top to bottom, pixel centres. Normal map rgb = (n + 1)/2 for n = (east, north, up).

- [ ] **Step 1: Write the failing tests** (`pipeline/tests/test_globe.py`)

```python
import json
import zlib

import numpy as np
import pytest

from lunar_pipeline import config, globe
from lunar_pipeline.cli import build_parser
from lunar_pipeline.fetch import assets


def test_heights_from_dn_are_metres_above_the_reference_sphere():
    # ldem_*_uint: half-metres above 1727.4 km; the reference sphere is 1737.4 km.
    assert globe.heights_from_dn(np.array([20000, 0])) == pytest.approx([0.0, -10000.0])


def test_normal_map_points_up_on_level_ground_and_away_from_a_rise():
    flat = globe.normal_map(np.zeros((90, 180)))
    assert (flat[..., 0] == 128).all() and (flat[..., 1] == 128).all() and (flat[..., 2] == 255).all()
    # A rise of 1 in 2 to the east at the equator: n = (-0.447, 0, 0.894), so red = (1 - 0.447) * 127.5.
    east_m = config.R_MOON_M * 2 * np.pi / 180
    ramp = np.tile(np.arange(180) * 0.5 * east_m, (90, 1))
    assert globe.normal_map(ramp)[45, 90, 0] == pytest.approx(70.5, abs=1.5)
    # A rise of 1 in 2 to the north tips it south: green falls the same way.
    north_m = config.R_MOON_M * np.pi / 90
    north = np.tile((np.arange(90)[::-1] * 0.5 * north_m)[:, None], (1, 180))
    assert globe.normal_map(north)[45, 90, 1] == pytest.approx(70.5, abs=1.5)


def test_normal_map_keeps_the_polar_rows_calm():
    # 50 m of noise: near the poles a degree of longitude is a few hundred metres, so without a floor on the
    # east spacing the first and last rows would tilt by several degrees.
    n = globe.normal_map(np.random.default_rng(1).normal(0, 50, (90, 180))).astype(float) / 127.5 - 1.0
    assert np.isfinite(n).all()
    assert np.abs(n[[0, -1], :, 0]).max() < 0.02


def test_albedo_scale_brings_the_south_cap_to_the_regolith_albedo():
    rgb = np.full((180, 360, 3), 200, dtype=np.uint8)
    rgb[-20:] = 120  # rows 160 to 179: every row south of 80 S is 120
    expected = 0.17 / globe.srgb_to_linear(np.array([120]))[0]
    assert globe.albedo_scale(rgb) == pytest.approx(expected, rel=1e-3)


def _tif(path, data):
    import rasterio

    bands = data[None] if data.ndim == 2 else np.moveaxis(data, -1, 0)
    with rasterio.open(path, "w", driver="GTiff", width=bands.shape[2], height=bands.shape[1], count=bands.shape[0], dtype=bands.dtype) as dst:
        dst.write(bands)


def test_build_writes_the_maps_the_heights_and_the_manifest(tmp_path, monkeypatch):
    raw, out = tmp_path / "raw", tmp_path / "out"
    raw.mkdir()
    _tif(raw / globe.COLOR_SRC, np.full((256, 512, 3), 150, dtype=np.uint8))
    _tif(raw / globe.LDEM_SRC, np.full((360, 720), 20000, dtype=np.uint16))
    monkeypatch.setattr(globe, "SIZES", {"1k": (64, 128), "4k": (128, 256)})
    monkeypatch.setattr(globe, "HEIGHTS_SHAPE", (90, 180))
    m = json.loads(globe.build(raw, out).read_text())
    assert m["color"] == {"1k": "moon_color_1k.jpg", "4k": "moon_color_4k.jpg"}
    assert m["normal"] == {"1k": "moon_normal_1k.jpg", "4k": "moon_normal_4k.jpg"}
    assert m["albedo_scale"] > 0 and m["radius_m"] == config.R_MOON_M
    meta = json.loads((out / m["heights"]["meta"]).read_text())
    dn = np.frombuffer(zlib.decompress((out / m["heights"]["file"]).read_bytes()), dtype="<u2")
    assert (meta["width"], meta["height"]) == (180, 90) and dn.size == 180 * 90
    assert meta["min_m"] == pytest.approx(0.0, abs=1e-6)
    import rasterio

    with rasterio.open(out / "moon_color_4k.jpg") as ds:
        assert (ds.width, ds.height, ds.count) == (256, 128, 3)
    assert not list(out.glob("*.aux.xml"))


def test_fetch_and_the_command_line_know_the_globe():
    found = [a for a in assets() if a.group == "globe"]
    assert {a.name for a in found} == {globe.COLOR_SRC, globe.LDEM_SRC}
    assert all(a.url == globe.SVS + a.name and a.dest_dir == globe.RAW for a in found)
    assert build_parser().parse_args(["globe"]).cmd == "globe"
    assert build_parser().parse_args(["fetch", "--group", "globe"]).group == ["globe"]
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pipeline && uv run pytest tests/test_globe.py -q`
Expected: FAIL, `ImportError: cannot import name 'globe'`.

- [ ] **Step 3: Write `pipeline/lunar_pipeline/globe.py`**

```python
"""The Moon from space for the home page's arrival: NASA's CGI Moon Kit colour map (the 2019 version, whose
poles are filled) and LOLA's heights at 16 pixels a degree, resampled for the web.

- moon_color_1k.jpg, moon_color_4k.jpg: the colour map at 1024 x 512 and 4096 x 2048.
- moon_normal_1k.jpg, moon_normal_4k.jpg: the slope of the ground as a normal map at the same sizes,
  rgb = (n + 1) / 2 for the unit normal n = (east, north, up).
- moon_heights_1440.u16 (+ .json): heights at 4 pixels a degree, metres above the 1737.4 km sphere, in the
  terrain rasters' encoding, for the globe's outline and its long shadows.
- manifest.json: the files, their layout, the albedo scale that brings the south cap's mean brightness to
  the stand view's regolith albedo, and the credit.

Every map is equirectangular: longitude -180 to 180 left to right, latitude 90 to -90 top to bottom.
"""

from __future__ import annotations

import json
import warnings
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from . import config
from .terrain3d import ENCODING, encode_u16

SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
COLOR_SRC = "lroc_color_poles_4k.tif"  # 4096 x 2048, 12.5 MB: the 2019 colour map, its poles filled
LDEM_SRC = "ldem_16_uint.tif"  # 5760 x 2880, 31.7 MB: half-metres above 1727.4 km
RAW = config.RAW_DIR / "globe"
OUT = config.OUT_DIR / "globe"
LDEM_BASE_M = 1727400.0
REGOLITH_ALBEDO = 0.17  # the stand view's ground (GROUND_FRAG): the globe matches it round the south pole
CAP_LAT_DEG = -80.0
SIZES = {"1k": (512, 1024), "4k": (2048, 4096)}  # rows, columns
HEIGHTS_SHAPE = (720, 1440)
CREDIT = (
    "NASA's Scientific Visualization Studio, CGI Moon Kit (LRO LROC WAC colour mosaic with the poles filled; "
    "LOLA elevation), https://svs.gsfc.nasa.gov/4720"
)


def lat_of_rows(n_rows: int) -> np.ndarray:
    """Latitude (degrees) of each row's centre, north first."""
    return 90.0 - (np.arange(n_rows) + 0.5) * 180.0 / n_rows


def heights_from_dn(dn: np.ndarray) -> np.ndarray:
    """ldem_*_uint values (half-metres above 1727.4 km) as metres above the 1737.4 km sphere."""
    return np.asarray(dn, dtype=np.float64) * 0.5 + LDEM_BASE_M - config.R_MOON_M


def normal_map(heights_m: np.ndarray) -> np.ndarray:
    """(rows, cols, 3) uint8 normal map of an equirectangular height grid: rgb = (n + 1) / 2 * 255.

    Slopes by central differences, wrapping in longitude; a row's east spacing never falls below its north
    spacing, so the rows at the poles, where a degree of longitude shrinks to nothing, stay calm.
    """
    h = np.asarray(heights_m, dtype=np.float64)
    n_rows, n_cols = h.shape
    north_m = config.R_MOON_M * np.pi / n_rows
    east_m = np.maximum(config.R_MOON_M * np.cos(np.radians(lat_of_rows(n_rows))) * 2.0 * np.pi / n_cols, north_m)[:, None]
    to_north = np.vstack([h[:1], h[:-1]])  # each row's northern neighbour (the first row stands in for its own)
    to_south = np.vstack([h[1:], h[-1:]])
    rows_apart = np.full((n_rows, 1), 2.0)
    rows_apart[0] = rows_apart[-1] = 1.0
    s_north = (to_north - to_south) / (rows_apart * north_m)
    s_east = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2.0 * east_m)
    n = np.stack([-s_east, -s_north, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(np.round((n + 1.0) * 127.5), 0, 255).astype(np.uint8)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    v = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def albedo_scale(rgb_u8: np.ndarray, cap_lat_deg: float = CAP_LAT_DEG) -> float:
    """The factor that brings the mean linear brightness south of `cap_lat_deg` to the regolith albedo."""
    lin = srgb_to_linear(rgb_u8)
    lum = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    rows = lat_of_rows(rgb_u8.shape[0]) <= cap_lat_deg
    return round(REGOLITH_ALBEDO / float(lum[rows].mean()), 4)


def read_resampled(path: Path, shape: tuple[int, int], bands: int | None = None) -> np.ndarray:
    """A raster read at `shape` (rows, cols) by area averaging: (rows, cols) for one band, else (rows, cols, bands)."""
    import rasterio
    from rasterio.enums import Resampling

    with rasterio.open(path) as src:
        idx = list(range(1, (bands or 1) + 1))
        data = src.read(idx, out_shape=(len(idx), *shape), resampling=Resampling.average, out_dtype="float64")
    return data[0] if bands is None else np.moveaxis(data, 0, -1)


def write_rgb_jpeg(path: Path, rgb: np.ndarray, quality: int) -> Path:
    """An RGB JPEG through GDAL (rasterio); removes the sidecar GDAL writes next to it."""
    import rasterio

    path.parent.mkdir(parents=True, exist_ok=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # "Dataset has no geotransform": a picture, not a map product
        with rasterio.open(path, "w", driver="JPEG", width=rgb.shape[1], height=rgb.shape[0], count=3, dtype="uint8", QUALITY=quality) as dst:
            dst.write(np.moveaxis(rgb.astype(np.uint8), -1, 0))
    aux = Path(str(path) + ".aux.xml")
    if aux.exists():
        aux.unlink()
    return path


def build(raw: Path = RAW, out: Path = OUT) -> Path:
    """Writes the arrival's Moon into `out` from the two sources in `raw`; returns the manifest's path."""
    out.mkdir(parents=True, exist_ok=True)
    files: dict[str, dict[str, str]] = {"color": {}, "normal": {}}
    scale = None
    for size, shape in SIZES.items():
        rgb = np.clip(np.round(read_resampled(raw / COLOR_SRC, shape, bands=3)), 0, 255).astype(np.uint8)
        files["color"][size] = write_rgb_jpeg(out / f"moon_color_{size}.jpg", rgb, 88).name
        if size == "1k":
            scale = albedo_scale(rgb)
        heights = heights_from_dn(read_resampled(raw / LDEM_SRC, shape))
        files["normal"][size] = write_rgb_jpeg(out / f"moon_normal_{size}.jpg", normal_map(heights), 92).name
    heights = heights_from_dn(read_resampled(raw / LDEM_SRC, HEIGHTS_SHAPE))
    payload, quant = encode_u16(heights)
    (out / "moon_heights_1440.u16").write_bytes(payload)
    meta = {"width": HEIGHTS_SHAPE[1], "height": HEIGHTS_SHAPE[0], **quant, "encoding": ENCODING, "bytes": len(payload)}
    (out / "moon_heights_1440.json").write_text(json.dumps(meta, indent=1) + "\n")
    manifest = {
        "version": 1,
        "color": files["color"],
        "normal": files["normal"],
        "heights": {"file": "moon_heights_1440.u16", "meta": "moon_heights_1440.json"},
        "albedo_scale": scale,
        "radius_m": config.R_MOON_M,
        "layout": "equirectangular: longitude -180 to 180 left to right, latitude 90 to -90 top to bottom, pixel centres",
        "normal_encoding": "rgb = (n + 1) / 2 for the unit normal n = (east, north, up)",
        "heights_reference": "metres above the 1737.4 km sphere",
        "sources": {"color": SVS + COLOR_SRC, "heights": SVS + LDEM_SRC},
        "credit": CREDIT,
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    path = out / "manifest.json"
    path.write_text(json.dumps(manifest, indent=1) + "\n")
    return path
```

`fetch.py`: `from .globe import COLOR_SRC, LDEM_SRC, RAW as GLOBE_RAW, SVS as GLOBE_SVS` (no import cycle: `globe` imports only `config` and `terrain3d`), and in `assets()`:

```python
    for name in (COLOR_SRC, LDEM_SRC):
        out.append(Asset(name, GLOBE_SVS + name, GLOBE_RAW, "globe"))
```

`cli.py`: add `"globe"` to the `fetch --group` choices; `sub.add_parser("globe", help="resample the CGI Moon Kit into data_out/globe for the home page's arrival")`; in `main`: `elif args.cmd == "globe": from . import globe; print(globe.build())`.

`sync_local.py`, inside `if tiles:` after the terrain copy:

```python
        globe = config.OUT_DIR / "globe"
        if globe.exists():  # the Moon from space for the home page's arrival (the globe command)
            shutil.copytree(globe, web_data / "globe", dirs_exist_ok=True)
            copied.append(web_data / "globe")
```

- [ ] **Step 4: Run them to see them pass, then the whole suite**

Run: `cd pipeline && uv run pytest tests/test_globe.py -q && uv run pytest -q`
Expected: 6 passed; then the whole suite passes (123 + 6). `git checkout -- data/fixtures/horizons/summary.json` if pytest rewrote its line endings.

- [ ] **Step 5: Fetch the two sources (44 MB) and build the set**

Run: `cd pipeline && uv run python -m lunar_pipeline.cli fetch --group globe && uv run python -m lunar_pipeline.cli globe && uv run python -m lunar_pipeline.cli sync-local --tiles`
Expected: `data_raw/globe/` holds 12.5 MB and 31.7 MB; `data_out/globe/manifest.json` printed; `web/public/data/globe/` holds the seven files, together under 15 MB (`du -sh web/public/data/globe`); `albedo_scale` between 0.2 and 1.5. Look at `moon_color_1k.jpg` and `moon_normal_1k.jpg`: the south pole filled (no smear), the normal map light blue with relief.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lunar_pipeline/globe.py pipeline/tests/test_globe.py pipeline/lunar_pipeline/fetch.py pipeline/lunar_pipeline/cli.py pipeline/lunar_pipeline/sync_local.py pipeline/README.md
git commit -m "feat(pipeline): the Moon from space for the arrival: CGI Moon Kit colour with the poles filled, a normal map and heights for the web"
```

### Task 2: The hero month for the arrival

**Files:**
- Modify: `pipeline/lunar_pipeline/home_assets.py`, `pipeline/tests/test_home_assets.py`, `web/src/lib/data/home.ts`, `web/src/lib/data/home.json` (regenerated), `web/src/lib/data/home.test.ts`
- Create: `web/src/lib/viz/arrival.ts`, `web/src/lib/viz/arrival.test.ts`

**Interfaces:**
- Produces: `home.json` gains `hero.site_height_m` (m), `sky.sun_au` (AU, 5 decimals), `sky.earth_km` (km, whole), `mask: { az0: 0, step: 0.5, el: number[720] }` (0.01°), `battery.best_earth_fraction` (4 decimals or null).
- Produces (web): `heroSeries(doc?: HomeDoc): Series`, `heroMask(doc?: HomeDoc): Float64Array` in `lib/data/home.ts`; in `lib/viz/arrival.ts`: `HERO_HOUR = 10`, `BEAT_SENTENCES: [string, string, string]`, `interface Hero { site: Site; series: Series; power: PowerResult; mask: Float64Array; siteHeightM: number; earthKm: number[]; startUtc: string; days: number }`, `hero(doc?: HomeDoc): Hero`, `interface ArrivalWords { beats: [string, string, string]; siteLine: string; answer: string; better: string | null; exploreHref: string }`, `arrivalWords(doc?: HomeDoc): ArrivalWords`.

- [ ] **Step 1: Write the failing pipeline tests** (in `pipeline/tests/test_home_assets.py`)

In `test_sky_series_carries_earth_against_the_hills_in_its_direction` add, after the existing asserts:

```python
    # The Sun's distance in AU and Earth's in km, hour by hour, for the arrival's light and Earth's place.
    assert sky["sun_au"] == pytest.approx([1.496e8 / 149_597_870.7] * 3, abs=1e-5)
    assert sky["earth_km"] == [384400, 384400, 384400]
```

Change the expected dicts of `test_battery_facts_give_the_time_with_power_now_and_on_the_best_day` to carry `"best_earth_fraction": 0.0` (lit series) and `"best_earth_fraction": None` (dark series), and add:

```python
def test_mask_block_gives_the_skyline_by_direction_to_a_hundredth_of_a_degree():
    from lunar_pipeline.home_assets import mask_block

    block = mask_block([1.234567] * 720)
    assert block["az0"] == 0.0 and block["step"] == 0.5 and len(block["el"]) == 720 and block["el"][0] == 1.23
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pipeline && uv run pytest tests/test_home_assets.py -q`
Expected: FAIL on `KeyError: 'sun_au'`, the battery dicts and `ImportError: mask_block`.

- [ ] **Step 3: Implement in `home_assets.py`**

In `sky_series`, add to the returned dict:

```python
        # The Sun's distance (AU) and Earth's (km), for the arrival's light and for Earth seen from space.
        "sun_au": [round(float(v), 5) for v in np.linalg.norm(rows[:, 0, :], axis=1) / config.AU_KM],
        "earth_km": [round(float(v)) for v in np.linalg.norm(rows[:, 1, :], axis=1)],
```

In `battery_facts`, add `"best_earth_fraction": round(float(best["earth_fraction"]), 4) if best else None`. Add:

```python
def mask_block(elevation_deg) -> dict:
    """The site's skyline for the arrival's standing view: directions from north, clockwise, to 0.01 degrees."""
    el = [round(float(v), 2) for v in elevation_deg]
    return {"az0": 0.0, "step": 360.0 / len(el), "el": el}
```

In `write_all`: `mask_doc = json.loads((config.DATA_DIR / "masks" / f"{site.id}.json").read_text(encoding="utf-8"))`; the hero dict gains `"site_height_m": round(float(mask_doc["site_height_m"]), 2)`; the doc gains `"mask": mask_block(mask_doc["elevation_deg"])`.

- [ ] **Step 4: Run them, regenerate `home.json`, run the whole suite**

Run: `cd pipeline && uv run pytest tests/test_home_assets.py -q && uv run python -m lunar_pipeline.cli home-assets && uv run pytest -q`
Expected: pass; `web/src/lib/data/home.json` gains the new fields (`git diff --stat` shows the JSON changed; the hero and relief JPEGs unchanged, or restore them with `git checkout -- web/public/hero web/public/maps` if only their bytes moved).

- [ ] **Step 5: Write the failing web tests**

`web/src/lib/data/home.test.ts`, add:

```ts
import { heroMask, heroSeries } from './home';

it('turns the hero month into the engine’s hourly series: a fraction of the Sun’s disc wherever the pipeline says sunlit', () => {
  const s = heroSeries();
  expect(s.hours).toBe(720);
  for (let h = 0; h < s.hours; h++) expect(s.sunFraction[h] > 0).toBe(HOME.sky.lit[h] === 1);
  expect(s.sunAu[0]).toBeCloseTo(0.983, 2); // January: the Sun is nearest
  expect(heroMask()).toHaveLength(720);
});
```

`web/src/lib/viz/arrival.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HOME } from '@/lib/data/home';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { recompute } from '@/lib/store/explore';
import { eph, sites } from '@/test/file-loaders';
import { answerFor } from './answer';
import { arrivalWords, hero } from './arrival';
import { standHeadline } from './stand';

const engine = () => {
  const site = sites.find((s) => s.id === HOME.hero.site_id)!;
  const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', `${site.id}.json`).elevation_deg);
  return { site, r: recompute(eph, site, mask, '2027-01-01T00:00:00', 30) };
};
const plain = (t: string) => t.replace(/ /g, ' ');

describe('the arrival', () => {
  it('draws the engine’s month at the hero site: the pipeline’s figures agree with the engine’s', () => {
    const h = hero(), { r } = engine();
    for (let k = 0; k < 720; k += 7) {
      expect(h.series.sunEl[k]).toBeCloseTo(r.series.sunEl[k], 1);
      expect(h.series.earthAz[k]).toBeCloseTo(r.series.earthAz[k], 1);
      expect(Math.abs(h.series.sunFraction[k] - r.series.sunFraction[k])).toBeLessThan(0.03);
    }
    expect(h.power.firstBrownoutHour).toBe(r.power.firstBrownoutHour);
    expect(h.power.firstBrownoutHour).toBe(HOME.battery.now_hours);
    expect(h.siteHeightM).toBeCloseTo(190.33, 1);
    expect(h.earthKm[10]).toBeGreaterThan(360000);
  });

  it('gives the standing beat Explore’s answer for the site, as the stand view words it, with the better day', () => {
    const w = arrivalWords(), { site, r } = engine();
    const a = answerFor({ siteName: 'de Gerlache Rim 2', series: r.series, summary: r.summary, power: r.power, startUtc: '2027-01-01T00:00:00', days: 30, loadW: 200, batteryWh: 2000, best: r.best });
    expect(w.answer).toBe(standHeadline(a.title, 'de Gerlache Rim 2', r.series, r.power, '2027-01-01T00:00:00', a.contactHours, a.poweredHours));
    expect(plain(w.answer)).toBe('Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days without power');
    expect(plain(w.better ?? '')).toBe('Land on 20 January instead: power for 12 days 15 hours in a row.');
    expect(w.siteLine).toMatch(/^Standing at de Gerlache Rim 2, near the Moon's south pole\./);
    expect(w.exploreHref).toBe(`/explore?site=${site.id}&start=2027-01-01&days=30`);
    expect(w.beats).toEqual(['At the south pole the Sun never climbs: it circles the horizon once a month.', 'One hill can hide it for weeks.', 'This ridge was shortlisted for astronauts.']);
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/data/home.test.ts src/lib/viz/arrival.test.ts`
Expected: FAIL, `heroSeries` and `./arrival` not found.

- [ ] **Step 7: Implement**

`web/src/lib/data/home.ts`: add to `HomeDoc` `hero.site_height_m: number`, `sky.sun_au: number[]`, `sky.earth_km: number[]`, `mask: { az0: number; step: number; el: number[] }`, `battery.best_earth_fraction: number | null`; then:

```ts
import { AU_KM } from '../engine/constants';
import { diskFraction, sunRadiusDeg, type Series } from '../engine/metrics';

/**
 * The hero month as the engine's hourly series, from the pipeline's figures (angles to 0.01°): the arrival's
 * standing view draws it. The Sun's share of its disc over the hills is the engine's own rule.
 */
export function heroSeries(doc: HomeDoc = HOME): Series {
  const s = doc.sky, n = s.hours;
  const f64 = (a: number[]) => Float64Array.from(a.slice(0, n));
  const sunFraction = new Float64Array(n);
  for (let h = 0; h < n; h++) sunFraction[h] = diskFraction(s.sun_el[h] - s.hill_el[h], sunRadiusDeg(s.sun_au[h] * AU_KM));
  return { i0: 0, hours: n, sunAz: f64(s.sun_az), sunEl: f64(s.sun_el), earthAz: f64(s.earth_az), earthEl: f64(s.earth_el), sunFraction, earthVisible: Uint8Array.from(s.earth_visible.slice(0, n)), sunAu: f64(s.sun_au) };
}

/** The hero site's skyline, 720 directions from north, clockwise. */
export function heroMask(doc: HomeDoc = HOME): Float64Array {
  return Float64Array.from(doc.mask.el);
}
```

`web/src/lib/viz/arrival.ts`:

```ts
import catalogue from '../data/catalogue.json';
import { HOME, heroMask, heroSeries, type HomeDoc } from '../data/home';
import { siteLabel, type Site } from '../data/loaders';
import type { Series } from '../engine/metrics';
import { summarize } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerResult } from '../engine/power';
import { exploreHref } from '../links';
import { answerFor } from './answer';
import { spanWords } from './format';
import { standHeadline, standingLine } from './stand';

/** The hour the arrival shows: 1 January 2027, 10:00 UTC (the Sun on the ridge), the hour section 5 names. */
export const HERO_HOUR = 10;

/** The three beats' sentences between the first screen and standing (spec section 5). */
export const BEAT_SENTENCES: [string, string, string] = [
  'At the south pole the Sun never climbs: it circles the horizon once a month.',
  'One hill can hide it for weeks.',
  'This ridge was shortlisted for astronauts.',
];

export interface Hero { site: Site; series: Series; power: PowerResult; mask: Float64Array; siteHeightM: number; earthKm: number[]; startUtc: string; days: number }

/** The home page's site and month, as the arrival draws it: the pipeline's figures, the engine's power. */
export function hero(doc: HomeDoc = HOME): Hero {
  const site = (catalogue.sites as unknown as Site[]).find((s) => s.id === doc.hero.site_id);
  if (!site) throw new Error(`the catalogue has no ${doc.hero.site_id}`);
  const series = heroSeries(doc);
  return { site, series, power: powerBudget(series, DEFAULT_POWER), mask: heroMask(doc), siteHeightM: doc.hero.site_height_m, earthKm: doc.sky.earth_km, startUtc: doc.sky.start_utc, days: Math.round(doc.sky.hours / 24) };
}

export interface ArrivalWords { beats: [string, string, string]; siteLine: string; answer: string; better: string | null; exploreHref: string }

/**
 * The arrival's words, worked out on the server so they are page text: the beats, then standing at the site
 * with Explore's answer as the stand view words it, the better landing day, and Explore's address.
 */
export function arrivalWords(doc: HomeDoc = HOME): ArrivalWords {
  const h = hero(doc), name = siteLabel(h.site), b = doc.battery;
  const best = b.best_hour !== null && b.best_hours !== null ? { hour: b.best_hour, poweredHours: b.best_hours, earthFraction: b.best_earth_fraction ?? 0 } : null;
  const answer = answerFor({ siteName: name, series: h.series, summary: summarize(h.series), power: h.power, startUtc: h.startUtc, days: h.days, loadW: DEFAULT_POWER.loadW, batteryWh: DEFAULT_POWER.batteryWh, best });
  return {
    beats: BEAT_SENTENCES,
    siteLine: standingLine(h.site, name, 'top'),
    answer: standHeadline(answer.title, name, h.series, h.power, h.startUtc, answer.contactHours, answer.poweredHours),
    better: answer.better && best ? `${answer.better.label}: power for ${spanWords(best.poweredHours)} in a row.` : null,
    exploreHref: exploreHref(h.site.id, h.startUtc, h.days),
  };
}
```

- [ ] **Step 8: Run them, then the whole web suite and the type check**

Run: `cd web && npx vitest run src/lib/data/home.test.ts src/lib/viz/arrival.test.ts && npx vitest run && npx tsc --noEmit`
Expected: pass; the suite stays green (the home page tests read the same words).

- [ ] **Step 9: Commit**

```bash
git add pipeline/lunar_pipeline/home_assets.py pipeline/tests/test_home_assets.py web/src/lib/data/home.json web/src/lib/data/home.ts web/src/lib/data/home.test.ts web/src/lib/viz/arrival.ts web/src/lib/viz/arrival.test.ts
git commit -m "feat: the hero month for the arrival: the Sun's and Earth's distances, the skyline and the site's height, and the standing beat's words from the engine"
```

### Task 3: The globe in the browser

**Files:**
- Create: `web/src/lib/data/globe.ts`, `web/src/lib/data/globe.test.ts`, `web/src/lib/sky/textureCache.ts`, `web/src/lib/sky/globe.ts`, `web/src/lib/sky/globe.test.ts`

**Interfaces:**
- Consumes: Task 1's manifest and heights sidecar; `decodeHeightmap` (`lib/data/terrain.ts`), `fetchJson`, `fetchBytes` (`lib/data/loaders.ts`); `Basis`, `Vec3`, `meToWorld` (`lib/sky/frames.ts`); `SHADOW.SUN_RADIUS_RAD`.
- Produces: `interface GlobeHeights { width: number; height: number; metres: Float32Array }` (row 0 north, column 0 at 180° W); `interface GlobeAssets { color: { low: string; high: string }; normal: { low: string; high: string }; heights: GlobeHeights; albedoScale: number; credit: string }`; `loadGlobeAssets(base: string): Promise<GlobeAssets>`; `cachedTexture(url: string, srgb: boolean): { texture: THREE.Texture; ready: Promise<THREE.Texture> }`; in `globe.ts`: `GLOBE`, `globeGeometry(segLon?, segLat?)`, `moonToWorld(basis, siteHeightM): THREE.Matrix4`, `globeHeightAt(h, dir): number`, `globeMargin(h, up, sun): number`, `heightsTexture(h, half): THREE.DataTexture`, `interface Globe { mesh: THREE.Mesh; material: THREE.ShaderMaterial; setLight(sunWorld: Vec3, earthWorld: Vec3, earthLit: number): void; dispose(): void }`, `buildGlobe(o: { basis: Basis; siteHeightM: number; assets: GlobeAssets; halfFloat: boolean; cutM: number }): Globe`.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/data/globe.test.ts` (node environment: Node has `DecompressionStream`):

```ts
import zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGlobeAssets } from './globe';

const manifest = { version: 1, color: { '1k': 'moon_color_1k.jpg', '4k': 'moon_color_4k.jpg' }, normal: { '1k': 'moon_normal_1k.jpg', '4k': 'moon_normal_4k.jpg' }, heights: { file: 'moon_heights_1440.u16', meta: 'moon_heights_1440.json' }, albedo_scale: 0.8, radius_m: 1737400, credit: 'NASA SVS' };
const meta = { width: 4, height: 2, min_m: -100, max_m: 100, scale_m_per_unit: 1 };
const dn = new Uint16Array([0, 50, 100, 150, 200, 0, 0, 0]);

describe('loadGlobeAssets', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reads the manifest, gives the small and large maps’ addresses and decodes the heights to metres', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
      if (url.endsWith('.json')) return new Response(JSON.stringify(meta));
      return new Response(zlib.deflateSync(Buffer.from(dn.buffer)));
    }));
    const g = await loadGlobeAssets('/data');
    expect(g.color).toEqual({ low: '/data/globe/moon_color_1k.jpg', high: '/data/globe/moon_color_4k.jpg' });
    expect(g.normal.high).toBe('/data/globe/moon_normal_4k.jpg');
    expect(g.albedoScale).toBe(0.8);
    expect([g.heights.width, g.heights.height]).toEqual([4, 2]);
    expect(Array.from(g.heights.metres.slice(0, 3))).toEqual([-100, -50, 0]);
  });
});
```

`web/src/lib/sky/globe.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { enuBasis, meToWorld, type Vec3 } from './frames';
import { GLOBE, globeGeometry, globeHeightAt, globeMargin, heightsTexture, moonToWorld, type GlobeHeights } from './globe';

const R = 1737400;
const flat = (w = 1440, h = 720, f: (lat: number, lon: number) => number = () => 0): GlobeHeights => {
  const metres = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) metres[r * w + c] = f(90 - ((r + 0.5) * 180) / h, -180 + ((c + 0.5) * 360) / w);
  return { width: w, height: h, metres };
};
const dir = (latDeg: number, lonDeg: number): Vec3 => {
  const la = (latDeg * Math.PI) / 180, lo = (lonDeg * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};

describe('the globe', () => {
  it('is a sphere of the Moon-fixed frame whose map coordinates run from 180° W and the south pole', () => {
    const g = globeGeometry(8, 4);
    const p = g.getAttribute('position'), uv = g.getAttribute('uv');
    expect(p.count).toBe(9 * 5);
    expect([uv.getX(0), uv.getY(0)]).toEqual([0, 0]);
    expect(p.getZ(0)).toBeCloseTo(-1, 6); // the first row is the south pole
    const mid = 2 * 9 + 4; // the equator at longitude 0
    expect([p.getX(mid), p.getY(mid), p.getZ(mid)].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0]);
    // Its triangles face outwards: the first of the cell at the equator's row (row 2), longitude 0 (column 4).
    const i = g.getIndex()!, v = (k: number) => new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
    const cell = (2 * 8 + 4) * 6;
    const [a, b, c] = [i.getX(cell), i.getX(cell + 1), i.getX(cell + 2)].map(v);
    expect(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).dot(a)).toBeGreaterThan(0);
  });

  it('puts the site on the world’s origin and the Moon’s centre below it, in the site’s frame', () => {
    const b = enuBasis(-88.28, -64.31), m = moonToWorld(b, 190.33);
    const site = new THREE.Vector3(...b.up).multiplyScalar(R + 190.33).applyMatrix4(m);
    expect(site.length()).toBeLessThan(1e-3);
    expect(new THREE.Vector3(0, 0, 0).applyMatrix4(m).y).toBeCloseTo(-(R + 190.33), 3);
    const north = new THREE.Vector3(0, 0, 1).transformDirection(m);
    const want = meToWorld(b, [0, 0, 1]);
    expect(north.x).toBeCloseTo(want[0], 9);
    expect(north.y).toBeCloseTo(want[1], 9);
    expect(north.z).toBeCloseTo(want[2], 9);
  });

  it('reads heights where the maps put them: row 0 north, column 0 at 180° W, wrapping round', () => {
    const h = flat(360, 180, (lat, lon) => lat * 100 + lon);
    expect(globeHeightAt(h, dir(45.5, 10.5))).toBeCloseTo(4560.5, 6); // a pixel's centre: its own value
    // Across the seam the first column (179.5° W) is the last one's neighbour, not the far side's.
    const seam = flat(360, 180, (_lat, lon) => (lon < -179 ? 1000 : 0));
    expect(globeHeightAt(seam, dir(0.5, 179.9))).toBeCloseTo(400, 6);
  });

  it('works out the shadows by the engine’s rule: a level Moon lets a low Sun through, a wall towards it hides it', () => {
    const at = dir(-60, 0), sunUp = (deg: number): Vec3 => {
      // The Sun `deg` above the local horizon at the point, due north of it.
      const up = new THREE.Vector3(...at), north = new THREE.Vector3(0, 0, 1).addScaledVector(up, -up.z).normalize();
      const s = up.multiplyScalar(Math.sin((deg * Math.PI) / 180)).addScaledVector(north, Math.cos((deg * Math.PI) / 180));
      return [s.x, s.y, s.z];
    };
    expect(globeMargin(flat(), at, sunUp(2))).toBeGreaterThan(0);
    // A wall 3 km high from 1.5° to 2.5° north of the point (45 to 76 km away) stands up to 3° over its horizon.
    const wall = flat(1440, 720, (lat) => (lat > -58.5 && lat < -57.5 ? 3000 : 0));
    expect(globeMargin(wall, at, sunUp(2))).toBeLessThan(0);
    expect(globeMargin(wall, at, sunUp(5))).toBeGreaterThan(0);
  });

  it('turns the heights upside down for the GPU, so the south pole is at the bottom of the texture as in the maps', () => {
    const h = flat(4, 2, (lat) => (lat > 0 ? 7 : -7));
    const t = heightsTexture(h, false);
    const data = t.image.data as Float32Array;
    expect(Array.from(data.slice(0, 4))).toEqual([-7, -7, -7, -7]);
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    expect(GLOBE.CUT_M).toBe(200000);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/data/globe.test.ts src/lib/sky/globe.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the loader and the texture cache**

`web/src/lib/data/globe.ts`:

```ts
import type { GlobeHeights } from '../sky/globe';
import { fetchBytes, fetchJson } from './loaders';
import { decodeHeightmap, type HeightmapQuant } from './terrain';

/** Written by the pipeline's `globe` command (pipeline/lunar_pipeline/globe.py). */
export interface GlobeManifest {
  version: number;
  color: { '1k': string; '4k': string };
  normal: { '1k': string; '4k': string };
  heights: { file: string; meta: string };
  albedo_scale: number;
  radius_m: number;
  credit: string;
}

/** The Moon from space: the small maps to draw at once, the large ones when they come, and the heights. */
export interface GlobeAssets { color: { low: string; high: string }; normal: { low: string; high: string }; heights: GlobeHeights; albedoScale: number; credit: string }

export async function loadGlobeAssets(base: string): Promise<GlobeAssets> {
  const m = await fetchJson<GlobeManifest>(`${base}/globe/manifest.json`);
  const [meta, bytes] = await Promise.all([fetchJson<HeightmapQuant>(`${base}/globe/${m.heights.meta}`), fetchBytes(`${base}/globe/${m.heights.file}`)]);
  const url = (f: string) => `${base}/globe/${f}`;
  return {
    color: { low: url(m.color['1k']), high: url(m.color['4k']) },
    normal: { low: url(m.normal['1k']), high: url(m.normal['4k']) },
    heights: { width: meta.width, height: meta.height, metres: await decodeHeightmap(bytes, meta) },
    albedoScale: m.albedo_scale,
    credit: m.credit,
  };
}
```

`web/src/lib/sky/textureCache.ts`:

```ts
import * as THREE from 'three';

const cache = new Map<string, { texture: THREE.Texture; ready: Promise<THREE.Texture> }>();

/**
 * One texture per address for the page's life: a scene rebuilt as data arrives takes it as it is, already
 * loaded, so nothing flickers back to a placeholder. It is marked shared, and disposing a scene leaves it.
 */
export function cachedTexture(url: string, srgb: boolean): { texture: THREE.Texture; ready: Promise<THREE.Texture> } {
  const hit = cache.get(url);
  if (hit) return hit;
  let texture!: THREE.Texture;
  const ready = new Promise<THREE.Texture>((resolve, reject) => {
    texture = new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
  ready.catch(() => {}); // a map that fails to load leaves the smaller one, or the plain colour
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.userData.shared = true;
  const entry = { texture, ready };
  cache.set(url, entry);
  return entry;
}
```

- [ ] **Step 4: Implement `web/src/lib/sky/globe.ts`**

```ts
import * as THREE from 'three';
import { R_MOON_M } from '../engine/constants';
import type { GlobeAssets } from '../data/globe';
import type { Basis, Vec3 } from './frames';
import { SHADOW } from './shadowRule';
import { cachedTexture } from './textureCache';

/** Heights at 4 pixels a degree: row 0 at the north pole's edge, column 0 at 180° W, pixel centres. */
export interface GlobeHeights { width: number; height: number; metres: Float32Array }

/**
 * The globe's mesh (512 by 256 cells) and its shadow march: 28 samples from 2.5 km, growing 18 % a step, out
 * to about 220 km, the engine's rule over the globe's heights. The measured ground draws within 200 km of the
 * site, so the globe leaves that out.
 */
export const GLOBE = { SEG_LON: 512, SEG_LAT: 256, STEPS: 28, T0_M: 2500, GROWTH: 1.18, CUT_M: 200000 } as const;

/** A unit sphere in the Moon-fixed frame (x to 0° longitude, z north); u from 180° W, v from the south pole. */
export function globeGeometry(segLon: number = GLOBE.SEG_LON, segLat: number = GLOBE.SEG_LAT): THREE.BufferGeometry {
  const cols = segLon + 1, rows = segLat + 1;
  const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2), idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    const v = r / segLat, lat = (v - 0.5) * Math.PI;
    for (let c = 0; c < cols; c++) {
      const u = c / segLon, lon = (u - 0.5) * 2 * Math.PI, k = r * cols + c;
      pos.set([Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)], k * 3);
      uv.set([u, v], k * 2);
      if (r < segLat && c < segLon) idx.push(k, k + 1, k + cols + 1, k, k + cols + 1, k + cols);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Moon-fixed metres from the Moon's centre into the site's world frame (x east, y up, z south, origin on the site's ground). */
export function moonToWorld(b: Basis, siteHeightM: number): THREE.Matrix4 {
  const [e, u, n] = [b.east, b.up, b.north];
  return new THREE.Matrix4().set(e[0], e[1], e[2], 0, u[0], u[1], u[2], -(R_MOON_M + siteHeightM), -n[0], -n[1], -n[2], 0, 0, 0, 0, 1);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Height (m) at a Moon-fixed unit direction: bilinear, wrapping in longitude, as the shader samples it. */
export function globeHeightAt(h: GlobeHeights, d: Vec3): number {
  const lat = Math.asin(clamp(d[2], -1, 1)), lon = Math.atan2(d[1], d[0]);
  const x = (lon / (2 * Math.PI) + 0.5) * h.width - 0.5, y = (0.5 - lat / Math.PI) * h.height - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (c: number, r: number) => h.metres[clamp(r, 0, h.height - 1) * h.width + (((c % h.width) + h.width) % h.width)];
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

/**
 * The angle (radians) by which the Sun's centre clears the steepest rise of the ground towards it, from the
 * point at unit direction `up`, over the globe's heights: the engine's rule, as the globe's shader works it out.
 */
export function globeMargin(h: GlobeHeights, up: Vec3, sun: Vec3): number {
  const s = sun[0] * up[0] + sun[1] * up[1] + sun[2] * up[2], el = Math.asin(clamp(s, -1, 1));
  const t: Vec3 = [sun[0] - up[0] * s, sun[1] - up[1] * s, sun[2] - up[2] * s], tl = Math.hypot(t[0], t[1], t[2]);
  if (tl < 1e-5) return el;
  const r0 = R_MOON_M + globeHeightAt(h, up);
  let best = -Infinity, d: number = GLOBE.T0_M;
  for (let i = 0; i < GLOBE.STEPS; i++) {
    const a = d / R_MOON_M, c = Math.cos(a), sn = Math.sin(a) / tl;
    const q: Vec3 = [up[0] * c + t[0] * sn, up[1] * c + t[1] * sn, up[2] * c + t[2] * sn];
    const rq = R_MOON_M + globeHeightAt(h, q);
    best = Math.max(best, Math.atan2(rq * c - r0, rq * Math.sin(a)));
    d *= GLOBE.GROWTH;
  }
  return el - best;
}

/** The heights as a texture, rows turned so its first row is the south pole's, as the maps' v runs. */
export function heightsTexture(h: GlobeHeights, half: boolean): THREE.DataTexture {
  const flipped = new Float32Array(h.metres.length);
  for (let r = 0; r < h.height; r++) flipped.set(h.metres.subarray(r * h.width, (r + 1) * h.width), (h.height - 1 - r) * h.width);
  const data = half ? Uint16Array.from(flipped, (v) => THREE.DataUtils.toHalfFloat(v)) : flipped;
  const t = new THREE.DataTexture(data, h.width, h.height, THREE.RedFormat, half ? THREE.HalfFloatType : THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const SUN_R = SHADOW.SUN_RADIUS_RAD.toFixed(5);

export const GLOBE_VERT = /* glsl */ `
uniform sampler2D uHeights; uniform float uRadius;
varying vec3 vDir; varying vec2 vUv; varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = normalize(position); vUv = uv;
  vec4 w = modelMatrix * vec4(vDir * (uRadius + textureLod(uHeights, uv, 0.0).r), 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

export const GLOBE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uColor, uNormal, uHeights;
uniform float uColorOn, uNormalOn, uRadius, uAlbedoScale, uSunPower, uEarthshine, uCut;
uniform vec3 uSun, uSunMe, uEarthMe, uSiteMe; uniform mat3 uToWorld;
varying vec3 vDir; varying vec2 vUv; varying vec3 vWorld;
#include <logdepthbuf_pars_fragment>
float hAt(vec3 d) { return textureLod(uHeights, vec2(atan(d.y, d.x) / 6.2831853 + 0.5, asin(clamp(d.z, -1.0, 1.0)) / 3.1415927 + 0.5), 0.0).r; }
// The engine's rule over the globe's heights: the steepest rise of the ground towards the Sun against its height.
float margin(vec3 up, vec3 sun) {
  float s = dot(sun, up); float el = asin(clamp(s, -1.0, 1.0));
  vec3 t = sun - up * s; float tl = length(t);
  if (tl < 1.0e-5) return el;
  t /= tl; float r0 = uRadius + hAt(up), best = -10.0, d = ${GLOBE.T0_M.toFixed(1)};
  for (int i = 0; i < ${GLOBE.STEPS}; i++) {
    float a = d / uRadius; float rq = uRadius + hAt(up * cos(a) + t * sin(a));
    best = max(best, atan(rq * cos(a) - r0, rq * sin(a)));
    d *= ${GLOBE.GROWTH};
  }
  return el - best;
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 up = normalize(vDir);
  float m = margin(up, normalize(uSunMe)); // before any branch: its change across a pixel softens far edges
  if (dot(up, uSiteMe) > uCut) discard;    // the measured ground draws here
  float lon = atan(up.y, up.x);
  vec3 east = normalize(vec3(-sin(lon), cos(lon), 0.0)), north = cross(up, east);
  vec3 nt = uNormalOn > 0.5 ? texture2D(uNormal, vUv).xyz * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  vec3 nMe = normalize(east * nt.x + north * nt.y + up * nt.z);
  vec3 N = normalize(uToWorld * nMe), L = normalize(uSun), V = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(N, L), 0.0), mu = max(dot(N, V), 0.03);
  float alpha = acos(clamp(dot(L, V), -1.0, 1.0));
  float phase = exp(-0.82 * alpha), surge = 1.0 + 0.45 / (1.0 + tan(alpha * 0.5) / 0.055);
  float vis = clamp(m / max(2.0 * ${SUN_R}, fwidth(m)) + 0.5, 0.0, 1.0);
  vec3 albedo = uColorOn > 0.5 ? texture2D(uColor, vUv).rgb * uAlbedoScale : vec3(0.17);
  vec3 col = albedo * vec3(1.0, 0.99, 0.975) * uSunPower * (mu0 / (mu0 + mu)) * phase * surge * vis;
  // Earthshine: the night side faintly lit by Earth, more as Earth is fuller.
  col += albedo * vec3(0.5, 0.62, 1.0) * uEarthshine * max(dot(nMe, normalize(uEarthMe)), 0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface Globe { mesh: THREE.Mesh; material: THREE.ShaderMaterial; setLight(sunWorld: Vec3, earthWorld: Vec3, earthLit: number): void; dispose(): void }

/**
 * The Moon round the measured ground: the colour map and the relief (the small maps at once, the large ones
 * when they come), lit as the ground is lit (regolith photometry, the engine's shadow rule over its own
 * heights), placed by the site's frame. `cutM` leaves out what lies within that distance of the site (the
 * measured ground draws there); 0 leaves nothing out.
 */
export function buildGlobe(o: { basis: Basis; siteHeightM: number; assets: GlobeAssets; halfFloat: boolean; cutM: number }): Globe {
  const toWorld = moonToWorld(o.basis, o.siteHeightM);
  const rot = new THREE.Matrix3().setFromMatrix4(toWorld), back = rot.clone().transpose();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: null }, uNormal: { value: null }, uHeights: { value: heightsTexture(o.assets.heights, o.halfFloat) },
      uColorOn: { value: 0 }, uNormalOn: { value: 0 }, uRadius: { value: R_MOON_M }, uAlbedoScale: { value: o.assets.albedoScale },
      uSunPower: { value: 3.4 }, uEarthshine: { value: 0 }, uCut: { value: o.cutM > 0 ? Math.cos(o.cutM / R_MOON_M) : 2 },
      uSun: { value: new THREE.Vector3(1, 0, 0) }, uSunMe: { value: new THREE.Vector3(1, 0, 0) }, uEarthMe: { value: new THREE.Vector3(0, 1, 0) },
      uSiteMe: { value: new THREE.Vector3(...o.basis.up) }, uToWorld: { value: rot },
    },
    vertexShader: GLOBE_VERT,
    fragmentShader: GLOBE_FRAG,
  });
  const mesh = new THREE.Mesh(globeGeometry(), material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(toWorld);
  mesh.matrixWorldNeedsUpdate = true;
  mesh.frustumCulled = false;
  if (typeof document !== 'undefined') {
    // The small maps first, the large ones over them when they arrive.
    const stream = (urls: { low: string; high: string }, srgb: boolean, map: 'uColor' | 'uNormal', on: 'uColorOn' | 'uNormalOn') => {
      for (const url of [urls.low, urls.high]) {
        const t = cachedTexture(url, srgb);
        void t.ready.then(() => {
          if (url === urls.low && material.uniforms[map].value && material.uniforms[map].value !== t.texture) return; // the large one came first
          material.uniforms[map].value = t.texture;
          material.uniforms[on].value = 1;
        }, () => {});
      }
    };
    stream(o.assets.color, true, 'uColor', 'uColorOn');
    stream(o.assets.normal, false, 'uNormal', 'uNormalOn');
  }
  const v = new THREE.Vector3();
  return {
    mesh,
    material,
    setLight(sunWorld, earthWorld, earthLit) {
      material.uniforms.uSun.value.set(...sunWorld);
      material.uniforms.uSunMe.value.copy(v.set(...sunWorld).applyMatrix3(back)).normalize();
      material.uniforms.uEarthMe.value.copy(v.set(...earthWorld).applyMatrix3(back)).normalize();
      material.uniforms.uEarthshine.value = 0.03 * earthLit;
    },
    dispose() {
      mesh.geometry.dispose();
      (material.uniforms.uHeights.value as THREE.Texture).dispose();
      material.dispose();
    },
  };
}
```

The stream guard: the large map replaces the small one, and a small map arriving after the large one is ignored.

- [ ] **Step 5: Run them to see them pass, then the type check**

Run: `cd web && npx vitest run src/lib/data/globe.test.ts src/lib/sky/globe.test.ts && npx tsc --noEmit`
Expected: pass; clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/data/globe.ts web/src/lib/data/globe.test.ts web/src/lib/sky/textureCache.ts web/src/lib/sky/globe.ts web/src/lib/sky/globe.test.ts
git commit -m "feat(web): the globe: NASA's colour map and relief on a sphere placed by the site's frame, lit by the ground's rule with its own long shadows"
```

### Task 4: The stand scene learns to fly

**Files:**
- Modify: `web/src/lib/sky/standRenderer.ts`, `web/src/lib/sky/shaders.ts` (`uFarCut`), `web/src/lib/sky/standRenderer.test.ts`, `web/src/lib/data/terrain.ts` (+ test: the crop's half-size as a parameter)

**Interfaces:**
- Consumes: `Pose` from `lib/sky/arrivalPath.ts` (Task 5): `{ position: Vec3; quaternion: [number, number, number, number]; fov: number; shift: [number, number] }`; `buildGlobe`, `Globe`, `GLOBE` (Task 3); `GlobeAssets` (Task 3); `cachedTexture` (Task 3).
- Produces: `StandScene` gains `globe?: GlobeAssets; siteHeightM?: number; earthKm?: ArrayLike<number>; ground?: boolean`. `buildScene(...)` returns, besides what it returns now, `setPose(pose: Pose, aspect: number)`, `project(world: Vec3, moon?: boolean): Spot`, `parts.globe: THREE.Mesh | null`, `parts.sky: THREE.Group`, `parts.ring: THREE.Mesh | null`. `StandRenderer` gains `setPose(pose: Pose)`, `setScene(scene: StandScene)`, `project(world: Vec3, moon?: boolean)`, `onSharp?: () => void`; `dispose()` also disposes the composer's passes and forces the context loss. `shadowLevels(site, window, context, cap, capHalfPx = CAP_SHADOW_HALF_PX)`.

- [ ] **Step 1: Write the failing tests** (append to `standRenderer.test.ts`; `flat`, `levels`, `series`, `sky` are the file's helpers)

```ts
import { R_MOON_M } from '@/lib/engine/constants';
import { enuBasis, type Vec3 } from './frames';
import type { GlobeAssets } from '@/lib/data/globe';

const globe: GlobeAssets = { color: { low: 'c1.jpg', high: 'c4.jpg' }, normal: { low: 'n1.jpg', high: 'n4.jpg' }, heights: { width: 4, height: 2, metres: new Float32Array(8) }, albedoScale: 0.8, credit: '' };
const at = (position: Vec3, look: Vec3 = [0, -1, 0]) => {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...position), new THREE.Vector3(...position).add(new THREE.Vector3(...look)), new THREE.Vector3(0, 0, -1));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return { position, quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number], fov: 50, shift: [0, 0] as [number, number] };
};

describe('the stand scene in flight', () => {
  it('puts the globe round the site: the Moon’s centre its radius and the site’s height below the site', () => {
    const s = buildScene(flat({ globe, siteHeightM: 190.33 }));
    const m = s.parts.globe!.matrix;
    expect(new THREE.Vector3(0, 0, 0).applyMatrix4(m).y).toBeCloseTo(-(R_MOON_M + 190.33), 3);
    const b = enuBasis(-88.28, -64.31);
    expect(new THREE.Vector3(...b.up).multiplyScalar(R_MOON_M + 190.33).applyMatrix4(m).length()).toBeLessThan(1);
  });

  it('carries the sky with the camera and sees Earth where it is from there, the Sun where it always is', () => {
    const s = buildScene(flat({ globe, siteHeightM: 190.33, earthKm: [384400, 384400, 384400] }));
    s.update(0);
    s.setPose(at([3.0e6, 1.0e6, 0]), 1.6);
    expect(s.parts.sky.position.x).toBeCloseTo(3.0e6, 3);
    // Earth sits in the sky group, which sits on the camera: its place in the group is its direction from the camera.
    const seen = new THREE.Vector3().setFromMatrixPosition(s.parts.earth.matrix).normalize();
    const truth = new THREE.Vector3(...dirAzEl(70, 4)).multiplyScalar(384400e3).add(new THREE.Vector3(0, 2, 0)).sub(new THREE.Vector3(3.0e6, 1.0e6, 0)).normalize();
    expect(seen.angleTo(truth)).toBeLessThan(1e-6);
    expect(seen.angleTo(new THREE.Vector3(...dirAzEl(70, 4)))).toBeGreaterThan(0.004); // half a degree of parallax from 3,000 km off
    // The Sun does not move with the camera.
    expect(new THREE.Vector3().copy(s.parts.sun.position).normalize().angleTo(new THREE.Vector3(...dirAzEl(300, 2)))).toBeLessThan(1e-6);
  });

  it('meshes the cap to 205 km with the globe, cut at 200 km in flight and at 125 km once standing, with the skyline ring only standing', () => {
    const s = buildScene(flat({ globe, siteHeightM: 100, field: terrainField(levels(), -64.31, 100) }));
    const coarse = s.parts.ground[s.parts.ground.length - 1];
    let reach = 0;
    const p = coarse.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
    expect(reach).toBeGreaterThan(200000);
    s.setPose(at([0, 90000, 0]), 1.6);
    expect((coarse.material as THREE.ShaderMaterial).uniforms.uFarCut.value).toBe(200000);
    expect(s.parts.ring!.visible).toBe(false);
    s.setView(300, 2, 60, 1.6);
    expect((coarse.material as THREE.ShaderMaterial).uniforms.uFarCut.value).toBe(125000);
    expect(s.parts.ring!.visible).toBe(true);
  });

  it('draws the sky and the globe alone before the ground has loaded: no ground, skyline, rocks or lander', () => {
    const s = buildScene(flat({ globe, ground: false, lander: { azDeg: 90, distM: 16, powered: Uint8Array.from([1, 1, 1]) } }));
    expect(s.parts.ground).toHaveLength(0);
    expect(s.parts.ring).toBeNull();
    expect(s.parts.lander).toBeNull();
    expect(s.parts.boulders.children).toHaveLength(0);
    expect(s.parts.globe).not.toBeNull();
  });

  it('keeps the stand view as it was: setView brings the camera back to the eye and the sky to its own size', () => {
    const s = buildScene(flat());
    s.setPose(at([0, 5000, 0]), 1.6);
    s.setView(300, 2, 46, 16 / 9);
    expect([s.camera.position.x, s.camera.position.z]).toEqual([0, 0]);
    expect(s.camera.position.y).toBeCloseTo(2, 6);
    expect(s.parts.sky.position.y).toBeCloseTo(2, 6);
    expect(s.parts.sky.scale.x).toBe(1);
    expect(s.parts.globe).toBeNull();
  });

  it('exposes for the sunlit Moon from space, and as the stand view does at the eye', () => {
    const s = buildScene(flat({ globe, siteHeightM: 0 }));
    s.update(0);
    s.setView(120, 2, 60, 1.6);
    const eye = s.exposure();
    s.setPose(at([0, 7.0e6, 0]), 1.6);
    expect(s.exposure()).toBeCloseTo(1.8, 6);
    s.setView(120, 2, 60, 1.6);
    expect(s.exposure()).toBeCloseTo(eye, 9);
  });

  it('hides a point behind the Moon from a camera in space, and shows one on the near side', () => {
    const s = buildScene(flat({ globe, siteHeightM: 0 }));
    s.setPose(at([0, 4.0e6, 0]), 1.6);
    expect(s.project([0, 0, 0], true).visible).toBe(true);                       // the site, below the camera
    expect(s.project([0, -2 * R_MOON_M, 0], true).visible).toBe(false);          // the far side's pole, behind the Moon
  });
});
```

In `terrain.test.ts` add: `shadowLevels(site, null, null, cap, 480)` crops the cap to 961 cells across (a cap fixture at least that big: build one with `new Float32Array(1940 * 1940)` and the real cap's meta numbers).

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky/standRenderer.test.ts src/lib/data/terrain.test.ts`
Expected: FAIL on `setPose`, `parts.globe`, `parts.sky`, `uFarCut` and the crop size.

- [ ] **Step 3: Implement**

`terrain.ts`: `export function shadowLevels(site, window, context, cap, capHalfPx = CAP_SHADOW_HALF_PX)`, the first crop using `capHalfPx`.

`shaders.ts`, `GROUND_FRAG`: declare `uniform float uFarCut;` and after the hole's discard add `if (dot(m, m) > uFarCut * uFarCut) discard; // beyond this the globe (or the far skyline) draws`.

`standRenderer.ts`:

1. Imports: `import type { GlobeAssets } from '../data/globe'; import type { Pose } from './arrivalPath'; import { buildGlobe, GLOBE, type Globe } from './globe'; import { cachedTexture } from './textureCache';`.
2. `StandScene` gains:

```ts
  /** The whole Moon round the measured ground, for views from above (the home page's arrival); none in the stand view. */
  globe?: GlobeAssets;
  /** The site's ground above the Moon's reference sphere (m): the globe's centre lies the Moon's radius and this below the site. */
  siteHeightM?: number;
  /** Earth's distance (km) hour by hour, for its direction from a camera away from the site; 384,400 km when absent. */
  earthKm?: ArrayLike<number>;
  /** False for the sky and the globe alone, before the ground has loaded: no ground, skyline, rocks or lander. */
  ground?: boolean;
```

3. Constants: `const STAND_REACH_M = 125000, FLIGHT_REACH_M = 205000, STANDING_M = 500, SPACE_GAIN = 1.8, SPACE_STARS = 0.7;` and `meshReachM(cellM, coarsest, flight)` returning `FLIGHT_REACH_M` for the coarsest level in flight. Ground materials gain `uFarCut: { value: 1e9 }`.
4. In `buildScene`: `const hasGround = scene.ground !== false, flight = !!scene.globe, siteH = scene.siteHeightM ?? 0, moonC = new THREE.Vector3(0, -(R_MOON_M + siteH), 0);`. Build the ground meshes, the ring, the lander, the boulders and the pebbles only when `hasGround` (the ring's mesh kept in `ring`, null otherwise; an empty `rocks.group` otherwise). Put the stars, the cross, the Sun, the glare and Earth in `const sky = new THREE.Group()` at `(0, eye, 0)`; `update(t)` places the Sun and the glare at `sd * RS` (no eye term), and Earth through:

```ts
  // Earth from wherever the camera is: its direction from the site at the hour and its distance say where it is.
  const earthLocal = new THREE.Vector3(), earthDir = new THREE.Vector3(), eyeW = new THREE.Vector3(0, eye, 0);
  let earthDistM = 384400e3, axes = earthAxes(moonMatrixAt(scene.sky.moon, startMs), basis, startMs);
  function placeEarth() {
    earthLocal.copy(eyeW).addScaledVector(earthDir, earthDistM).sub(camera.position).normalize().multiplyScalar(RS);
    earth.matrix.makeBasis(new THREE.Vector3(...axes.x), new THREE.Vector3(...axes.y), new THREE.Vector3(...axes.z)).setPosition(earthLocal);
    earth.matrixWorldNeedsUpdate = true;
    earthPos.copy(earthLocal).multiplyScalar(sky.scale.x).add(sky.position);
  }
```

with `update(t)` setting `earthDir.set(...ed)`, `earthDistM = 1000 * Number(scene.earthKm?.[hourIndex] ?? 384400)`, `axes = earthAxes(m, basis, when)`, then `placeEarth()`. The globe, when `flight`: `const globe = scene.globe ? buildGlobe({ basis, siteHeightM: siteH, assets: scene.globe, halfFloat: opts.halfFloat ?? false, cutM: hasGround ? GLOBE.CUT_M : 0 }) : null;` added to `root`; `update(t)` calls `globe?.setLight(sd, ed, full)`. The Earth maps come from `cachedTexture` (both shared); `uMaps` turns on when both are ready.

5. `setPose`, after `setView`:

```ts
  let spaceNow = 0;
  /** Where the camera is above the site's level sphere, metres. */
  const altitude = () => camera.position.distanceTo(moonC) - (R_MOON_M + siteH);
  /** The views from above: the camera anywhere, the sky round it, the far skyline only when standing. */
  function setPose(pose: Pose, aspect: number) {
    camera.position.set(...pose.position);
    camera.quaternion.set(...pose.quaternion);
    camera.fov = pose.fov;
    camera.aspect = aspect;
    camera.far = flight ? 1e10 : 700000;
    const [sx, sy] = pose.shift;
    if (sx || sy) camera.setViewOffset(1000 * aspect, 1000, -sx * 1000 * aspect, sy * 1000, 1000 * aspect, 1000);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camera.getWorldDirection(viewDir);
    pitchNow = Math.asin(Math.max(-1, Math.min(1, viewDir.y))) / DEG;
    const alt = altitude();
    // In space the sky stands beyond the far side of the Moon, at its own angular sizes.
    sky.position.copy(camera.position);
    sky.scale.setScalar(flight ? Math.max(1, (camera.position.distanceTo(moonC) + 2 * R_MOON_M) / RS) : 1);
    placeEarth();
    standing(alt < STANDING_M);
    spaceNow = flight ? Math.min(1, Math.max(0, (alt - 30e3) / (600e3 - 30e3))) : 0;
    expose();
  }
  /** Standing: the stand view's far skyline and the cap's mesh to 125 km; above, the mesh to 200 km and the globe beyond. */
  function standing(on: boolean) {
    if (ring) ring.visible = on || !flight;
    const coarse = ground[ground.length - 1];
    if (coarse && flight) (coarse.material as THREE.ShaderMaterial).uniforms.uFarCut.value = on ? STAND_REACH_M : GLOBE.CUT_M;
  }
```

`setView` resets: `camera.position.set(0, eye, 0); camera.clearViewOffset(); camera.far = flight ? 1e10 : 700000; sky.position.set(0, eye, 0); sky.scale.setScalar(1); placeEarth(); standing(true); spaceNow = 0;` then what it did (at the eye the sky's own size is enough: what lies beyond 200 km stands below the skyline). `expose()` mixes in space: `starMat.uniforms.uGain.value = groundGain + (SPACE_STARS - groundGain) * spaceNow`. `exposure()` keeps its ground rule as `stand` and ends `return stand + (SPACE_GAIN - stand) * spaceNow`: from space the camera exposes for the sunlit Moon (a fixed gain), not for the ground at its feet. `labels()` reads the Sun's and the stars' world places through `sky` (`v.copy(local).multiplyScalar(sky.scale.x).add(sky.position)`).

```ts
  const ray3 = new THREE.Ray(), probe = new THREE.Sphere(moonC, R_MOON_M - 12000);
  /** A world point on the screen; with `moon`, hidden when the Moon stands between it and the camera. */
  function project(world: Vec3, moon = false): Spot {
    const w = new THREE.Vector3(...world), s = spot(w, 0, false);
    if (!moon || !s.visible) return s;
    ray3.set(camera.position, w.clone().sub(camera.position).normalize());
    const hit = ray3.intersectSphere(probe, new THREE.Vector3());
    return hit && hit.distanceTo(camera.position) < w.distanceTo(camera.position) - 1 ? { ...s, visible: false } : s;
  }
```

Return `setPose`, `project`, and `parts.globe: globe?.mesh ?? null`, `parts.sky: sky`, `parts.ring: ring`; `dispose()` skips textures with `userData.shared` and calls `globe?.dispose()`.

6. `StandRenderer`: keep the `RenderPass` in a field; `private pose: Pose | null = null`; `setPose(pose)` stores it and calls `built.setPose(pose, w / h)`; `setView` clears it; `drawAt` re-applies the pose when there is one, else the view; the pacer's key adds the pose (`pose.position`, `pose.quaternion`, `pose.fov`, `pose.shift` to 4 decimals) and a scene generation number.

```ts
  private next: { built: ReturnType<typeof buildScene>; compiled: boolean } | null = null;
  /** A new scene (the ground arriving): built and compiled beside the one on the screen, which it replaces once ready. */
  setScene(scene: StandScene) {
    const built = buildScene(scene, { halfFloat: this.half });
    const next = { built, compiled: false };
    this.next = next;
    this.renderer.compileAsync(built.root, built.camera).then(() => { next.compiled = true; }, () => this.onLost?.('A shader of the view did not compile'));
  }
```

At the top of `render()`: when `this.next?.compiled`, swap (`old = this.built`; `this.built = next.built`; `this.built.root.environment = old.root.environment`; `old.root.environment = null`; `old.dispose()`; `this.renderPass.scene = this.built.root`; `this.renderPass.camera = this.built.camera`; `this.built.update(this.hour)`; re-apply the pose or view; `this.generation++`). In `busy()`, when a sharp frame's fence signals, call `this.onSharp?.()`. `project(world, moon)` delegates. `dispose()` also disposes `this.next?.built`, `this.bloom.dispose()`, the composer's render targets (`this.composer.dispose()`), and ends with `this.renderer.forceContextLoss()`.

- [ ] **Step 4: Run them, then the whole suite**

Run: `cd web && npx vitest run src/lib/sky src/lib/data/terrain.test.ts && npx vitest run && npx tsc --noEmit`
Expected: the new tests pass; every part A test still passes (the stand view is unchanged: the sky group at the eye, scale 1, no globe).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/standRenderer.ts web/src/lib/sky/shaders.ts web/src/lib/sky/standRenderer.test.ts web/src/lib/data/terrain.ts web/src/lib/data/terrain.test.ts
git commit -m "feat(web): the stand scene flies: a camera anywhere with the sky round it, the globe beyond the measured ground, scene swaps and projection"
```

### Task 5: The flight path

**Files:**
- Create: `web/src/lib/sky/arrivalTiming.ts` (no three.js: the home page's section imports it, and three.js stays in the lazily loaded stage), `web/src/lib/sky/arrivalPath.ts`, `web/src/lib/sky/arrivalPath.test.ts`

**Interfaces:**
- Consumes: `dirAzEl`, `meToWorld`, `enuBasis`, `Basis`, `Vec3` (`frames.ts`); `R_MOON_M`.
- Produces in `arrivalTiming.ts`: `STOPS = [0, 1, 1.5, 2, 3, 4]`; `BEAT_STOPS = [0, 1.25, 2, 3, 4]`; `SWEEP = { from: 1, to: 1.5, hours: 708.73 }`; `PLAY = [3, 3.5, 2, 3, 3.5]`; `smoother(t)`; `hourAt(p: number, startHour: number, reduced?: boolean): number`; `progressFromScroll(screens: number): number`; `scrollFromProgress(p: number): number`; `playProgress(seconds: number): number`; `playSeconds(p: number): number`.
- Produces in `arrivalPath.ts` (which re-exports the timing): `interface Pose { position: Vec3; quaternion: [number, number, number, number]; fov: number; shift: [number, number] }`; `interface Key { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; fov: number; shift: [number, number] }`; `interface PathInput { basis: Basis; siteHeightM: number; eyeY: number; stand: { yaw: number; pitch: number; fov: number }; sun: Vec3; earth: Vec3; groundAt: (x: number, z: number) => number; aspect: number }`; `FLIGHT`; `moonCentre(siteHeightM): THREE.Vector3`; `polePoint(i: PathInput): Vec3`; `flightKeys(i: PathInput): Key[]` (six keys at `STOPS`); `poseAt(keys: Key[], p: number, i: PathInput): Pose`.

- [ ] **Step 1: Write the failing tests** (`arrivalPath.test.ts`, the hero's real geometry at 1 January 2027 10:00)

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { R_MOON_M } from '@/lib/engine/constants';
import { dirAzEl, enuBasis, type Vec3 } from './frames';
import { flightKeys, moonCentre, polePoint, poseAt, type PathInput, type Pose } from './arrivalPath';
import { BEAT_STOPS, hourAt, PLAY, playProgress, playSeconds, progressFromScroll, scrollFromProgress, STOPS, SWEEP } from './arrivalTiming';

const level = (x: number, z: number) => -(x * x + z * z) / (2 * R_MOON_M);
const e = dirAzEl(71.09, -5.95), km = 393550e3;
const input = (aspect = 1.6, groundAt = level): PathInput => ({
  basis: enuBasis(-88.28, -64.31), siteHeightM: 190.33, eyeY: 2, stand: { yaw: 287.3, pitch: 2, fov: aspect < 1 ? 80 : 60 },
  sun: dirAzEl(322.33, 2.37), earth: [e[0] * km, 2 + e[1] * km, e[2] * km], groundAt, aspect,
});
/** Where a world point falls in a pose's view: x and y from -1 to 1 across it, and whether it is in front. */
function viewOf(p: Pose, aspect: number) {
  const c = new THREE.PerspectiveCamera(p.fov, aspect, 1, 1e10);
  c.position.set(...p.position);
  c.quaternion.set(...p.quaternion);
  if (p.shift[0] || p.shift[1]) c.setViewOffset(1000 * aspect, 1000, -p.shift[0] * 1000 * aspect, p.shift[1] * 1000, 1000 * aspect, 1000);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return (w: Vec3 | THREE.Vector3) => {
    const v = (w instanceof THREE.Vector3 ? w.clone() : new THREE.Vector3(...w)).project(c);
    return { x: v.x, y: v.y, inFront: v.z < 1 };
  };
}
const inView = (s: { x: number; y: number; inFront: boolean }, margin = 0.95) => s.inFront && Math.abs(s.x) < margin && Math.abs(s.y) < margin;

describe('the flight', () => {
  it('opens on the whole Moon with Earth beyond it, the south pole on the side that faces you', () => {
    const i = input(), keys = flightKeys(i), p = poseAt(keys, 0, i), see = viewOf(p, i.aspect);
    const cam = new THREE.Vector3(...p.position), C = moonCentre(i.siteHeightM), E = new THREE.Vector3(...i.earth);
    const rho = Math.asin(R_MOON_M / cam.distanceTo(C)), earthR = Math.asin(6371e3 / cam.distanceTo(E));
    expect(C.clone().sub(cam).angleTo(E.clone().sub(cam))).toBeGreaterThan(rho + earthR); // Earth clear of the disc
    expect(inView(see(E))).toBe(true);
    expect(inView(see(C))).toBe(true);
    const pole = new THREE.Vector3(...polePoint(i));
    expect(pole.clone().sub(C).dot(cam.clone().sub(pole))).toBeGreaterThan(0); // the pole faces the camera
    expect(inView(see(pole))).toBe(true);
  });

  it('looks straight down on the pole for the month’s sweep, 900 km up', () => {
    const i = input(), keys = flightKeys(i);
    for (const p of [1, 1.25, 1.5]) {
      const pose = poseAt(keys, p, i), s = viewOf(pose, i.aspect)(polePoint(i));
      expect(Math.hypot(s.x, s.y)).toBeLessThan(0.02);
      expect(new THREE.Vector3(...pose.position).distanceTo(moonCentre(i.siteHeightM)) - R_MOON_M).toBeCloseTo(9.0e5, -3);
    }
  });

  it('then looks across the polar cap from 90 km up with the Sun at its side, the pole and the site in view', () => {
    const i = input(), pose = poseAt(flightKeys(i), 2, i), see = viewOf(pose, i.aspect);
    expect(inView(see(polePoint(i)))).toBe(true);
    expect(inView(see([0, 0, 0]))).toBe(true);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...pose.quaternion)).setY(0).normalize();
    const sunAlong = new THREE.Vector3(i.sun[0], 0, i.sun[2]).normalize();
    expect(Math.abs(fwd.dot(sunAlong))).toBeLessThan(Math.sin((15 * Math.PI) / 180)); // shadows run across the view
    expect(pose.position[1]).toBeCloseTo(9.0e4, -3);
  });

  it('comes down over the ridge, 2 km above the ground, the site in the middle, and ends on the stand view’s opening', () => {
    const i = input(), keys = flightKeys(i);
    const ridge = poseAt(keys, 3, i), s = viewOf(ridge, i.aspect)([0, 0, 0]);
    expect(Math.hypot(s.x, s.y)).toBeLessThan(0.1);
    expect(ridge.position[1] - i.groundAt(ridge.position[0], ridge.position[2])).toBeCloseTo(2000, 0);
    const end = poseAt(keys, 4, i);
    expect(end.position).toEqual([0, 2, 0]);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...end.quaternion));
    expect(fwd.angleTo(new THREE.Vector3(...dirAzEl(287.3, 2)))).toBeLessThan(1e-6);
    expect(end.fov).toBe(60);
  });

  it('moves smoothly both ways: the ground never rushes past (each step a small share of the height), and the stops are the keys', () => {
    const i = input(), keys = flightKeys(i);
    let last = poseAt(keys, 0, i);
    for (let p = 0.002; p <= 4; p += 0.002) {
      const now = poseAt(keys, p, i);
      const a = new THREE.Vector3(...last.position), b = new THREE.Vector3(...now.position);
      const alt = Math.max(2, b.distanceTo(moonCentre(i.siteHeightM)) - R_MOON_M - i.siteHeightM);
      expect(a.distanceTo(b)).toBeLessThan(0.08 * alt + 5);
      expect(now.quaternion.every(Number.isFinite)).toBe(true);
      last = now;
    }
    STOPS.forEach((p, k) => expect(new THREE.Vector3(...poseAt(keys, p, i).position).distanceTo(keys[k].position)).toBeLessThan(1e-3));
  });

  it('never goes under the ground on the way down, even over hills', () => {
    const hills = (x: number, z: number) => level(x, z) + 600 * Math.sin(x / 1500) * Math.cos(z / 1700);
    const i = input(1.6, hills), keys = flightKeys(i);
    for (let p = 2; p <= 4; p += 0.005) {
      const pose = poseAt(keys, p, i);
      expect(pose.position[1] - hills(pose.position[0], pose.position[2])).toBeGreaterThanOrEqual(1.5 - 1e-6);
    }
  });

  it('fits a phone: the whole Moon across a tall view and the pole’s cap in it', () => {
    const i = input(390 / 844), keys = flightKeys(i), p = poseAt(keys, 0, i);
    const see = viewOf(p, i.aspect), C = moonCentre(i.siteHeightM);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(...p.quaternion));
    for (const k of [-1, 1]) expect(inView(see(C.clone().addScaledVector(right, k * R_MOON_M)), 1)).toBe(true);
  });

  it('sweeps one synodic month while it holds over the pole, and none with reduced motion', () => {
    expect(hourAt(0.5, 10)).toBe(10);
    expect(hourAt(SWEEP.from + 0.25, 10)).toBeCloseTo(10 + SWEEP.hours / 2, 6);
    expect(hourAt(SWEEP.to - 1e-9, 10)).toBeCloseTo(10 + SWEEP.hours, 3);
    expect(hourAt(1.25, 10, true)).toBe(10);
  });

  it('maps scroll to progress beat by beat, and plays fifteen seconds from the first screen to standing', () => {
    BEAT_STOPS.forEach((p, k) => expect(progressFromScroll(k)).toBeCloseTo(p, 9));
    for (let s = 0; s <= 4; s += 0.1) expect(scrollFromProgress(progressFromScroll(s))).toBeCloseTo(s, 9);
    expect(PLAY.reduce((a, b) => a + b, 0)).toBe(15);
    expect(playProgress(0)).toBe(0);
    expect(playProgress(15)).toBe(4);
    expect(playProgress(99)).toBe(4);
    for (let p = 0; p <= 4; p += 0.25) expect(playProgress(playSeconds(p))).toBeCloseTo(p, 9);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky/arrivalPath.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `web/src/lib/sky/arrivalTiming.ts`**

```ts
/*
 * The arrival's timing, with no three.js in it: the home page's section imports this, and three.js stays in
 * the stage that loads after it.
 */

/** The progress of each key: the Moon, the pole, the pole again (the sweep's end), the cap, the ridge, standing. */
export const STOPS = [0, 1, 1.5, 2, 3, 4] as const;
/** Where each beat's words stand: the first screen, the pole mid-sweep, the cap, the ridge, standing. */
export const BEAT_STOPS = [0, 1.25, 2, 3, 4] as const;
/** While the camera holds over the pole the hours run through one synodic month: the Sun goes once round. */
export const SWEEP = { from: 1, to: 1.5, hours: 708.73 } as const;
/** Seconds of play from stop to stop: fifteen in all, the video's first fifteen seconds. */
export const PLAY = [3, 3.5, 2, 3, 3.5] as const;

/** 0 to 1 with no speed at either end: the camera rests at each stop. */
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function hourAt(p: number, startHour: number, reduced = false): number {
  if (reduced || p <= SWEEP.from || p >= SWEEP.to) return startHour;
  return startHour + SWEEP.hours * smoother((p - SWEEP.from) / (SWEEP.to - SWEEP.from));
}

/** Straight between the beats' stops: screen k is beat k. */
export function progressFromScroll(screens: number): number {
  const s = Math.min(BEAT_STOPS.length - 1, Math.max(0, screens)), k = Math.min(BEAT_STOPS.length - 2, Math.floor(s));
  return BEAT_STOPS[k] + (BEAT_STOPS[k + 1] - BEAT_STOPS[k]) * (s - k);
}

export function scrollFromProgress(p: number): number {
  const q = Math.min(4, Math.max(0, p));
  let k = 0;
  while (k < BEAT_STOPS.length - 2 && q > BEAT_STOPS[k + 1]) k++;
  return k + (q - BEAT_STOPS[k]) / (BEAT_STOPS[k + 1] - BEAT_STOPS[k]);
}

export function playProgress(seconds: number): number {
  let t = Math.max(0, seconds);
  for (let k = 0; k < PLAY.length; k++) {
    if (t <= PLAY[k]) return STOPS[k] + (STOPS[k + 1] - STOPS[k]) * (t / PLAY[k]);
    t -= PLAY[k];
  }
  return 4;
}

export function playSeconds(p: number): number {
  const q = Math.min(4, Math.max(0, p));
  let t = 0;
  for (let k = 0; k < PLAY.length; k++) {
    if (q <= STOPS[k + 1]) return t + (PLAY[k] * (q - STOPS[k])) / (STOPS[k + 1] - STOPS[k]);
    t += PLAY[k];
  }
  return t;
}
```

- [ ] **Step 4: Implement `web/src/lib/sky/arrivalPath.ts`**

```ts
import * as THREE from 'three';
import { R_MOON_M } from '../engine/constants';
import { smoother, STOPS } from './arrivalTiming';
import { dirAzEl, meToWorld, type Basis, type Vec3 } from './frames';

export * from './arrivalTiming';

const DEG = Math.PI / 180;

/** A camera: where it is (world metres), which way it looks (three's x, y, z, w), how wide (degrees, top to bottom), and a lens shift (fractions of the view; + moves the picture right and up). */
export interface Pose { position: Vec3; quaternion: [number, number, number, number]; fov: number; shift: [number, number] }
/** One stop of the flight: where the camera is, the point it looks at, the view's up, how wide and the lens shift. */
export interface Key { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; fov: number; shift: [number, number] }
/** What the flight is built from, in the stand view's world frame (x east, y up, z south, metres, origin on the site's ground). */
export interface PathInput {
  basis: Basis;
  siteHeightM: number;
  /** The eye's height at the end of the flight (world y) and the stand view's opening look. */
  eyeY: number;
  stand: { yaw: number; pitch: number; fov: number };
  /** Unit vector to the Sun at the arrival's hour. */
  sun: Vec3;
  /** Earth's place at the arrival's hour (world metres). */
  earth: Vec3;
  /** The drawn ground's height (world y) at a point: the flight keeps above it. */
  groundAt: (x: number, z: number) => number;
  /** Width over height of the view. */
  aspect: number;
}

/**
 * The flight's numbers, set by eye at the visual check within the tests' rules: the whole Moon from 9,000 km
 * with Earth beyond its south pole; the pole from 900 km; the cap from 90 km up, 150 km back, lit from the
 * side; the ridge from 2 km up, 5 km back; then the eye. Metres and degrees.
 */
export const FLIGHT = { wholeDist: 9.0e6, wholeTilt: 14, poleAlt: 9.0e5, poleFov: 40, capBack: 1.5e5, capAlt: 9.0e4, capFov: 50, ridgeBack: 5000, ridgeClear: 2000, ridgeFov: 45, wideShift: 0.17, tallShift: -0.14 } as const;

const V = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);
const tallFov = (fov: number, aspect: number) => (aspect >= 1 ? fov : Math.min(80, (2 * Math.atan(Math.tan((fov * DEG) / 2) / Math.max(aspect, 0.45))) / DEG));

export const moonCentre = (siteHeightM: number) => new THREE.Vector3(0, -(R_MOON_M + siteHeightM), 0);
const southOf = (i: PathInput) => V(meToWorld(i.basis, [0, 0, -1]));
export function polePoint(i: PathInput): Vec3 {
  const p = moonCentre(i.siteHeightM).addScaledVector(southOf(i), R_MOON_M);
  return [p.x, p.y, p.z];
}

function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, f: number): THREE.Vector3 {
  const d = Math.min(1, Math.max(-1, a.dot(b))), th = Math.acos(d);
  if (th < 1e-9) return a.clone().lerp(b, f).normalize();
  const s = Math.sin(th);
  return a.clone().multiplyScalar(Math.sin((1 - f) * th) / s).addScaledVector(b, Math.sin(f * th) / s);
}

/** The whole Moon from the far side, tilted towards the south pole, so Earth stands just beyond the pole's limb. */
function wholeMoon(i: PathInput): Key {
  const C = moonCentre(i.siteHeightM), E = V(i.earth), toEarth = E.clone().sub(C).normalize(), anti = toEarth.clone().negate();
  const towardsPole = southOf(i).addScaledVector(anti, -southOf(i).dot(anti)).normalize();
  const t = FLIGHT.wholeTilt * DEG;
  const from = C.clone().addScaledVector(anti.multiplyScalar(Math.cos(t)).addScaledVector(towardsPole, Math.sin(t)).normalize(), FLIGHT.wholeDist);
  const toC = C.clone().sub(from).normalize(), toE = E.clone().sub(from).normalize();
  const rho = Math.asin(R_MOON_M / FLIGHT.wholeDist), sep = toC.angleTo(toE), earthR = Math.asin(6371e3 / E.distanceTo(from));
  const span = rho + sep + earthR; // from the far limb to Earth's far edge
  const look = toC.clone().applyAxisAngle(new THREE.Vector3().crossVectors(toC, toE).normalize(), span / 2 - rho);
  const up = toE.clone().addScaledVector(look, -toE.dot(look)).normalize(); // Earth towards the top
  const tall = i.aspect < 1;
  const fov = Math.max((span / DEG) * 1.25, tall ? (2 * Math.atan(Math.tan(rho * 1.2) / i.aspect)) / DEG : 0);
  return { position: from, target: from.clone().addScaledVector(look, FLIGHT.wholeDist), up, fov, shift: tall ? [0, FLIGHT.tallShift] : [FLIGHT.wideShift, 0] };
}

/** Straight down on the south pole, the near side (Earth's way) at the top. */
function abovePole(i: PathInput): Key {
  const C = moonCentre(i.siteHeightM), south = southOf(i), toEarth = V(i.earth).sub(C).normalize();
  return { position: C.clone().addScaledVector(south, R_MOON_M + FLIGHT.poleAlt), target: V(polePoint(i)), up: toEarth.addScaledVector(south, -toEarth.dot(south)).normalize(), fov: tallFov(FLIGHT.poleFov, i.aspect), shift: [0, 0] };
}

/** Square to the Sun along the ground, on the side away from the pole: the camera looks past the site at it. */
function capSide(i: PathInput): THREE.Vector3 {
  const along = new THREE.Vector3(i.sun[0], 0, i.sun[2]).normalize(), side = new THREE.Vector3(-along.z, 0, along.x);
  const pole = polePoint(i);
  if (side.dot(new THREE.Vector3(pole[0], 0, pole[2]).normalize()) > 0) side.negate();
  return side;
}

function overCap(i: PathInput, side: THREE.Vector3): Key {
  const from = side.clone().multiplyScalar(FLIGHT.capBack).setY(FLIGHT.capAlt);
  return { position: from, target: V(polePoint(i)).lerp(new THREE.Vector3(0, i.groundAt(0, 0), 0), 0.5), up: new THREE.Vector3(0, 1, 0), fov: tallFov(FLIGHT.capFov, i.aspect), shift: [0, 0] };
}

function overRidge(i: PathInput, side: THREE.Vector3): Key {
  const from = side.clone().multiplyScalar(FLIGHT.ridgeBack);
  from.y = i.groundAt(from.x, from.z) + FLIGHT.ridgeClear;
  return { position: from, target: new THREE.Vector3(0, i.groundAt(0, 0), 0), up: new THREE.Vector3(0, 1, 0), fov: tallFov(FLIGHT.ridgeFov, i.aspect), shift: [0, 0] };
}

function standing(i: PathInput): Key {
  const from = new THREE.Vector3(0, i.eyeY, 0);
  return { position: from, target: from.clone().add(V(dirAzEl(i.stand.yaw, i.stand.pitch)).multiplyScalar(1000)), up: new THREE.Vector3(0, 1, 0), fov: i.stand.fov, shift: [0, 0] };
}

/** The six keys at STOPS. */
export function flightKeys(i: PathInput): Key[] {
  const side = capSide(i), pole = abovePole(i);
  return [wholeMoon(i), pole, { ...pole, position: pole.position.clone(), target: pole.target.clone(), up: pole.up.clone() }, overCap(i, side), overRidge(i, side), standing(i)];
}

/**
 * Round the Moon: the height above the sphere on a log scale, and the point under the camera along the great
 * circle as far as the height has come down (the share of the way left is the share of the height left to
 * lose), so the ground never rushes past as the camera nears it.
 */
function orbit(a: Key, b: Key, f: number, i: PathInput): THREE.Vector3 {
  const C = moonCentre(i.siteHeightM), ra = a.position.clone().sub(C), rb = b.position.clone().sub(C);
  const ha = Math.max(1, ra.length() - R_MOON_M), hb = Math.max(1, rb.length() - R_MOON_M);
  const h = Math.exp(Math.log(ha) + (Math.log(hb) - Math.log(ha)) * f);
  const left = Math.abs(ha - hb) < 1 ? 1 - f : (h - hb) / (ha - hb);
  return C.add(slerpUnit(rb.normalize(), ra.normalize(), left).multiplyScalar(R_MOON_M + h));
}

/** Down to the eye: the height above the end's ground on a log scale, the way across shrinking with it, never nearer the ground than the eye stands. */
function descend(a: Key, b: Key, f: number, i: PathInput): THREE.Vector3 {
  const g = i.groundAt(b.position.x, b.position.z), ca = Math.max(0.5, a.position.y - g), cb = Math.max(0.5, b.position.y - g);
  const clear = Math.exp(Math.log(ca) + (Math.log(cb) - Math.log(ca)) * f);
  const left = Math.abs(ca - cb) < 1e-6 ? 1 - f : (clear - cb) / (ca - cb);
  const x = b.position.x + (a.position.x - b.position.x) * left, z = b.position.z + (a.position.z - b.position.z) * left;
  return new THREE.Vector3(x, Math.max(g + clear, i.groundAt(x, z) + cb + 60 * left * left), z);
}

export function poseAt(keys: Key[], p: number, i: PathInput): Pose {
  const q = Math.min(STOPS[STOPS.length - 1], Math.max(0, p));
  let k = 0;
  while (k < STOPS.length - 2 && q > STOPS[k + 1]) k++;
  const a = keys[k], b = keys[k + 1], f = smoother((q - STOPS[k]) / (STOPS[k + 1] - STOPS[k]));
  const position = k === STOPS.length - 2 ? descend(a, b, f, i) : orbit(a, b, f, i);
  const target = a.target.clone().lerp(b.target, f);
  let up = slerpUnit(a.up, b.up, f);
  const fwd = target.clone().sub(position).normalize();
  if (Math.abs(fwd.dot(up)) > 0.999) up = new THREE.Vector3(1, 0, 0).addScaledVector(fwd, -fwd.x).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, up));
  return {
    position: [position.x, position.y, position.z],
    quaternion: [quat.x, quat.y, quat.z, quat.w],
    fov: a.fov + (b.fov - a.fov) * f,
    shift: [a.shift[0] + (b.shift[0] - a.shift[0]) * f, a.shift[1] + (b.shift[1] - a.shift[1]) * f],
  };
}
```

- [ ] **Step 5: Run them to see them pass, then the type check**

Run: `cd web && npx vitest run src/lib/sky/arrivalPath.test.ts && npx tsc --noEmit`
Expected: pass. Where a framing rule fails (Earth inside the disc, the pole off the view), change the `FLIGHT` numbers, not the test: the tests are the rules the visual check keeps.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/sky/arrivalTiming.ts web/src/lib/sky/arrivalPath.ts web/src/lib/sky/arrivalPath.test.ts
git commit -m "feat(web): the arrival's flight: keyframes from the real Sun and Earth, the pose at any progress, the month's sweep, scroll and play timing"
```

### Task 6: The arrival on the home page

**Files:**
- Create: `web/src/lib/viz/standOpening.ts` (+ test), `web/src/components/home/Arrival.tsx`, `web/src/components/home/ArrivalCanvas.tsx`, `web/src/components/home/Arrival.test.tsx`, `web/src/components/home/ArrivalCanvas.test.tsx`
- Modify: `web/src/components/stand/StandView.tsx` (use `standLander`, `openingYaw`), `web/src/app/page.tsx`, `web/src/app/page.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 to 5.
- Produces: `standLander(series: Series, power: PowerResult, tall: boolean): NonNullable<StandScene['lander']>`; `openingYaw(series, hour, tall, withLander): number`; `Arrival({ words, Stage? })`; `ArrivalCanvas` (default export) with `StageProps { progress: { current: number }; reduced: boolean; capture?: boolean; onLive(): void; onFail(why: string): void; createRenderer?; loaders? }`; `ArrivalLoaders`, `browserArrivalLoaders(siteId)`, `arrivalScene(h, sky, globe, levels)`, `pathInput(h, scene, aspect)`, `ARRIVAL_CAP_HALF_PX = 480`.

- [ ] **Step 1: Move the lander's place and the opening into `lib/viz/standOpening.ts`**, test first (`standOpening.test.ts`): for the hero series, `standLander(series, power, false).azDeg` is 40° left of the first hour's Sun, `distM` 16, `faceAzDeg` 75° left of it; on a tall screen 20° left; `openingYaw(series, 10, false, true)` is the hour's Sun azimuth − 35°, tall − 15°, and without a lander the Sun's own azimuth; at night with Earth up, Earth's azimuth. Then the module, with the constants and the comment block from `StandView.tsx` (`LANDER_DIST_M`, `LANDER_FACE_LEFT_DEG`, `landerFromSun`, `openFromSun`, `openingAnchor`), and StandView importing them; its tests stay green.

```ts
import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import type { StandScene } from '../sky/standRenderer';

/** (The comment block from StandView, moved: the lander 16 m away, 40° left of the Sun at the period's first hour, 20° on a tall screen; the view 35° left of the Sun, 15° on a tall screen.) */
export const LANDER_DIST_M = 16;
const LANDER_FACE_LEFT_DEG = 75;
const landerFromSun = (tall: boolean) => (tall ? -20 : -40);
const openFromSun = (tall: boolean) => (tall ? landerFromSun(true) + 5 : -35);

/** What the first view looks towards: the Sun when any of it is up, else Earth when it is in view, else where the Sun is. */
export function openingAnchor(series: Pick<Series, 'sunFraction' | 'earthVisible' | 'sunAz' | 'earthAz'>, hour: number): number {
  if (series.sunFraction[hour] > 0) return series.sunAz[hour];
  if (series.earthVisible[hour] === 1) return series.earthAz[hour];
  return series.sunAz[hour];
}

export function standLander(series: Series, power: PowerResult, tall: boolean): NonNullable<StandScene['lander']> {
  return { azDeg: (openingAnchor(series, 0) + landerFromSun(tall) + 360) % 360, distM: LANDER_DIST_M, powered: power.powered, faceAzDeg: (series.sunAz[0] - LANDER_FACE_LEFT_DEG + 360) % 360, earthAzDeg: series.earthAz[0], earthElDeg: series.earthEl[0] };
}

/** Where the first view faces at `hour` (the night with Earth up turns to Earth, 4° left). */
export function openingYaw(series: Series, hour: number, tall: boolean, withLander: boolean): number {
  const onEarth = series.sunFraction[hour] === 0 && series.earthVisible[hour] === 1;
  return (openingAnchor(series, hour) + (onEarth ? -4 : withLander ? openFromSun(tall) : 0) + 360) % 360;
}
```

- [ ] **Step 2: Write the failing component tests**

`web/src/components/home/Arrival.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arrivalWords } from '@/lib/viz/arrival';
import { BEAT_STOPS } from '@/lib/sky/arrivalTiming';
import { Arrival } from './Arrival';
import type { StageProps } from './ArrivalCanvas';

vi.mock('./ArrivalCanvas', () => ({ default: () => null }));
const words = arrivalWords();
const plain = (t: string) => t.replace(/ /g, ' ');
let stage: StageProps | null = null;
const Stage = (p: StageProps) => {
  stage = p;
  return null;
};
/** As if the page were scrolled `screens` screens into the arrival. */
function scrolled(screens: number) {
  const section = document.querySelector('[data-arrival]') as HTMLElement;
  vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ top: -screens * window.innerHeight } as DOMRect);
  fireEvent.scroll(window);
}

describe('the arrival', () => {
  beforeEach(() => {
    stage = null;
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('reads in order without the pictures: the headline, the three beats, then the answer for the site and its two actions', () => {
    const { container } = render(<Arrival words={words} Stage={Stage} />);
    const text = plain(container.textContent ?? '');
    const order = ['See when a Moon lander has sunlight and a signal.', ...words.beats, plain(words.siteLine), plain(words.answer), 'Explore this site', 'Choose a landing site'];
    let at = -1;
    for (const part of order) {
      const k = text.indexOf(part, at + 1);
      expect(k, part).toBeGreaterThan(at);
      at = k;
    }
    expect(screen.getByRole('link', { name: 'Explore this site' }).getAttribute('href')).toBe(words.exploreHref);
    expect(screen.getByRole('link', { name: 'Choose a landing site' }).getAttribute('href')).toBe('/sites');
    expect(screen.getByRole('heading', { level: 2, name: plain(words.answer) })).toBeTruthy();
  });

  it('follows the scroll: each screen is its beat’s stop, and Skip shows only between the first screen and the last', () => {
    render(<Arrival words={words} Stage={Stage} />);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    scrolled(2);
    expect(stage!.progress.current).toBeCloseTo(BEAT_STOPS[2], 6);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 4 * window.innerHeight - 2 * window.innerHeight, behavior: 'instant' });
    scrolled(4);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('plays fifteen seconds of flight from Explore a landing site, and stops the moment the visitor scrolls', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(0);
    fireEvent.click(screen.getByRole('link', { name: 'Explore a landing site' }));
    act(() => vi.advanceTimersByTime(2000));
    const calls = (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(calls).toBeGreaterThan(10);
    fireEvent.wheel(window);
    act(() => vi.advanceTimersByTime(5000));
    expect((window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    expect(screen.getByRole('link', { name: 'Explore a landing site' }).getAttribute('href')).toBe('/sites'); // still a link without the script
  });

  it('with reduced motion lands at once and holds the flight on the beats', () => {
    // jsdom has no matchMedia: this one says the system asks for reduced motion.
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    render(<Arrival words={words} Stage={Stage} />);
    scrolled(1.4);
    expect(stage!.progress.current).toBe(BEAT_STOPS[1]);
    expect(stage!.reduced).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'Explore a landing site' }));
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('shows the stills when the live view cannot draw, beat by beat', () => {
    const { container } = render(<Arrival words={words} Stage={Stage} />);
    act(() => stage!.onFail('WebGL 2 is not available'));
    scrolled(3);
    const shown = [...container.querySelectorAll('[data-still]')].filter((n) => n.getAttribute('data-shown') === '1');
    expect(shown.map((n) => n.getAttribute('data-still'))).toEqual(['3']);
    expect(shown[0].querySelector('img')!.getAttribute('src')).toBe('/arrival/beat-3-wide.jpg');
  });
});
```

`web/src/components/home/ArrivalCanvas.test.tsx` (jsdom, stub renderer, stub loaders):

```tsx
// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StandScene } from '@/lib/sky/standRenderer';
import ArrivalCanvas, { type ArrivalLoaders, type ArrivalRenderer } from './ArrivalCanvas';

const sky = { stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() }, moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) }, earthDayUrl: '', earthCloudsUrl: '' };
const globe = { color: { low: 'a', high: 'b' }, normal: { low: 'c', high: 'd' }, heights: { width: 4, height: 2, metres: new Float32Array(8) }, albedoScale: 1, credit: '' };
/** A level stand-in for the south cap, with the real cap's numbers: 1940 cells of 960 m, the pole in the middle. */
const cap = () => ({ meta: { width: 1940, height: 1940, cell_m: 960, site_col_px: 969.5, site_row_px: 969.5, site_height_m: 0, row0: 0, col0: 0, line_offset_px: 969.5, sample_offset_px: 969.5, min_m: 0, scale_m_per_unit: 1 }, heightsM: new Float32Array(1940 * 1940) });

function stub() {
  const scenes: StandScene[] = [];
  const r = { setTime: vi.fn(), setPose: vi.fn(), setScene: vi.fn((s: StandScene) => scenes.push(s)), setGuides: vi.fn(), resize: vi.fn(), render: vi.fn(), project: vi.fn(() => ({ x: 0.5, y: 0.5, visible: true })), labels: vi.fn(() => ({ sun: { x: 0.5, y: 0.5, visible: true } })), dispose: vi.fn(), ready: Promise.resolve() };
  return { r: r as unknown as ArrivalRenderer & typeof r, scenes };
}

describe('the arrival’s live stage', () => {
  it('flies over the globe alone first, then hands the renderer the ground with the lander when it comes', async () => {
    const { r, scenes } = stub();
    let landTerrain!: (t: Awaited<ReturnType<ArrivalLoaders['terrain']>>) => void;
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise((res) => { landTerrain = res; }) };
    const first: StandScene[] = [];
    const progress = { current: 0 };
    const onLive = vi.fn();
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={onLive} onFail={vi.fn()} loaders={loaders} createRenderer={(_c, s) => { first.push(s); return r; }} />);
    await waitFor(() => expect(first).toHaveLength(1));
    expect(first[0].ground).toBe(false);
    expect(first[0].globe).toBe(globe);
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    await waitFor(() => expect(onLive).toHaveBeenCalled());
    landTerrain({ cap: cap() as never, window: null, context: null });
    await waitFor(() => expect(scenes).toHaveLength(1));
    expect(scenes[0].ground).toBe(true);
    expect(scenes[0].lander?.distM).toBe(16);
  });

  it('builds a new pose when the view changes shape, at the same progress', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const { container } = render(<ArrivalCanvas progress={{ current: 2 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    const before = (r.setPose as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].fov;
    const canvas = container.querySelector('canvas')!;
    Object.defineProperty(canvas, 'clientWidth', { value: 390, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 844, configurable: true });
    await waitFor(() => expect((r.setPose as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].fov).not.toBe(before));
  });

  it('gives way to the stills when the Moon’s files do not load, and lets the renderer go when it leaves', async () => {
    const { r } = stub();
    const onFail = vi.fn();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => { throw new Error('404'); }, terrain: () => new Promise(() => {}) };
    render(<ArrivalCanvas progress={{ current: 0 }} reduced={false} onLive={vi.fn()} onFail={onFail} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(onFail).toHaveBeenCalled());
    const ok: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const { unmount } = render(<ArrivalCanvas progress={{ current: 0 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={ok} createRenderer={() => r} />);
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    unmount();
    expect(r.dispose).toHaveBeenCalled();
  });
});
```

In `web/src/app/page.test.tsx`: add `vi.mock('@/components/home/ArrivalCanvas', () => ({ default: () => null }));`; the hero test: two gold actions in the arrival, "Explore a landing site" (`/sites`) on the first screen and "Explore this site" (`/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30`) on the last, each the only gold on its screen (`[data-beat]` blocks); the forecast band is found with `screen.getByRole('figure', …)` (no longer inside the hero); the end test counts three gold buttons on the page, never two on one screen.

- [ ] **Step 3: Run them to see them fail**

Run: `cd web && npx vitest run src/components/home src/app/page.test.tsx src/lib/viz/standOpening.test.ts`
Expected: FAIL, modules not found; the page's figure tests fail on the new order.

- [ ] **Step 4: Implement `ArrivalCanvas.tsx`**

```tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGlobeAssets, type GlobeAssets } from '@/lib/data/globe';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { contextFileFor, loadHeightmap, loadTerrainManifest, shadowLevels, windowFileFor, type Heightmap } from '@/lib/data/terrain';
import type { Level } from '@/lib/engine/shadow';
import { flightKeys, hourAt, polePoint, poseAt, SWEEP, type Key, type PathInput } from '@/lib/sky/arrivalPath';
import { dirAzEl, enuBasis } from '@/lib/sky/frames';
import { eyeAt, StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, meshHeightAt, terrainField } from '@/lib/sky/terrainField';
import { HERO_HOUR, hero, type Hero } from '@/lib/viz/arrival';
import { dateLong } from '@/lib/viz/format';
import { skyLabel } from '@/lib/viz/stand';
import { openingYaw, standLander } from '@/lib/viz/standOpening';

/** The renderer as the arrival drives it; a stub in tests. */
export type ArrivalRenderer = Pick<StandRenderer, 'setTime' | 'setPose' | 'setScene' | 'resize' | 'render' | 'project' | 'labels' | 'dispose'> & { ready?: Promise<void>; onLost?: (why: string) => void; onSharp?: () => void };
/** What the arrival loads: the sky, the Moon from space, and the hero site's measured ground. */
export interface ArrivalLoaders { sky: () => Promise<SkyAssets>; globe: () => Promise<GlobeAssets>; terrain: () => Promise<{ cap: Heightmap; window: Heightmap | null; context: Heightmap | null }> }
/** 960 m cells each way round the site: the cap reaches 460 km, so shadows out to 200 km have their hills. */
export const ARRIVAL_CAP_HALF_PX = 480;

export function browserArrivalLoaders(siteId: string, base = dataBase()): ArrivalLoaders {
  return {
    sky: () => loadSkyAssets(base),
    globe: () => loadGlobeAssets(base),
    terrain: async () => {
      const m = await loadTerrainManifest(base), w = windowFileFor(m, siteId), c = contextFileFor(m, siteId);
      const [cap, window, context] = await Promise.all([
        loadHeightmap(base, m.cap.file, m.cap.meta),
        w ? loadHeightmap(base, w.file, w.meta) : Promise.resolve(null),
        c ? loadHeightmap(base, c.file, c.meta).catch(() => null) : Promise.resolve(null),
      ]);
      return { cap, window, context };
    },
  };
}

export interface StageProps {
  /** The flight's progress, 0 (the Moon from space) to 4 (standing), read every frame. */
  progress: { current: number };
  reduced: boolean;
  /** For stills and the recorded walk: window.__arrival sets the progress and waits for a sharp frame. */
  capture?: boolean;
  onLive: () => void;
  onFail: (why: string) => void;
  createRenderer?: (canvas: HTMLCanvasElement, scene: StandScene) => ArrivalRenderer;
  loaders?: ArrivalLoaders;
}

const isTall = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
const fast = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('quality') === 'fast';

/** The scene for what has loaded: the sky and the globe, then the measured ground with the lander once it comes. */
export function arrivalScene(h: Hero, sky: SkyAssets, globe: GlobeAssets, levels: Level[] | null): StandScene {
  const ground = !!levels && levels.length > 0;
  return {
    field: ground ? terrainField(levels!, h.site.lon, h.siteHeightM) : flatField(h.site.lon),
    mask: { az0: 0, step: 360 / h.mask.length, el: h.mask },
    series: h.series, startUtc: h.startUtc, site: h.site, mastM: 2, sky, quality: fast() ? 'fast' : 'full',
    globe, siteHeightM: h.siteHeightM, earthKm: h.earthKm, ground,
    lander: ground ? standLander(h.series, h.power, isTall()) : undefined,
  };
}

/** The flight's input for a scene and a view's shape: the Sun and Earth at the arrival's hour. */
export function pathInput(h: Hero, scene: StandScene, aspect: number): PathInput {
  const s = h.series, t = HERO_HOUR, eye = eyeAt(scene), e = dirAzEl(s.earthAz[t], s.earthEl[t]), m = h.earthKm[t] * 1000;
  return {
    basis: enuBasis(h.site.lat, h.site.lon), siteHeightM: h.siteHeightM, eyeY: eye,
    stand: { yaw: openingYaw(s, t, aspect < 1, !!scene.lander), pitch: 2, fov: aspect < 1 ? 80 : 60 },
    sun: dirAzEl(s.sunAz[t], s.sunEl[t]), earth: [e[0] * m, eye + e[1] * m, e[2] * m],
    groundAt: (x, z) => meshHeightAt(scene.field, x, z), aspect,
  };
}

const LABEL = 'pointer-events-none absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-[5px] border border-white/15 bg-black/75 px-2 py-1 text-[15px]';
type Tag = 'earth' | 'pole' | 'site' | 'sun';

/**
 * The arrival's live stage: the Moon from space down to the stand view, by the flight's progress. It starts
 * on the sky and the globe and swaps in the measured ground when it comes; labels name Earth and the pole from
 * space, the site on the way down and the Sun once standing; during the sweep a line gives the date.
 */
export default function ArrivalCanvas({ progress, reduced, capture = false, onLive, onFail, createRenderer = (c, s) => new StandRenderer(c, s), loaders }: StageProps) {
  const h = useMemo(() => hero(), []);
  const load = useMemo(() => loaders ?? browserArrivalLoaders(h.site.id), [loaders, h]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tags = useRef<Record<Tag, HTMLSpanElement | null>>({ earth: null, pole: null, site: null, sun: null });
  const dateRef = useRef<HTMLParagraphElement>(null);
  const [sky, setSky] = useState<SkyAssets | null>(null);
  const [globe, setGlobe] = useState<GlobeAssets | null>(null);
  const [levels, setLevels] = useState<Level[] | null>(null);
  const failRef = useRef(onFail), liveRef = useRef(onLive), reducedRef = useRef(reduced);
  useEffect(() => {
    failRef.current = onFail;
    liveRef.current = onLive;
    reducedRef.current = reduced;
  });

  useEffect(() => {
    let alive = true;
    load.sky().then((a) => alive && setSky(a), () => alive && failRef.current('The sky did not load'));
    load.globe().then((g) => alive && setGlobe(g), () => alive && failRef.current('The Moon did not load'));
    // The measured ground is an extra: without it the flight goes on over the globe.
    load.terrain().then((t) => alive && setLevels(shadowLevels(h.site, t.window, t.context, t.cap, ARRIVAL_CAP_HALF_PX)), () => {});
    return () => {
      alive = false;
    };
  }, [load, h]);

  const scene = useMemo(() => (sky && globe ? arrivalScene(h, sky, globe, levels) : null), [h, sky, globe, levels]);
  const sceneRef = useRef(scene);
  const rRef = useRef<ArrivalRenderer | null>(null);
  useEffect(() => {
    // A later scene (the ground arrived) replaces the one on the screen once it is built.
    if (scene && rRef.current && sceneRef.current !== scene) rRef.current.setScene(scene);
    sceneRef.current = scene;
  }, [scene]);

  const started = scene !== null;
  useEffect(() => {
    const el = canvas.current, first = sceneRef.current;
    if (!started || !el || !first) return;
    let r: ArrivalRenderer;
    try {
      r = createRenderer(el, first);
    } catch (e) {
      failRef.current(e instanceof Error ? e.message : String(e));
      return;
    }
    rRef.current = r;
    let alive = true, raf = 0, drawn = false, live = false;
    const fail = (why: string) => alive && failRef.current(why);
    r.onLost = fail;
    void Promise.resolve(r.ready).then(() => { drawn = true; }, (e: unknown) => fail(e instanceof Error ? e.message : String(e)));
    const lost = (e: Event) => {
      e.preventDefault();
      fail('The graphics context was lost');
    };
    el.addEventListener('webglcontextlost', lost);
    let sharp: (() => void) | null = null;
    r.onSharp = () => {
      sharp?.();
      sharp = null;
    };
    const hook = window as unknown as { __arrival?: { setProgress: (p: number) => void; sharp: () => Promise<void> } };
    if (capture) hook.__arrival = { setProgress: (p) => { progress.current = p; }, sharp: () => new Promise<void>((res) => { sharp = res; }) };
    let keys: Key[] = [], input: PathInput | null = null, keyed: { scene: StandScene | null; aspect: number } = { scene: null, aspect: 0 };
    const show = (k: Tag, at: { x: number; y: number; visible: boolean } | null) => {
      const n = tags.current[k];
      if (!n) return;
      n.hidden = !(drawn && at && at.visible);
      if (!n.hidden && at) {
        n.style.left = `${at.x * 100}%`;
        n.style.top = `${at.y * 100}%`;
      }
    };
    const tick = () => {
      const s = sceneRef.current!;
      const W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight, aspect = W / H;
      if (keyed.scene !== s || Math.abs(keyed.aspect - aspect) > 1e-3) {
        r.resize(W, H);
        input = pathInput(h, s, aspect);
        keys = flightKeys(input);
        keyed = { scene: s, aspect };
      }
      const p = progress.current, hour = hourAt(p, HERO_HOUR, reducedRef.current);
      r.setTime(hour);
      r.setPose(poseAt(keys, p, input!));
      r.render();
      if (drawn && !live) {
        live = true;
        liveRef.current();
      }
      show('earth', p < 0.85 ? r.project(input!.earth, true) : null);
      show('pole', p < 2.6 ? r.project(polePoint(input!), true) : null);
      show('site', p > 1.6 && p < 3.8 ? r.project([0, input!.groundAt(0, 0), 0], true) : null);
      show('sun', p > 3.8 ? r.labels().sun : null);
      const d = dateRef.current;
      if (d) {
        d.hidden = !(p > SWEEP.from && p < SWEEP.to);
        if (!d.hidden) d.textContent = dateLong(h.startUtc, Math.round(hour));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      el.removeEventListener('webglcontextlost', lost);
      r.dispose();
      rRef.current = null;
      if (capture) delete hook.__arrival;
    };
  }, [started, createRenderer, capture, h, progress]);

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <span ref={(n) => { tags.current.earth = n; }} hidden className={`${LABEL} text-[#74adff]`}>Earth</span>
        <span ref={(n) => { tags.current.pole = n; }} hidden className={LABEL}>The Moon&apos;s south pole</span>
        <span ref={(n) => { tags.current.site = n; }} hidden className={`${LABEL} text-[#f6d48a]`}>{siteLabel(h.site)}</span>
        <span ref={(n) => { tags.current.sun = n; }} hidden className={`${LABEL} text-[#f6b646]`}>{skyLabel('sun', h.series, HERO_HOUR)}</span>
        <p ref={dateRef} hidden className="absolute left-1/2 top-6 -translate-x-1/2 rounded-[5px] border border-white/15 bg-black/75 px-3 py-1 text-[16px] text-[#f6d48a]" />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Implement `Arrival.tsx`**

```tsx
'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType, type MouseEvent } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { BEAT_STOPS, playProgress, playSeconds, progressFromScroll, scrollFromProgress } from '@/lib/sky/arrivalTiming';
import type { ArrivalWords } from '@/lib/viz/arrival';
import type { StageProps } from './ArrivalCanvas';

// three.js comes with the stage, after the page's words: nothing on this module's import path pulls it in.
const LiveStage = dynamic(() => import('./ArrivalCanvas'), { ssr: false });
/** The first screen and the four beats, a screen of scrolling each. */
const BEATS = 5;
const PLATE = 'rounded-lg border border-white/15 bg-[#060607]/85 backdrop-blur-sm';
const SENTENCE = 'display text-balance text-[28px] leading-[1.08] sm:text-[36px]';
const still = (k: number, shape: 'wide' | 'tall') => `/arrival/beat-${k}-${shape}.jpg`;

/**
 * The home page's arrival: the Moon from space, then four beats down to standing at the hero site, as the
 * page scrolls (a screen a beat) or as "Explore a landing site" plays it (fifteen seconds). The sentences are
 * page text in reading order; the pictures are a live stage, with stills beat by beat before it draws, when
 * it cannot, and as the first paint. Skip, while the arrival is part-way, lands on standing. With reduced
 * motion the flight holds on the beats and "Explore a landing site" lands at once.
 */
export function Arrival({ words, Stage = LiveStage }: { words: ArrivalWords; Stage?: ComponentType<StageProps> }) {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const standing = useRef<HTMLHeadingElement>(null);
  const progress = useRef(0);
  const [beat, setBeat] = useState(0);
  const [moving, setMoving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  // ?arrival=<progress> holds the flight there for stills and the recorded walk; &bare=1 leaves the words out.
  const [capture] = useState<{ at: number; bare: boolean } | null>(() => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search), at = q.get('arrival');
    return at === null || !Number.isFinite(Number(at)) ? null : { at: Math.min(4, Math.max(0, Number(at))), bare: q.get('bare') === '1' };
  });
  useEffect(() => {
    if (capture) progress.current = capture.at;
  }, [capture]);

  /** Screens scrolled past the arrival's top, 0 to 4. */
  const screens = () => {
    const el = section.current;
    return el ? Math.min(BEATS - 1, Math.max(0, -el.getBoundingClientRect().top / (window.innerHeight || 1))) : 0;
  };
  /** Scrolls the page to `s` screens into the arrival. */
  const goTo = (s: number) => {
    const el = section.current;
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + s * window.innerHeight, behavior: 'instant' });
  };

  useEffect(() => {
    if (capture) return;
    const onScroll = () => {
      const s = screens();
      progress.current = reduced ? BEAT_STOPS[Math.round(s)] : progressFromScroll(s);
      setBeat(Math.round(s));
      setMoving(s > 0.05 && s < BEATS - 1.05);
    };
    const id = requestAnimationFrame(onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, capture]);

  // Play: the page scrolls through the arrival by itself; a wheel, a touch or a key stops it where it is.
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now(), from = playSeconds(progressFromScroll(screens()));
    let raf = 0;
    const tick = (now: number) => {
      const p = playProgress(from + (now - t0) / 1000);
      goTo(scrollFromProgress(p));
      if (p >= 4) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = () => setPlaying(false);
    const kinds = ['wheel', 'touchstart', 'keydown'] as const;
    for (const k of kinds) window.addEventListener(k, stop, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      for (const k of kinds) window.removeEventListener(k, stop);
    };
  }, [playing]);

  const land = () => {
    setPlaying(false);
    goTo(BEATS - 1);
    standing.current?.focus({ preventScroll: true });
  };
  const start = (e: MouseEvent) => {
    e.preventDefault();
    if (reduced) land();
    else setPlaying(true);
  };
  const bare = capture?.bare ?? false;

  return (
    <section ref={section} aria-labelledby="h-hero" data-arrival="" className="theme-dark relative bg-black text-[#f2f0ea]" style={{ height: `${BEATS * 100}svh` }}>
      <div aria-hidden="true" className="sticky top-0 h-[100svh] overflow-hidden">
        {Array.from({ length: BEATS }, (_, k) => {
          const shown = k === beat && (!live || failed);
          return (
            <picture key={k} data-still={k} data-shown={shown ? '1' : '0'} className={`absolute inset-0 transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-0'}`}>
              <source media="(orientation: portrait)" srcSet={still(k, 'tall')} />
              <img src={still(k, 'wide')} alt="" loading={k === 0 ? 'eager' : 'lazy'} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
            </picture>
          );
        })}
        {!failed && (
          <div className={`absolute inset-0 transition-opacity duration-500 ${live ? 'opacity-100' : 'opacity-0'}`}>
            <Stage progress={progress} reduced={reduced} capture={!!capture} onLive={() => setLive(true)} onFail={() => setFailed(true)} />
          </div>
        )}
      </div>
      {(moving || playing) && !capture && (
        <button type="button" onClick={land} className="btn fixed bottom-6 right-6 z-20 border-white/30 bg-black/70">
          Skip
        </button>
      )}
      <div className="relative z-10 -mt-[100svh]" hidden={bare}>
        <div data-beat="0" className="flex h-[100svh] flex-col justify-between pb-8 pt-8 sm:pt-12">
          <div className="wrap w-full">
            <h1 id="h-hero" className="display max-w-[760px] text-balance text-[44px] leading-[0.98] sm:text-[56px] xl:text-[72px]">
              See when a Moon lander has sunlight and a signal.
            </h1>
            <p className="mt-6 max-w-[33em] text-lg leading-relaxed text-[#c6c5c0] sm:text-[19px]">
              At the Moon&apos;s south pole the Sun and Earth never climb high. They skim the horizon, and one hill can hide them for weeks. Pick a landing site and a date:
              Earthrise shows the hours of sunlight, the hours of radio contact with Earth, and how long a solar lander keeps power there.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/sites" onClick={start} className="btn btn-primary h-[52px] px-[22px] text-[17px]">
                Explore a landing site
              </Link>
              <a href="#why" className="btn h-[52px] px-[22px] text-[17px]">
                See how it works
              </a>
            </div>
            <p className="mt-3 text-base text-[#c6c5c0]">For mission planners, educators and anyone curious.</p>
          </div>
          <p className="wrap w-full text-[15px] text-[#c6c5c0]">Scroll to fly down to the Moon&apos;s south pole.</p>
        </div>
        {words.beats.map((text, k) => (
          <div key={text} data-beat={k + 1} className="flex h-[100svh] items-end pb-24 sm:items-center sm:pb-0">
            <div className="wrap w-full">
              <p className={`${PLATE} ${SENTENCE} max-w-[600px] p-5 sm:p-6`}>{text}</p>
            </div>
          </div>
        ))}
        <div data-beat="4" className="flex h-[100svh] items-end pb-12 sm:items-center sm:pb-0">
          <div className="wrap w-full">
            <div className={`${PLATE} max-w-[600px] p-5 sm:p-6`}>
              <p className="text-[15px] text-[#c6c5c0]">{words.siteLine}</p>
              <h2 ref={standing} tabIndex={-1} className="display mt-2 text-pretty text-[24px] leading-tight focus:outline-none sm:text-[30px]">
                {words.answer}
              </h2>
              {words.better && <p className="mt-2 text-base text-[#f6d48a]">{words.better}</p>}
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={words.exploreHref} className="btn btn-primary">
                  Explore this site
                </Link>
                <Link href="/sites" className="btn">
                  Choose a landing site
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: The page** (`app/page.tsx`): `const words = arrivalWords();` and `<Arrival words={words} />` in place of the hero's text block; the forecast `figure` moves out of the arrival's section to follow it directly in `main` (unchanged inside); the rest unchanged. Remove the now-unused hero imports.

- [ ] **Step 7: Run the tests, the whole suite, types, lint, build**

Run: `cd web && npx vitest run src/components/home src/app/page.test.tsx src/lib/viz && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; the build lists `/` as static. Where the React Compiler lint objects to a state set in an effect, move it into the event callback or an animation frame (as `onScroll` is), not a lint exception.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/viz/standOpening.ts web/src/lib/viz/standOpening.test.ts web/src/components/home/Arrival.tsx web/src/components/home/ArrivalCanvas.tsx web/src/components/home/Arrival.test.tsx web/src/components/home/ArrivalCanvas.test.tsx web/src/components/stand/StandView.tsx web/src/app/page.tsx web/src/app/page.test.tsx
git commit -m "feat(web): the arrival on the home page: the Moon from space to standing at the site in four beats, by scroll or Play, with Skip, stills and reduced motion"
```

### Task 7: The visual checkpoint, and the mockup to the user

- [ ] **Step 1: Production build on a fresh loopback host.** `cd web && npm run build && npm run start` (in the background); the browser at `http://127.0.0.2:3000/` (check `devicePixelRatio === 1`; a used host carries a zoom, see the browser-zoom reference memory), viewport 1440 × 900.
- [ ] **Step 2: Look at every beat.** For `p` in 0, 0.5, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4: `/?arrival=<p>` with and without `&bare=1`; save screenshots under `.playwright-mcp/arrival/`. Then 390 × 844. Check: the Moon reads at once as the Moon, Earth is beyond it, the terminator crosses the south pole; the pole's month sweep turns the light round the pole; the cap shows long shadows; the ridge is lit from the side; the last frame matches `/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10`.
- [ ] **Step 3: Measure.** Every text at least 14 px, every control at least 40 px tall, no sideways scroll (`document.documentElement.scrollWidth <= innerWidth`), on both sizes; Skip visible mid-arrival; Play takes about 15 s from the first screen to standing.
- [ ] **Step 4: Tune by eye within the rules.** Change only `FLIGHT` (framing), the globe's exposure (`SPACE_GAIN`, `SPACE_STARS`) and the stage's label windows; rerun `npx vitest run src/lib/sky src/components/home` after each change. Ledger each change that moves a rule as a ruling.
- [ ] **Step 5: Send the stills to the user as the arrival's mockup** (the UI rule: a rendered mockup before a UI direction is built out): the five beats wide, one tall, with one line ("Part B, the arrival, first live renders: building on; say if the direction is wrong"). Do not wait: carry on with Task 8 and fold any answer into the next task.

### Task 8: The month's paths in the scene

**Files:**
- Modify: `web/src/lib/sky/standRenderer.ts`, `web/src/lib/sky/standRenderer.test.ts`, `web/src/components/stand/StandCanvas.tsx`, `web/src/components/stand/StandCanvas.test.ts`, `web/src/components/stand/StandView.tsx`, `web/src/components/stand/StandView.test.tsx`

**Interfaces:**
- Produces: `StandScene.marks?: { hour: number; body: 'sun' | 'earth'; text: string }[]`; `buildScene(...).setGuides(on: boolean)`, `parts.guides: THREE.Group`, `parts.markers: { sun: THREE.Sprite; earth: THREE.Sprite }`; `SkyLabels.marks?: (Spot & { text: string })[]`; `StandRenderer.setGuides(on)`; `RendererLike` gains `setGuides?`; `levelY(pitchDeg: number, fovDeg: number): number` in `StandCanvas.tsx`.

- [ ] **Step 1: Write the failing tests** (standRenderer.test.ts)

```ts
describe('the guides', () => {
  it('draws the Sun’s and Earth’s paths through the period’s hours, faint through the hills and solid over them, and the level horizon all round', () => {
    const s = buildScene(flat());
    const bands = s.parts.guides.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect(bands).toHaveLength(5); // the Sun faint and solid, Earth faint and solid, the level line
    const faint = bands.filter((b) => !(b.material as THREE.MeshBasicMaterial).depthTest);
    expect(faint).toHaveLength(3);
    // The Sun's band passes through the hour's direction: the mid-point of its first pair of vertices.
    const p = bands[0].geometry.getAttribute('position'), mid = new THREE.Vector3((p.getX(0) + p.getX(1)) / 2, (p.getY(0) + p.getY(1)) / 2, (p.getZ(0) + p.getZ(1)) / 2);
    expect(elevationDeg(mid)).toBeCloseTo(2, 2);
    expect(p.count).toBe(2 * series.hours);
  });

  it('rings a Sun the hills hide, where it sits, and none while any of it shows', () => {
    const s = buildScene(flat());
    s.update(2); // sunFraction 0
    expect(s.parts.markers.sun.visible).toBe(true);
    expect(elevationDeg(s.parts.markers.sun.position)).toBeCloseTo(-1, 1);
    s.update(0);
    expect(s.parts.markers.sun.visible).toBe(false);
  });

  it('hides the guides with the words', () => {
    const s = buildScene(flat());
    s.setGuides(false);
    expect(s.parts.guides.visible).toBe(false);
  });

  it('marks the key moments’ days on the paths, for labels', () => {
    const s = buildScene(flat({ marks: [{ hour: 1, body: 'sun', text: '3 Jan' }] }));
    s.update(0);
    s.setView(300, 2, 60, 16 / 9);
    expect(s.labels().marks).toEqual([expect.objectContaining({ text: '3 Jan', visible: true })]);
  });
});
```

In `StandCanvas.test.ts`: `levelY(0, 60)` is 0.5; `levelY(10, 60)` is below the middle (`> 0.5`). In `StandView.test.tsx`: with the stub renderer, the chip "3 Jan" (the first sunset's day) is shown on the path; "Hide the words" calls `setGuides(false)` and hides the chips; a "Level horizon" chip is shown.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky/standRenderer.test.ts src/components/stand`
Expected: FAIL on `parts.guides`, `markers`, `setGuides`, `marks`, `levelY`.

- [ ] **Step 3: Implement.** In `buildScene`, a `guides` group inside `sky`:

```ts
  // The guides (hidden with the words): the month's paths of the Sun and Earth, solid where they clear the skyline
  // and faint where the hills hide them; the level horizon all round, faint; a ring where a hidden body sits.
  const guides = new THREE.Group();
  sky.add(guides);
  const RG = RS * 0.98;
  /** A band 0.15° tall along directions on the sky, as a mesh: WebGL draws lines a pixel thin. */
  const band = (dirs: Vec3[], colour: number, faint: boolean, opacity: number) => {
    const n = dirs.length, pos = new Float32Array(n * 6), idx: number[] = [], half = RG * Math.tan(0.075 * DEG);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(...dirs[i]).normalize(), up = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize(), c = d.clone().multiplyScalar(RG);
      pos.set([c.x + up.x * half, c.y + up.y * half, c.z + up.z * half, c.x - up.x * half, c.y - up.y * half, c.z - up.z * half], i * 6);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, depthTest: !faint, side: THREE.DoubleSide, toneMapped: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = faint ? 1 : 2;
    return mesh;
  };
  const along = (az: ArrayLike<number>, el: ArrayLike<number>) => Array.from({ length: scene.series.hours }, (_, h) => dirAzEl(az[h], el[h]));
  const sunDirs = along(scene.series.sunAz, scene.series.sunEl), earthDirs = along(scene.series.earthAz, scene.series.earthEl);
  guides.add(band(sunDirs, 0xf6b646, false, 0.9), band(sunDirs, 0xf6b646, true, 0.3), band(earthDirs, 0x74adff, false, 0.9), band(earthDirs, 0x74adff, true, 0.3), band(Array.from({ length: 361 }, (_, k) => dirAzEl(k, 0)), 0xffffff, true, 0.18));
  const ring = (colour: number, degrees: number) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture((g) => { g.strokeStyle = '#fff'; g.lineWidth = 36; g.beginPath(); g.arc(256, 256, 200, 0, 2 * Math.PI); g.stroke(); }), color: colour, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0.85 }));
    s.scale.setScalar(2 * RG * Math.tan((degrees * DEG) / 2));
    s.visible = false;
    s.renderOrder = 3;
    guides.add(s);
    return s;
  };
  const markers = { sun: ring(0xf6b646, 1.6), earth: ring(0x74adff, 2.8) };
```

(The existing skyline `ring` variable is renamed `skyline` to keep the names apart.) `update(t)`: `markers.sun.visible = v.sunFraction === 0` at `sd * RG`, `markers.earth.visible = scene.series.earthVisible[hourIndex] === 0` at `ed * RG`. `setGuides(on)`: `guides.visible = on`. `labels()` gains `marks: (scene.marks ?? []).map((m) => ({ text: m.text, ...spot(world of dirAzEl(az, el at m.hour) * RG through sky, 0, false), visible: guides.visible && ... }))`. `StandRenderer.setGuides(on)` delegates.

StandView: `marks` from `keyMoments`: the Sun's leaving and coming back on the Sun's path, Earth in view on Earth's, each with its day ("3 Jan"); passed in the scene. StandCanvas: the marks as small chips (`data-mark`), the "Level horizon" chip at the screen's left at `levelY(pitch, fov)` (`0.5 + tan(pitch) / (2 tan(fov / 2))`), both hidden in the clean view, which also calls `r.setGuides?.(false)`. ArrivalCanvas: `'setGuides'` joins `ArrivalRenderer`'s list and the stage calls `r.setGuides(p > 3.8)` each frame: the guides show only once standing (in flight the faint bands would cross the Moon); its test checks the stub's `setGuides` is called with false at progress 2 and true at 4.

- [ ] **Step 4: Run them, then the whole suite**

Run: `cd web && npx vitest run src/lib/sky src/components/stand && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/standRenderer.ts web/src/lib/sky/standRenderer.test.ts web/src/components/stand
git commit -m "feat(web): the month's Sun and Earth paths in the stand view, faint through the hills, with the level horizon and a ring on a hidden body"
```

### Task 9: The stand view's words

**Files:**
- Modify: `web/src/lib/viz/stand.ts`, `web/src/lib/viz/stand.test.ts`, `web/src/components/stand/StandView.tsx`, `web/src/components/stand/StandView.test.tsx`

**Interfaces:**
- Produces: `momentCaption` and `viewCaption` (the `'dark'` overload loses its `sunElDeg`), each at most 112 characters; `landerCaption(lat: number, backSeen: boolean): string`; `statusLine(s, p, startUtc, hour, batteryWh?)` adds the battery level while the lander has power; StandView: the reasons start with where the site lies and the pole and offer "Show all reasons"; a key moment the hour moves past (Play, the slider, a key) shows its caption.

- [ ] **Step 1: Write the failing tests** (`stand.test.ts`)

```ts
it('keeps every caption to two lines on a wide screen: 112 characters at most', () => {
  const kinds = ['sunset', 'sun-back', 'battery-out', 'power-back', 'earth-in', 'sunset-power-off', 'sun-power-back'] as const;
  const s = (sunEl: number, frac: number, earth: number) => ({ ...series(), sunEl: Float64Array.from([sunEl]), sunFraction: Float64Array.from([frac]), earthVisible: Uint8Array.from([earth]) }) as Series;
  for (const kind of kinds) for (const [el, f, e] of [[1, 0, 0], [-1, 0, 1], [2, 0.5, 1]] as const) for (const lat of [-88.3, 18.6]) expect(momentCaption(kind, s(el, f, e), 0, lat).length, `${kind} ${el} ${f} ${e} ${lat}`).toBeLessThanOrEqual(112);
  for (const kind of ['earth', 'up', 'earthlight', 'lander'] as const) for (const lat of [-88.3, 18.6]) expect(viewCaption(kind, lat).length).toBeLessThanOrEqual(112);
  expect(viewCaption('dark', -88.3).length).toBeLessThanOrEqual(112);
  for (const back of [true, false]) for (const lat of [-88.3, 18.6]) expect(landerCaption(lat, back).length).toBeLessThanOrEqual(112);
});

it('says why where it happens: no twilight when the Sun goes, Earth rising by the Moon’s rocking', () => {
  expect(momentCaption('sunset', hidden(), 0, -88.3)).toMatch(/No air, so no twilight\.$/);
  expect(momentCaption('earth-in', hidden(), 0, -88.3)).toMatch(/rocking lifts it into view/);
});

it('gives the battery’s level while the lander has power', () => {
  const p = power(); // a walk that runs from full to empty over the test series
  expect(statusLine(series(), p, START, 0, 2000).text).toMatch(/\(battery 100 %\)/);
});
```

(`series()`, `hidden()`, `power()`, `START` are the file's helpers or small new ones beside these tests.) In `StandView.test.tsx`: the first reason starts "de Gerlache Rim 2 lies at 88.3° S."; "Show all reasons" lists them all and "One at a time" goes back; stepping the time slider with the arrow key from the hour before "Battery runs out" to its hour shows that moment's caption; the lander's line reads "(battery 100 %)" at hour 10. Update the tests that pinned the old long captions to the new words.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/components/stand/StandView.test.tsx`
Expected: FAIL on lengths, `landerCaption`, the battery, the reasons' order and the passed-moment caption.

- [ ] **Step 3: Implement.** The captions, each at most 112 characters (the long whys stay in `whyLines`):

```ts
/** The captions' word on twilight; the reasons (whyLines) keep the long one. */
const NO_TWILIGHT_SHORT = 'No air, so no twilight.';

export function momentCaption(kind: MomentKind, s: Series, hour: number, lat?: number): string {
  const up = s.sunEl[hour] >= 0, pole = lat === undefined || poleLine(lat) !== null, earth = s.earthVisible[hour] === 1;
  switch (kind) {
    case 'sunset':
      return `${up ? (pole ? 'A hill hides the Sun: this close to the pole it never climbs more than a few degrees.' : 'The Sun has not set: a hill hides it.') : pole ? 'The Sun sinks below the horizon: this close to the pole it never climbs high.' : 'The Sun sinks below the horizon.'} ${NO_TWILIGHT_SHORT}`;
    case 'sunset-power-off':
      return `${up ? 'A hill hides the Sun' : 'The Sun sinks below the horizon'}, and the lander's power goes with it. ${NO_TWILIGHT_SHORT}`;
    case 'battery-out':
      return s.sunFraction[hour] > 0
        ? 'The battery runs out: the Sun is up, but too low for the panel to keep the lander going.'
        : earth
          ? 'The battery runs out in the dark. Only Earthlight lights the ground here, brightened like a long exposure.'
          : 'The battery runs out in the dark. With no Sun or Earth up, the view is brightened like a long exposure.';
    case 'earth-in':
      return "Earth rises over the hills: the Moon's slight rocking lifts it into view for about two weeks a month.";
    case 'sun-back':
      return `The Sun is back over the hills.${earth ? ' With Earth in view, a working lander could radio home.' : ''}`;
    case 'sun-power-back':
      return `The Sun is back, and with it the power, if the lander survived the cold.${earth ? ' Earth is in view: it could radio home.' : ''}`;
    case 'power-back':
      return 'The panel makes enough power again.';
    default:
      return '';
  }
}
```

`viewCaption`: `'earth'` near a pole "Earth barely moves in the Moon's sky; only the Moon's slight rocking lifts it over the horizon or hides it.", elsewhere "Earth barely moves in the Moon's sky: the Moon keeps one face towards it."; `'up'` "Towards the Southern Cross. With no air the sky is black even by day; away from the glare, the stars show." (north: without the first sentence); `'dark'` "Neither the Sun nor Earth lights this ground: the view is brightened like a long exposure. No air, no twilight."; `'earthlight'` "Lit only by Earthlight: sunlight bounced off Earth, brightened here like a long exposure."; `'lander'` moves to `landerCaption(lat, backSeen)`: near a pole "Its solar panel stands upright: here the Sun never climbs more than a few degrees." or, seeing its back, "Its panel stands upright for a Sun this low; you see its back, as its cells face the Sun."; elsewhere "The lander is drawn as built for the poles, its solar panel upright for a low Sun." or "Drawn as built for the poles; you see its panel's back, as its cells face the Sun." `farLit` goes (whyLines keeps "higher ground farther off still catches its light"). Their doc comments say what each says now.

`statusLine(..., batteryWh?)`: with power, `w.has` becomes `${w.has} (battery ${pct0(p.energyWh[hour] / batteryWh)})` when `batteryWh` is given. StandView passes `s.params.power.batteryWh`.

StandView: reasons in the order where the site lies (`standingLine(site, name, 'more')`), `whyLines` (the pole first), the radio story, how we know; a "Show all reasons" / "One at a time" button beside the pager (`aria-pressed`), the list as `<ul>` when all are shown. The time bar's `onCursor` is wrapped in a handler (not an effect: the React Compiler lint) that, when the hour moves forward by 48 hours or less across a key moment, shows that moment's caption without turning the view.

- [ ] **Step 4: Run them, then the whole suite**

Run: `cd web && npx vitest run src/lib/viz src/components/stand && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/stand.ts web/src/lib/viz/stand.test.ts web/src/components/stand/StandView.tsx web/src/components/stand/StandView.test.tsx
git commit -m "feat(web): the stand view's words: captions of two lines, the whys where they happen, the pole first among the reasons with a list of all, the battery's level"
```

### Task 10: The stills and the recorded walk

- [ ] **Step 1: Capture the stills** from the production build (Task 7's server), with `window.__arrival` (`?arrival=0&bare=1`): for each beat's stop (0, 1.25, 2, 3, 4) set the progress, wait for `sharp()`, screenshot the viewport, at 1440 × 900 (wide) and 390 × 844 (tall), into `.playwright-mcp/arrival/still-<k>-<shape>.png`.
- [ ] **Step 2: Convert them to JPEG** at quality 82 with rasterio (a short script in the job's tmp folder: read the PNG with GDAL, write `web/public/arrival/beat-<k>-<shape>.jpg`, drop `.aux.xml`); ten files, about 1.5 MB in all.
- [ ] **Step 3: Check the stills in the browser**: on a cold load (a fresh loopback host) the first screen's still shows before the live view fades in over it with no jump in framing; with reduced motion emulated (`browser_emulate_media`), the beats cut from still to still and "Explore a landing site" lands at once. (Without WebGL 2 the stage fails and the stills stay: the component test covers it, as the browser here cannot turn WebGL off.)
- [ ] **Step 4: Record the walk** for the blind read: `?arrival=<p>` at p = 0, 0.25 … 4 (17 frames) at 1440 × 900 with the words, and the stand view's Play over the hero month (frames at hours 10, 40, 70, 120, 220, 300, 460, 600), into `.playwright-mcp/walk/`.
- [ ] **Step 5: Commit**

```bash
git add web/public/arrival
git commit -m "feat(web): the arrival's stills, wide and tall, for the first paint, reduced motion and browsers without WebGL 2"
```

### Task 11: Documents, the blind reads, the final review, the pull request

- [ ] Docs: `web/README.md` (the arrival: `components/home/Arrival*`, `lib/sky/globe.ts`, `arrivalPath.ts`, `lib/data/globe.ts`, the capture hook), `README.md` (one line in the tour), `pipeline/README.md` (`fetch --group globe`, `globe`), `docs/data-credits.md` (the CGI Moon Kit's colour map with the poles filled and LOLA's 16 px/deg heights, NASA SVS), `docs/hosting.md` (`sync-local --tiles` now copies `globe`; `publish-r2` uploads it), `docs/pitch.md` and `docs/video-storyboard.md` (the first 15 seconds are the four beats, played from the home page; frames come from the capture hook), the test badge (`npm run validation:tests`).
- [ ] Blind read of the home journey (two fresh readers, a hackathon judge and a science teacher; stills at 1440 × 900 and 390 × 844 of the five beats and the rest of the home page, the recorded walk's frames in order, and the stand view with the paths): purpose, next step and look at 4 or more, room and readability at 3 or more, immersion at 4, for both. Fix what both name; repeat until it passes, ledgering each read and each ruling as in part A.
- [ ] Spec section 14 (an amendment: part B as built, the reads); the ledger copied beside this plan (`2026-10-04-immersive-b-arrival.ledger.md`).
- [ ] Final review on the most capable model (the review package, this plan's Review Focus verbatim, the ledger's rulings); one fix pass, each fix RED → GREEN with the suite green; deferred minors ledgered.
- [ ] Secret scan of the branch; push `feat/immersive-b`; pull request; merge on green after GitGuardian (`gh pr merge <n> --merge`).
