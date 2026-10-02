# Immersive part A: Stand on the Moon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-window view from the landing site (`/explore/stand`): NASA terrain to 125 km with regolith photometry and the engine's shadows worked out per pixel, real stars, the white Sun, NASA's Blue Marble Earth turned for the hour, with Explore's answer, the live sentence, the lander's state and the time bar on quiet plates.

**Architecture:** The pipeline writes three small sky files (the Yale star catalogue, the Moon's orientation every 6 hours from SPICE, NASA's Earth maps) and SPICE fixtures. Pure TypeScript modules in `web/src/lib/sky/` place every body and build the terrain field; a plain three.js renderer (`StandRenderer`) draws the scene with custom shaders whose shadow rule has a TypeScript twin tested against the engine's sweep. A React view wraps the renderer, reuses Explore's store, words and time bar, and falls back to "View all round" without WebGL 2.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, three 0.186 (plain, with `three/examples/jsm` post-processing), zustand, vitest 5 + Testing Library; Python 3.12 pipeline with spiceypy and NumPy.

**Spec:** `docs/superpowers/specs/2026-10-02-immersive-space-design.md` (sections 1–4, 7–9). The C++ core (section 3.4, `2026-10-02-cpp-core-design.md`) is not part of this plan.

## Global Constraints

- Nothing in this work changes a computed number; every figure on screen is the engine's (the store's series and power).
- Every body drawn (Sun, Earth, stars) is placed by a tested function; star and planet directions against SPICE fixtures to 0.01°, the Moon's orientation to 0.001°.
- Shadows by the engine's rule (steepest rise towards the Sun against the Sun's elevation, the Sun's 0.53° disc for the penumbra), never GPU shadow maps; the shader's rule has a TypeScript twin tested against `cast()`.
- Plain words on screen; instrument and programme names only in the note on what is measured and drawn.
- Gold is the Sun, blue is Earth; no text under 14 px; controls at least 40 px tall; reduced motion respected (no intro camera move, no auto-turn).
- The development laptop (Intel UHD 620) is not a performance target: a quality setting (pixel ratio, shadow steps, detail) exists but is not tuned or benchmarked.
- Every behaviour change starts with a failing test; gates from `web/`: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; from `pipeline/`: `uv run pytest -q`.
- Never read, print or copy `web/.env.local`; no calls to OpenRouter or other paid APIs in tests; ask before any download over about 100 MB.

## Review Focus

1. A site with no polar terrain (Blue Ghost on the mare, a custom point without a window): the view opens with flat ground at the site, the right sky and the words. Tests in Tasks 3 and 6.
2. Total darkness (Sun and Earth below the horizon): the words say so, the stars are at full, no NaN reaches a uniform. Tests in Tasks 3 and 4.
3. A missing, malformed or out-of-range `hour` in the address: hour 0 or the last hour of the period. Tests in Tasks 4 and 6.
4. No WebGL 2, or the renderer failing to start: the fallback view with the same words. Test in Task 6.
5. A 90-day period (2,160 hours) and a period at the end of the tables (December 2036): the Moon's orientation clamps at the table's ends; the time bar and words work. Tests in Tasks 2 and 6.

## File map

| File | Responsibility |
|---|---|
| `pipeline/lunar_pipeline/sky.py` | star catalogue, Moon orientation table, Earth maps, SPICE fixtures |
| `pipeline/tests/test_sky.py` | parsing, quaternions, files |
| `data/sky/*`, `data/fixtures/sky/*` | the committed sky files and fixtures |
| `web/src/lib/sky/frames.ts` | site east/north/up; azimuth/elevation ↔ world vectors |
| `web/src/lib/sky/moonOrientation.ts` | the 6-hour quaternion table, slerp |
| `web/src/lib/sky/stars.ts` | the catalogue; star placement, colour, size |
| `web/src/lib/sky/earth.ts` | Earth's lit fraction and orientation |
| `web/src/lib/sky/terrainField.ts` | the site-frame height field from the shadow levels (JS heights + texture data) |
| `web/src/lib/sky/shadowRule.ts` | the per-pixel shadow rule (constants, TS twin, GLSL) |
| `web/src/lib/sky/shaders.ts` | the ground, Earth and star shaders |
| `web/src/lib/sky/standRenderer.ts` | the three.js scene, time, view, quality |
| `web/src/lib/data/sky.ts` | loading the sky files |
| `web/src/lib/viz/stand.ts` | the view's words: live sentence, lander state, sky labels; the stand query |
| `web/src/components/stand/StandView.tsx`, `StandCanvas.tsx` | the page and the canvas wrapper |
| `web/src/app/explore/stand/page.tsx` | the route |
| `web/src/lib/links.ts`, `components/explore/GroundPanel.tsx`, `components/explore/VerdictPanel.tsx` | the "Stand here" entry points |

---

### Task 1: Sky data from the pipeline

**Files:**
- Create: `pipeline/lunar_pipeline/sky.py`, `pipeline/tests/test_sky.py`
- Modify: `pipeline/lunar_pipeline/fetch.py` (group `sky`), `pipeline/lunar_pipeline/cli.py` (`sky`, `fixture-sky`), `pipeline/lunar_pipeline/sync_local.py` (`SMALL_DIRS` + `sky`)
- Output: `data/sky/stars.bin`, `data/sky/stars.json`, `data/sky/moon_me_6h.f32`, `data/sky/moon_me_6h.json`, `data/sky/earth_day_2048.jpg`, `data/sky/earth_clouds_2048.jpg`, `data/sky/credits.json`, `data/fixtures/sky/stars_at_sites.json`, `data/fixtures/sky/moon_orientation_offgrid.json`, `data/fixtures/sky/earth_rotation.json`

**Interfaces:**
- Produces (files): `stars.bin` = float32 little-endian rows `[x, y, z, vmag, bv]` (J2000 unit vector), sorted by `vmag`, `stars.json` = `{ count, columns: ["x","y","z","vmag","bv"], source, url, sha256 }`; `moon_me_6h.f32` = float32 rows `[w, x, y, z]` (rotation J2000→MOON_ME, consecutive samples on the same hemisphere), `moon_me_6h.json` = `{ start_utc: "2024-01-01T00:00:00", step_hours: 6, count, convention: "q rotates J2000 vectors into MOON_ME; v_me = R(q) v_j2000", kernels }`.
- Produces (fixtures): `stars_at_sites.json` = `{ cases: [{ site_id, lat, lon, utc, stars: [{ index, az_deg, el_deg }] }] }`; `moon_orientation_offgrid.json` = `{ cases: [{ utc, matrix: number[9] }] }` (row-major J2000→MOON_ME); `earth_rotation.json` = `{ cases: [{ utc, matrix: number[9] }] }` (row-major IAU_EARTH→J2000).

- [ ] **Step 1: Write the failing tests** (`pipeline/tests/test_sky.py`)

```python
import numpy as np
import pytest

from lunar_pipeline import sky

SAMPLE = """line[1] = ads ads_comp alt_name bii bv_color bv_uncert cdec cdec_1950 class cra cra_1950 dec dec_1900 dec_1950 dm_cat dm_num fk5 glat glon hd hr ir_flag lii m_cnt m_id m_mdiff m_sep multiple name note par_code parallax pmdec pmra ra ra_1900 ra_1950 radvel radvel_comm ri_code ri_color rotvel rotvel_comm rotvel_uncert sao spect_code spect_type ub_color ub_uncert var_id vmag vmag_code vmag_uncert
<DATA>
||Sig Oct|-27.7134|0.27||-885723|-890818|2403|210846.2|201510.6|-88.9564|-89.25|-89.1383|CP|-89   47|923|-27.71|303.91|177482|7228||303.905||||||HR 7228|*|||0.005|0.023|317.1925|284.93|303.7943|12||||108|||||5.47|||
||Alp CMa|-8.88|0.00||-164258|-163935|2403|064508.9|064244.0|-16.7161|-16.5|-16.6597||||-8.88|227.2|48915|2491||227.23||||||HR 2491||||-1.223|-0.546|101.2872|100.0|100.6|-8||||||||||-1.46|||
<END>
"""


def test_parses_the_catalogue_rows_by_their_named_columns():
    rows = sky.parse_bsc5p(SAMPLE)
    assert [r['name'] for r in rows] == ['HR 7228', 'HR 2491']
    assert rows[1]['vmag'] == pytest.approx(-1.46)
    assert rows[1]['ra'] == pytest.approx(101.2872)
    assert rows[1]['dec'] == pytest.approx(-16.7161)
    assert rows[0]['bv'] == pytest.approx(0.27)


def test_star_table_is_unit_vectors_sorted_by_magnitude():
    table = sky.star_table(sky.parse_bsc5p(SAMPLE), max_vmag=6.5)
    assert table.shape == (2, 5)
    assert table[0, 3] == pytest.approx(-1.46)  # Sirius first
    assert np.allclose(np.linalg.norm(table[:, :3], axis=1), 1.0, atol=1e-6)


def test_quaternions_round_trip_and_keep_one_hemisphere():
    rng = np.random.default_rng(1)
    mats = []
    for _ in range(5):
        q = rng.normal(size=4); q /= np.linalg.norm(q)
        mats.append(sky.quat_to_matrix(q))
    qs = sky.matrices_to_quats(np.array(mats))
    for m, q in zip(mats, qs):
        assert np.allclose(sky.quat_to_matrix(q), m, atol=1e-6)
    flipped = sky.matrices_to_quats(np.array([mats[0], mats[0]]))
    assert np.dot(flipped[0], flipped[1]) > 0
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pipeline && uv run pytest tests/test_sky.py -q`
Expected: FAIL with `ImportError: cannot import name 'sky'`.

- [ ] **Step 3: Implement `sky.py`**

```python
"""The sky for the stand view: the Yale Bright Star Catalogue, the Moon's orientation every 6 hours
(SPICE, the same kernels as the ephemeris), NASA's Earth maps, and SPICE fixtures for the web's sky maths."""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
import spiceypy as sp

from . import config
from .spice_env import KERNEL_ORDER, spice_kernels

BSC5P_URL = 'https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz'
EARTH_DAY_URL = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg'
EARTH_CLOUDS_URL = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg'
RAW = config.RAW_DIR / 'sky'
OUT = config.DATA_DIR / 'sky'
FIXTURES = config.DATA_DIR / 'fixtures' / 'sky'
START_UTC, END_UTC, STEP_H = '2024-01-01T00:00:00', '2037-01-01T00:00:00', 6


def parse_bsc5p(text: str) -> list[dict]:
    """Rows of HEASARC's tdat file as dicts of name, ra, dec (J2000 degrees), vmag and bv (None when blank)."""
    cols, rows, data = None, [], False
    for line in text.splitlines():
        if line.startswith('line[1] = '):
            cols = line[len('line[1] = '):].split()
        elif line.startswith('<DATA>'):
            data = True
        elif line.startswith('<END>'):
            break
        elif data and cols and '|' in line:
            f = dict(zip(cols, line.split('|')))
            num = lambda k: float(f[k]) if f.get(k, '').strip() else None
            if num('ra') is None or num('dec') is None or num('vmag') is None:
                continue
            rows.append({'name': f['name'].strip(), 'ra': num('ra'), 'dec': num('dec'), 'vmag': num('vmag'), 'bv': num('bv_color')})
    return rows


def star_table(rows: list[dict], max_vmag: float = 6.5) -> np.ndarray:
    """float32 [x, y, z, vmag, bv] per star (J2000 unit vectors), brightest first; a missing B-V counts as 0.6."""
    keep = sorted((r for r in rows if r['vmag'] <= max_vmag), key=lambda r: r['vmag'])
    out = np.zeros((len(keep), 5), dtype=np.float32)
    for i, r in enumerate(keep):
        a, d = math.radians(r['ra']), math.radians(r['dec'])
        out[i] = [math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d), r['vmag'], 0.6 if r['bv'] is None else r['bv']]
    return out


def quat_to_matrix(q: np.ndarray) -> np.ndarray:
    w, x, y, z = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ])


def matrices_to_quats(mats: np.ndarray) -> np.ndarray:
    """Unit quaternions [w, x, y, z] for rotation matrices, each on the same hemisphere as the one before (so slerp takes the short way)."""
    out = np.zeros((len(mats), 4))
    for i, m in enumerate(mats):
        t = np.trace(m)
        if t > 0:
            s = math.sqrt(t + 1.0) * 2
            q = [0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s]
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
            s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
            q = [(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
        elif m[1, 1] > m[2, 2]:
            s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
            q = [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s]
        else:
            s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
            q = [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s]
        q = np.array(q) / np.linalg.norm(q)
        if i > 0 and np.dot(q, out[i - 1]) < 0:
            q = -q
        out[i] = q
    return out


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build() -> list[Path]:
    """Writes data/sky: stars, the Moon's orientation table and the Earth maps with their credits."""
    OUT.mkdir(parents=True, exist_ok=True)
    src = RAW / 'heasarc_bsc5p.tdat.gz'
    table = star_table(parse_bsc5p(gzip.open(src, 'rt', encoding='latin-1').read()))
    (OUT / 'stars.bin').write_bytes(table.astype('<f4').tobytes())
    (OUT / 'stars.json').write_text(json.dumps({'count': int(len(table)), 'columns': ['x', 'y', 'z', 'vmag', 'bv'], 'frame': 'J2000',
        'source': 'Yale Bright Star Catalogue, 5th revised ed. (Hoffleit & Warren 1991), NASA HEASARC bsc5p', 'url': BSC5P_URL, 'sha256': _sha256(src)}, indent=1))
    with spice_kernels():
        et0, et1 = sp.str2et(START_UTC.replace('T', ' ') + ' UTC'), sp.str2et(END_UTC.replace('T', ' ') + ' UTC')
        ets = np.arange(et0, et1 + 1, STEP_H * 3600.0)
        quats = matrices_to_quats(np.array([np.array(sp.pxform('J2000', 'MOON_ME', et)) for et in ets]))
    (OUT / 'moon_me_6h.f32').write_bytes(quats.astype('<f4').tobytes())
    (OUT / 'moon_me_6h.json').write_text(json.dumps({'start_utc': START_UTC, 'step_hours': STEP_H, 'count': int(len(quats)),
        'convention': 'q rotates J2000 vectors into MOON_ME; v_me = R(q) v_j2000; [w, x, y, z]', 'kernels': KERNEL_ORDER}, indent=1))
    shutil.copy2(RAW / 'land_shallow_topo_2048.jpg', OUT / 'earth_day_2048.jpg')
    shutil.copy2(RAW / 'cloud_combined_2048.jpg', OUT / 'earth_clouds_2048.jpg')
    (OUT / 'credits.json').write_text(json.dumps({'earth_day': {'title': 'Blue Marble: Land Surface, Shallow Water, and Shaded Topography', 'url': EARTH_DAY_URL, 'credit': 'NASA Goddard Space Flight Center (Reto Stöckli)'},
        'earth_clouds': {'title': 'Blue Marble: Clouds', 'url': EARTH_CLOUDS_URL, 'credit': 'NASA Goddard Space Flight Center'}}, indent=1))
    return [OUT / n for n in ('stars.bin', 'moon_me_6h.f32', 'earth_day_2048.jpg', 'earth_clouds_2048.jpg')]


def _enu(lat: float, lon: float):
    la, lo = math.radians(lat), math.radians(lon)
    up = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    east = np.array([-math.sin(lo), math.cos(lo), 0.0])
    return east, np.cross(up, east), up


def fixtures(sites: list) -> list[Path]:
    """SPICE answers the web's sky maths is tested against; `sites` are `sites.Site` records (id, lat, lon)."""
    FIXTURES.mkdir(parents=True, exist_ok=True)
    table = np.frombuffer((OUT / 'stars.bin').read_bytes(), dtype='<f4').reshape(-1, 5)
    picks = [0, 1, 2, 5, 10, 30, 60, 100, 200, 400, 800, 1200, 1600, 2000, 3000, 4000, 5000, 6000, 7000, len(table) - 1]
    times = ['2025-03-02T09:00:00', '2027-01-01T10:00:00', '2027-01-13T12:00:00', '2030-06-15T03:00:00', '2036-12-31T18:00:00']
    cases, off, rot = [], [], []
    with spice_kernels():
        for site in sites:
            east, north, up = _enu(site.lat, site.lon)
            for utc in times:
                m = np.array(sp.pxform('J2000', 'MOON_ME', sp.str2et(utc.replace('T', ' ') + ' UTC')))
                stars = []
                for i in picks:
                    v = m @ table[i, :3].astype(float)
                    stars.append({'index': i, 'az_deg': math.degrees(math.atan2(v @ east, v @ north)) % 360, 'el_deg': math.degrees(math.asin(v @ up))})
                cases.append({'site_id': site.id, 'lat': site.lat, 'lon': site.lon, 'utc': utc, 'stars': stars})
        rng = np.random.default_rng(7)
        et0, et1 = sp.str2et(START_UTC.replace('T', ' ') + ' UTC'), sp.str2et('2036-12-31 00:00:00 UTC')
        for et in rng.uniform(et0, et1, 60):
            off.append({'utc': sp.et2utc(et, 'ISOC', 0), 'matrix': np.array(sp.pxform('J2000', 'MOON_ME', et)).reshape(9).tolist()})
        for et in rng.uniform(et0, et1, 20):
            rot.append({'utc': sp.et2utc(et, 'ISOC', 0), 'matrix': np.array(sp.pxform('IAU_EARTH', 'J2000', et)).reshape(9).tolist()})
    out = []
    for name, doc in [('stars_at_sites.json', {'cases': cases}), ('moon_orientation_offgrid.json', {'cases': off}), ('earth_rotation.json', {'cases': rot})]:
        (FIXTURES / name).write_text(json.dumps(doc, indent=1))
        out.append(FIXTURES / name)
    return out
```

Wire it up: in `fetch.py`, at the end of `assets()`, add the three sky files as `Asset(name, url, config.RAW_DIR / "sky", "sky")` for `heasarc_bsc5p.tdat.gz` (`BSC5P_URL`), `land_shallow_topo_2048.jpg` (`EARTH_DAY_URL`) and `cloud_combined_2048.jpg` (`EARTH_CLOUDS_URL`), importing the URLs from `.sky`; in `cli.py` add `"sky"` to the `fetch --group` choices, add `sub.add_parser("sky", help="build data/sky: stars, the Moon's orientation, Earth maps")` and `sub.add_parser("fixture-sky", help="write SPICE fixtures for the web's sky maths")`, dispatching to `sky.build()` and `sky.fixtures([s for s in all_sites() if s.id in ('de_gerlache_rim_2', 'blue_ghost_m1')])` (`from .sites import all_sites`), printing each path as the other commands do; in `sync_local.py` change `SMALL_DIRS = ["ephemeris", "masks", "fixtures", "validation"]` to `SMALL_DIRS = ["ephemeris", "masks", "fixtures", "validation", "sky"]`.

- [ ] **Step 4: Run the tests**

Run: `cd pipeline && uv run pytest tests/test_sky.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Build the files and fixtures, sync, and run the whole suite**

Run: `cd pipeline && uv run python -m lunar_pipeline.cli fetch --group sky && uv run python -m lunar_pipeline.cli sky && uv run python -m lunar_pipeline.cli fixture-sky && uv run python -m lunar_pipeline.cli sync-local && uv run pytest -q`
Expected: `data/sky/stars.json` with `count` about 9,090; `moon_me_6h.json` with `count` 18,993; three fixture files; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lunar_pipeline/sky.py pipeline/tests/test_sky.py pipeline/lunar_pipeline/fetch.py pipeline/lunar_pipeline/cli.py pipeline/lunar_pipeline/sync_local.py data/sky data/fixtures/sky
git commit -m "feat(pipeline): the sky for the stand view: the Yale stars, the Moon's orientation every 6 hours, NASA's Earth maps, SPICE fixtures"
```

### Task 2: Sky maths in the browser

**Files:**
- Create: `web/src/lib/sky/frames.ts`, `moonOrientation.ts`, `stars.ts`, `earth.ts` and a test file for each; `web/src/lib/data/sky.ts`
- Test: `web/src/lib/sky/*.test.ts`

**Interfaces:**
- Consumes: Task 1's files and fixtures.
- Produces:
  - `type Vec3 = [number, number, number]`; `interface Basis { east: Vec3; north: Vec3; up: Vec3 }`
  - `enuBasis(latDeg: number, lonDeg: number): Basis` (in MOON_ME)
  - `dirAzEl(azDeg: number, elDeg: number): Vec3` (world: x east, y up, z south)
  - `meToWorld(b: Basis, v: Vec3): Vec3`; `azElOf(world: Vec3): { az: number; el: number }`
  - `interface MoonOrientation { startMs: number; stepMs: number; quats: Float32Array; count: number }`; `parseMoonOrientation(bytes: ArrayBuffer, header: { start_utc: string; step_hours: number; count: number }): MoonOrientation`; `moonMatrixAt(o: MoonOrientation, utcMs: number): number[]` (row-major 3×3 J2000→MOON_ME, slerped, clamped to the table)
  - `interface Stars { count: number; j2000: Float32Array; vmag: Float32Array; bv: Float32Array }`; `parseStars(bytes: ArrayBuffer, count: number): Stars`; `placeStars(stars: Stars, m: number[], b: Basis, radius: number, out: Float32Array): void`; `starColour(bv: number): Vec3`; `starSize(vmag: number): number`
  - `earthLitFraction(sun: Vec3, earth: Vec3): number`; `earthAxes(m: number[], b: Basis, utcMs: number): { x: Vec3; y: Vec3; z: Vec3 }` (world directions of the sphere's local axes: x = longitude 0, y = north pole, z = longitude 90° W, matching three's `SphereGeometry` UVs)
  - `interface SkyAssets { stars: Stars; moon: MoonOrientation; earthDayUrl: string; earthCloudsUrl: string }`; `loadSkyAssets(base: string): Promise<SkyAssets>`

- [ ] **Step 1: Write the failing tests**

`frames.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { azElOf, dirAzEl, enuBasis, meToWorld } from './frames';

describe('frames', () => {
  it('puts azimuth clockwise from north and elevation up, with north along -z', () => {
    const n = dirAzEl(0, 0), e = dirAzEl(90, 0), up = dirAzEl(0, 90);
    expect(n[2]).toBeCloseTo(-1, 9); expect(e[0]).toBeCloseTo(1, 9); expect(up[1]).toBeCloseTo(1, 9);
    expect(azElOf(dirAzEl(327.4, 2.46)).az).toBeCloseTo(327.4, 6);
    expect(azElOf(dirAzEl(327.4, 2.46)).el).toBeCloseTo(2.46, 6);
  });
  it('builds the site basis in the Moon-fixed frame: up is the site direction, east is horizontal', () => {
    const b = enuBasis(-88.28, -64.31);
    const la = (-88.28 * Math.PI) / 180, lo = (-64.31 * Math.PI) / 180;
    expect(b.up[0]).toBeCloseTo(Math.cos(la) * Math.cos(lo), 12);
    expect(b.east[2]).toBe(0);
    const w = meToWorld(b, b.up);
    expect(w[1]).toBeCloseTo(1, 12);
  });
});
```

`moonOrientation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { moonMatrixAt, parseMoonOrientation } from './moonOrientation';

const header = readJson<{ start_utc: string; step_hours: number; count: number }>('data', 'sky', 'moon_me_6h.json');
const table = parseMoonOrientation(readBytes('data', 'sky', 'moon_me_6h.f32').buffer as ArrayBuffer, header);
const angleDeg = (a: number[], b: number[]) => {
  // angle of the rotation a * b^T
  let tr = 0; for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) tr += a[i * 3 + k] * b[i * 3 + k];
  return (Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2))) * 180) / Math.PI;
};

describe('the Moon’s orientation', () => {
  it('matches SPICE at 60 off-grid times to 0.001°', () => {
    const { cases } = readJson<{ cases: { utc: string; matrix: number[] }[] }>('data', 'fixtures', 'sky', 'moon_orientation_offgrid.json');
    for (const c of cases) expect(angleDeg(moonMatrixAt(table, Date.parse(c.utc + 'Z')), c.matrix), c.utc).toBeLessThan(0.001);
  });
  it('clamps before the first and after the last sample instead of reading outside the table', () => {
    const first = moonMatrixAt(table, Date.parse('2023-06-01T00:00:00Z'));
    expect(first.every(Number.isFinite)).toBe(true);
    expect(moonMatrixAt(table, Date.parse('2040-01-01T00:00:00Z')).every(Number.isFinite)).toBe(true);
  });
});
```

`stars.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { azElOf, enuBasis } from './frames';
import { moonMatrixAt, parseMoonOrientation } from './moonOrientation';
import { parseStars, placeStars, starColour, starSize } from './stars';

const meta = readJson<{ count: number }>('data', 'sky', 'stars.json');
const stars = parseStars(readBytes('data', 'sky', 'stars.bin').buffer as ArrayBuffer, meta.count);
const moon = parseMoonOrientation(readBytes('data', 'sky', 'moon_me_6h.f32').buffer as ArrayBuffer, readJson<{ start_utc: string; step_hours: number; count: number }>('data', 'sky', 'moon_me_6h.json'));

describe('stars', () => {
  it('places catalogue stars where SPICE puts them, for two sites and five hours, to 0.01°', () => {
    const { cases } = readJson<{ cases: { lat: number; lon: number; utc: string; stars: { index: number; az_deg: number; el_deg: number }[] }[] }>('data', 'fixtures', 'sky', 'stars_at_sites.json');
    for (const c of cases) {
      const out = new Float32Array(stars.count * 3);
      placeStars(stars, moonMatrixAt(moon, Date.parse(c.utc + 'Z')), enuBasis(c.lat, c.lon), 1, out);
      for (const s of c.stars) {
        const { az, el } = azElOf([out[s.index * 3], out[s.index * 3 + 1], out[s.index * 3 + 2]]);
        expect(el, `${c.utc} star ${s.index} el`).toBeCloseTo(s.el_deg, 2);
        expect(Math.abs(((az - s.az_deg + 540) % 360) - 180) * Math.cos((el * Math.PI) / 180), `${c.utc} star ${s.index} az`).toBeLessThan(0.01);
      }
    }
  });
  it('gives brighter stars bigger points and blue-white to orange colours by B−V', () => {
    expect(starSize(-1.46)).toBeGreaterThan(starSize(6));
    expect(starColour(-0.3)[2]).toBeGreaterThan(starColour(-0.3)[0]);
    expect(starColour(1.6)[0]).toBeGreaterThan(starColour(1.6)[2]);
  });
});
```

`earth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { earthLitFraction, greenwichAngleDeg } from './earth';

describe('Earth', () => {
  it('is new when it stands in front of the Sun and full when opposite it', () => {
    expect(earthLitFraction([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 9);
    expect(earthLitFraction([1, 0, 0], [-1, 0, 0])).toBeCloseTo(1, 9);
    expect(earthLitFraction([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.5, 9);
  });
  it('turns like SPICE’s IAU_EARTH frame to 0.5° (Greenwich sidereal angle about the J2000 pole)', () => {
    const { cases } = readJson<{ cases: { utc: string; matrix: number[] }[] }>('data', 'fixtures', 'sky', 'earth_rotation.json');
    for (const c of cases) {
      // The IAU_EARTH x axis (Greenwich) in J2000 is the matrix's first column.
      const gx = c.matrix[0], gy = c.matrix[3];
      const spice = (Math.atan2(gy, gx) * 180) / Math.PI;
      const ours = greenwichAngleDeg(Date.parse(c.utc + 'Z'));
      expect(Math.abs(((ours - spice + 540) % 360) - 180), c.utc).toBeLessThan(0.5);
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`frames.ts`:

```ts
export type Vec3 = [number, number, number];
export interface Basis { east: Vec3; north: Vec3; up: Vec3 }
const DEG = Math.PI / 180;

/** The site's east, north and up in the Moon-fixed frame (MOON_ME). */
export function enuBasis(latDeg: number, lonDeg: number): Basis {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0];
  const north: Vec3 = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  return { east, north, up };
}

/** World direction (x east, y up, z south) of an azimuth (clockwise from north) and an elevation. */
export function dirAzEl(azDeg: number, elDeg: number): Vec3 {
  const a = azDeg * DEG, e = elDeg * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

/** A Moon-fixed vector in the world frame. */
export function meToWorld(b: Basis, v: Vec3): Vec3 {
  const dot = (u: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return [dot(b.east), dot(b.up), -dot(b.north)];
}

export function azElOf(w: Vec3): { az: number; el: number } {
  const len = Math.hypot(w[0], w[1], w[2]);
  return { az: ((Math.atan2(w[0], -w[2]) / DEG) % 360 + 360) % 360, el: Math.asin(w[1] / len) / DEG };
}
```

`moonOrientation.ts`:

```ts
export interface MoonOrientation { startMs: number; stepMs: number; quats: Float32Array; count: number }

export function parseMoonOrientation(bytes: ArrayBuffer, header: { start_utc: string; step_hours: number; count: number }): MoonOrientation {
  return { startMs: Date.parse(header.start_utc + 'Z'), stepMs: header.step_hours * 3600e3, quats: new Float32Array(bytes), count: header.count };
}

/** Row-major J2000→MOON_ME rotation at a UTC time, by slerp between the 6-hour samples; clamped to the table. */
export function moonMatrixAt(o: MoonOrientation, utcMs: number): number[] {
  const x = Math.min(o.count - 1, Math.max(0, (utcMs - o.startMs) / o.stepMs));
  const i = Math.min(o.count - 2, Math.floor(x)), f = x - i;
  const q0 = o.quats.subarray(i * 4, i * 4 + 4), q1 = o.quats.subarray(i * 4 + 4, i * 4 + 8);
  let d = q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3];
  const s = d < 0 ? -1 : 1; d = Math.abs(d);
  let a: number, b: number;
  if (d > 0.9995) { a = 1 - f; b = f * s; }
  else { const th = Math.acos(d), sn = Math.sin(th); a = Math.sin((1 - f) * th) / sn; b = (Math.sin(f * th) / sn) * s; }
  let w = a * q0[0] + b * q1[0], qx = a * q0[1] + b * q1[1], qy = a * q0[2] + b * q1[2], qz = a * q0[3] + b * q1[3];
  const n = Math.hypot(w, qx, qy, qz); w /= n; qx /= n; qy /= n; qz /= n;
  return [
    1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - w * qz), 2 * (qx * qz + w * qy),
    2 * (qx * qy + w * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - w * qx),
    2 * (qx * qz - w * qy), 2 * (qy * qz + w * qx), 1 - 2 * (qx * qx + qy * qy),
  ];
}
```

`stars.ts`:

```ts
import { meToWorld, type Basis, type Vec3 } from './frames';

export interface Stars { count: number; j2000: Float32Array; vmag: Float32Array; bv: Float32Array }

export function parseStars(bytes: ArrayBuffer, count: number): Stars {
  const all = new Float32Array(bytes);
  const j2000 = new Float32Array(count * 3), vmag = new Float32Array(count), bv = new Float32Array(count);
  for (let i = 0; i < count; i++) { j2000.set(all.subarray(i * 5, i * 5 + 3), i * 3); vmag[i] = all[i * 5 + 3]; bv[i] = all[i * 5 + 4]; }
  return { count, j2000, vmag, bv };
}

/** Writes each star's world position (radius from the eye) for a J2000→MOON_ME matrix and a site basis. */
export function placeStars(s: Stars, m: number[], b: Basis, radius: number, out: Float32Array): void {
  for (let i = 0; i < s.count; i++) {
    const x = s.j2000[i * 3], y = s.j2000[i * 3 + 1], z = s.j2000[i * 3 + 2];
    const me: Vec3 = [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
    const w = meToWorld(b, me);
    out[i * 3] = w[0] * radius; out[i * 3 + 1] = w[1] * radius; out[i * 3 + 2] = w[2] * radius;
  }
}

const STOPS: [number, Vec3][] = [[-0.4, [0.62, 0.71, 1]], [0, [0.8, 0.85, 1]], [0.4, [0.98, 0.97, 1]], [0.8, [1, 0.9, 0.76]], [1.2, [1, 0.8, 0.6]], [2, [1, 0.68, 0.45]]];
export function starColour(bv: number): Vec3 {
  for (let k = 1; k < STOPS.length; k++) if (bv <= STOPS[k][0]) {
    const [a, ca] = STOPS[k - 1], [c, cb] = STOPS[k], f = Math.max(0, (bv - a) / (c - a));
    return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f];
  }
  return STOPS[STOPS.length - 1][1];
}
export const starSize = (vmag: number) => Math.max(1.4, 5.2 - vmag * 0.66);
export const starGain = (vmag: number) => Math.min(1.6, Math.pow(10, -0.4 * (vmag - 1.5)));
```

`earth.ts`:

```ts
import { meToWorld, type Basis, type Vec3 } from './frames';

const J2000_MS = Date.parse('2000-01-01T12:00:00Z');

/** Fraction of Earth's disc that is lit as seen from the Moon: 0 with the Sun behind Earth, 1 opposite. */
export function earthLitFraction(sun: Vec3, earth: Vec3): number {
  const n = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
  const c = (sun[0] * earth[0] + sun[1] * earth[1] + sun[2] * earth[2]) / (n(sun) * n(earth));
  return (1 - c) / 2;
}

/** Greenwich mean sidereal angle (degrees), Earth's turn about its pole from the J2000 equinox. */
export function greenwichAngleDeg(utcMs: number): number {
  const d = (utcMs - J2000_MS) / 86400e3;
  return (((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360;
}

/** World directions of the Earth sphere's local axes for three's SphereGeometry: x = longitude 0, y = north pole, z = longitude 90° W. */
export function earthAxes(m: number[], b: Basis, utcMs: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const th = (greenwichAngleDeg(utcMs) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const j2me = (v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  return { x: meToWorld(b, j2me([c, s, 0])), y: meToWorld(b, j2me([0, 0, 1])), z: meToWorld(b, j2me([s, -c, 0])) };
}
```

`web/src/lib/data/sky.ts`:

```ts
import { fetchBytes, fetchJson } from './loaders';
import { parseMoonOrientation, type MoonOrientation } from '../sky/moonOrientation';
import { parseStars, type Stars } from '../sky/stars';

export interface SkyAssets { stars: Stars; moon: MoonOrientation; earthDayUrl: string; earthCloudsUrl: string }

export async function loadSkyAssets(base: string): Promise<SkyAssets> {
  const [starsMeta, starBytes, moonMeta, moonBytes] = await Promise.all([
    fetchJson<{ count: number }>(`${base}/sky/stars.json`), fetchBytes(`${base}/sky/stars.bin`),
    fetchJson<{ start_utc: string; step_hours: number; count: number }>(`${base}/sky/moon_me_6h.json`), fetchBytes(`${base}/sky/moon_me_6h.f32`),
  ]);
  const buf = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { stars: parseStars(buf(starBytes), starsMeta.count), moon: parseMoonOrientation(buf(moonBytes), moonMeta), earthDayUrl: `${base}/sky/earth_day_2048.jpg`, earthCloudsUrl: `${base}/sky/earth_clouds_2048.jpg` };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/lib/sky && npx tsc --noEmit && npm run lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky web/src/lib/data/sky.ts
git commit -m "feat(web): sky maths: the site frame, the Moon's orientation, the stars and Earth, each checked against SPICE"
```

### Task 3: The terrain field and the shadow rule

**Files:**
- Create: `web/src/lib/sky/terrainField.ts`, `web/src/lib/sky/shadowRule.ts`, `web/src/lib/sky/terrainField.test.ts`, `web/src/lib/sky/shadowRule.test.ts`

**Interfaces:**
- Consumes: `Level` and `shadowLevels` (`web/src/lib/data/terrain.ts`), `R_MOON_M`, `sunBearingDeg`, `cast` (`web/src/lib/engine/shadow.ts`), `hourlySeries`.
- Produces:
  - `interface FieldLevel { cols: number; rows: number; cell: number; siteCol: number; siteRow: number; heights: Float32Array }` (site-frame heights: metres relative to the site's ground, curvature dropped)
  - `interface TerrainField { levels: FieldLevel[]; lonDeg: number }` (finest first); `terrainField(levels: Level[], lonDeg: number, siteHeightM: number): TerrainField`; `flatField(lonDeg: number): TerrainField` (no levels: flat ground)
  - `heightAt(f: TerrainField, x: number, z: number): number` (world x east, z south; `-1e6` outside every level)
  - `mapOf(lonDeg: number, x: number, z: number): { mx: number; my: number }`; `worldOf(lonDeg: number, mx: number, my: number): { x: number; z: number }`
  - `SHADOW = { T0_CELLS: 1.3, T0_MIN_M: 24, GROWTH: 1.115, STEPS: 96, MAX_M: 150000, TOL: 0.0022, SUN_RADIUS_RAD: 0.00466 }`
  - `sunFraction(f: TerrainField, x: number, y: number, z: number, sun: Vec3): number` (0..1)
  - `SHADOW_GLSL: string` (the same rule for the fragment shader; uniforms `uH0..uH2`, `uL0..uL2`, `uS0..uS2`, `uCS`, `uLevels`, and `uSteps`, the quality setting's cap on the steps, `SHADOW.STEPS` at full)

- [ ] **Step 1: Write the failing tests**

`terrainField.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { flatField, heightAt, mapOf, terrainField, worldOf } from './terrainField';

const level = (cols: number, rows: number, cell: number, h: (c: number, r: number) => number) => {
  const heights = new Float32Array(cols * rows); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = h(c, r);
  return { heights, width: cols, height: rows, pxM: cell, siteCol: (cols - 1) / 2, siteRow: (rows - 1) / 2 };
};

describe('the terrain field', () => {
  it('turns map metres into world metres by the site’s longitude, both ways', () => {
    const w = worldOf(-64.31, 1000, 0); const m = mapOf(-64.31, w.x, w.z);
    expect(m.mx).toBeCloseTo(1000, 6); expect(m.my).toBeCloseTo(0, 6);
  });
  it('gives heights relative to the site, lowered by the Moon’s curvature, from the finest level that holds the point', () => {
    const coarse = level(41, 41, 100, () => 500), fine = level(21, 21, 20, () => 510);
    const f = terrainField([coarse, fine], 0, 500);
    expect(heightAt(f, 0, 0)).toBeCloseTo(10, 3);                 // fine level, at the site
    expect(heightAt(f, 1500, 0)).toBeCloseTo(0 - 1500 ** 2 / (2 * 1737400), 3); // coarse level, 1.5 km east
    expect(heightAt(f, 9e5, 0)).toBe(-1e6);
  });
  it('is flat ground at the site without terrain', () => {
    expect(heightAt(flatField(18), 0, 0)).toBeCloseTo(0, 9);
    expect(heightAt(flatField(18), 10000, 0)).toBeCloseTo(-(10000 ** 2) / (2 * 1737400), 6);
  });
});
```

`shadowRule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeHeightmap, shadowLevels, type Heightmap, type HeightmapMeta, type TerrainManifest } from '@/lib/data/terrain';
import { hasFile, readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { hourlySeries } from '@/lib/engine/metrics';
import { utcToEt } from '@/lib/engine/time';
import { dirAzEl } from './frames';
import { SHADOW, SHADOW_GLSL, sunFraction } from './shadowRule';
import { flatField, terrainField } from './terrainField';

const terrain = ['web', 'public', 'data', 'terrain'];
const present = hasFile(...terrain, 'manifest.json') && hasFile(...terrain, 'de_gerlache_rim_2.context.u16');
async function heightmap(file: string, metaFile: string): Promise<Heightmap> {
  const meta = readJson<HeightmapMeta>(...terrain, metaFile);
  return { meta, heightsM: await decodeHeightmap(readBytes(...terrain, file), meta) };
}

describe('the shadow rule', () => {
  it('lights flat ground whenever the Sun’s centre is above the horizon, half the disc at 0°, none below its radius', () => {
    const f = flatField(0);
    expect(sunFraction(f, 0, 0.4, 0, dirAzEl(90, 2))).toBe(1);
    expect(sunFraction(f, 0, 0.4, 0, dirAzEl(90, -1))).toBe(0);
    expect(sunFraction(f, 0, 0.4, 0, dirAzEl(90, 0))).toBeGreaterThan(0.3);
  });
  it('writes the same constants into the shader', () => {
    expect(SHADOW_GLSL).toContain(`${SHADOW.STEPS}`);
    expect(SHADOW_GLSL).toContain(`${SHADOW.GROWTH}`);
  });
  it.skipIf(!present)('agrees with the engine at de Gerlache Rim 2 in January 2027, at least 97 % of the hours', async () => {
    const manifest = readJson<TerrainManifest>(...terrain, 'manifest.json');
    const entry = manifest.windows.find((w) => w.site_id === 'de_gerlache_rim_2')!;
    const [window, context, cap] = await Promise.all([heightmap(entry.file, entry.meta), heightmap(entry.context!.file, entry.context!.meta), heightmap(manifest.cap.file, manifest.cap.meta)]);
    const site = { lat: -88.28, lon: -64.31 };
    const field = terrainField(shadowLevels(site, window, context, cap), site.lon, window.meta.site_height_m);
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json'));
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const series = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 720);
    let agree = 0;
    for (let h = 0; h < 720; h++) {
      const ours = sunFraction(field, 0, 2, 0, dirAzEl(series.sunAz[h], series.sunEl[h])) >= 0.5;
      if (ours === series.sunFraction[h] >= 0.5) agree++;
    }
    expect(agree / 720).toBeGreaterThanOrEqual(0.97);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky/terrainField.test.ts src/lib/sky/shadowRule.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`terrainField.ts`:

```ts
import type { Level } from '../engine/shadow';
import { R_MOON_M } from '../engine/constants';

export interface FieldLevel { cols: number; rows: number; cell: number; siteCol: number; siteRow: number; heights: Float32Array }
export interface TerrainField { levels: FieldLevel[]; lonDeg: number }
const DEG = Math.PI / 180;

/** Map metres (x right, y up on the polar grid) of a world point (x east, z south): the grid is the world turned by the site's longitude. */
export function mapOf(lonDeg: number, x: number, z: number): { mx: number; my: number } {
  const c = Math.cos(lonDeg * DEG), s = Math.sin(lonDeg * DEG), n = -z;
  return { mx: x * c + n * s, my: -x * s + n * c };
}
export function worldOf(lonDeg: number, mx: number, my: number): { x: number; z: number } {
  const c = Math.cos(lonDeg * DEG), s = Math.sin(lonDeg * DEG);
  return { x: mx * c - my * s, z: -(mx * s + my * c) };
}

/** The shadow levels (coarse to fine) as site-frame heights, finest first. */
export function terrainField(levels: Level[], lonDeg: number, siteHeightM: number): TerrainField {
  const out: FieldLevel[] = levels.map((l) => {
    const heights = new Float32Array(l.width * l.height);
    for (let r = 0; r < l.height; r++) for (let c = 0; c < l.width; c++) {
      const mx = (c - l.siteCol) * l.pxM, my = -(r - l.siteRow) * l.pxM, z = Number(l.heights[r * l.width + c]);
      heights[r * l.width + c] = Number.isFinite(z) ? z - siteHeightM - (mx * mx + my * my) / (2 * R_MOON_M) : -1e6;
    }
    return { cols: l.width, rows: l.height, cell: l.pxM, siteCol: l.siteCol, siteRow: l.siteRow, heights };
  });
  return { levels: out.reverse(), lonDeg };
}

/** Flat ground (on the curved Moon) for a site without terrain. */
export function flatField(lonDeg: number): TerrainField { return { levels: [], lonDeg }; }

function sample(l: FieldLevel, mx: number, my: number): number | null {
  const c = l.siteCol + mx / l.cell, r = l.siteRow - my / l.cell;
  if (!(c > 1 && r > 1 && c < l.cols - 2 && r < l.rows - 2)) return null;
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, h = l.heights, w = l.cols;
  const a = h[r0 * w + c0], b = h[r0 * w + c0 + 1], d = h[(r0 + 1) * w + c0], e = h[(r0 + 1) * w + c0 + 1];
  return (a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr;
}

export function heightAt(f: TerrainField, x: number, z: number): number {
  const { mx, my } = mapOf(f.lonDeg, x, z);
  for (const l of f.levels) { const h = sample(l, mx, my); if (h !== null) return h; }
  if (f.levels.length === 0) return -(mx * mx + my * my) / (2 * R_MOON_M);
  return -1e6;
}

/** The cell size of the finest level that holds a point (the coarsest's outside them all). */
export function cellAt(f: TerrainField, x: number, z: number): number {
  const { mx, my } = mapOf(f.lonDeg, x, z);
  for (const l of f.levels) if (sample(l, mx, my) !== null) return l.cell;
  return f.levels.length ? f.levels[f.levels.length - 1].cell : 20;
}
```

`shadowRule.ts`:

```ts
import type { Vec3 } from './frames';
import { cellAt, heightAt, type TerrainField } from './terrainField';

/** The per-pixel shadow rule shared by the shader and its TypeScript twin. */
export const SHADOW = { T0_CELLS: 1.3, T0_MIN_M: 24, GROWTH: 1.115, STEPS: 96, MAX_M: 150000, TOL: 0.0022, SUN_RADIUS_RAD: 0.00466 } as const;

/**
 * Fraction of the Sun's disc in view from a point (world metres, the site's frame): the steepest rise of
 * the ground towards the Sun against the Sun's elevation, the engine's rule, with the disc's radius for
 * the penumbra. Samples grow geometrically from just beyond the point's own cell to 150 km.
 */
export function sunFraction(f: TerrainField, x: number, y: number, z: number, sun: Vec3): number {
  const horiz = Math.hypot(sun[0], sun[2]); const elSun = Math.atan2(sun[1], horiz);
  const dx = sun[0] / horiz, dz = sun[2] / horiz;
  let maxTan = -10, t = Math.max(SHADOW.T0_MIN_M, SHADOW.T0_CELLS * cellAt(f, x, z));
  for (let i = 0; i < SHADOW.STEPS; i++) {
    const h = heightAt(f, x + dx * t, z + dz * t); if (h < -9e5) break;
    maxTan = Math.max(maxTan, (h - y) / t - SHADOW.TOL);
    t *= SHADOW.GROWTH; if (t > SHADOW.MAX_M) break;
  }
  const elHill = Math.atan(maxTan);
  return Math.min(1, Math.max(0, (elSun - elHill) / (2 * SHADOW.SUN_RADIUS_RAD) + 0.5));
}

/** The same rule for the ground's fragment shader, over three height textures (finest first). */
export const SHADOW_GLSL = /* glsl */ `
uniform sampler2D uH0, uH1, uH2; uniform vec3 uL0, uL1, uL2; uniform vec2 uS0, uS1, uS2; uniform vec2 uCS; uniform int uLevels, uSteps;
vec2 toMap(vec2 xz) { float n = -xz.y; return vec2(xz.x * uCS.x + n * uCS.y, -xz.x * uCS.y + n * uCS.x); }
float lev(sampler2D t, vec3 L, vec2 S, vec2 m, out bool inside) {
  float c = L.x + m.x / L.z, r = L.y - m.y / L.z;
  inside = c > 1.0 && r > 1.0 && c < S.x - 2.0 && r < S.y - 2.0;
  return textureLod(t, vec2((c + 0.5) / S.x, (r + 0.5) / S.y), 0.0).r;
}
float heightAt(vec2 xz) {
  vec2 m = toMap(xz); bool ins;
  if (uLevels == 0) return -dot(m, m) / (2.0 * 1737400.0);
  float h = lev(uH0, uL0, uS0, m, ins); if (ins) return h;
  if (uLevels > 1) { h = lev(uH1, uL1, uS1, m, ins); if (ins) return h; }
  if (uLevels > 2) { h = lev(uH2, uL2, uS2, m, ins); if (ins) return h; }
  return -1.0e6;
}
float cellAt(vec2 xz) {
  vec2 m = toMap(xz); bool ins;
  if (uLevels == 0) return 20.0;
  lev(uH0, uL0, uS0, m, ins); if (ins) return uL0.z;
  if (uLevels > 1) { lev(uH1, uL1, uS1, m, ins); if (ins) return uL1.z; }
  return uLevels > 2 ? uL2.z : (uLevels > 1 ? uL1.z : uL0.z);
}
float sunFraction(vec3 p, vec3 sun) {
  float horiz = length(sun.xz); float elSun = atan(sun.y, horiz); vec2 dir = sun.xz / horiz;
  float maxTan = -10.0; float t = max(${SHADOW.T0_MIN_M.toFixed(1)}, ${SHADOW.T0_CELLS} * cellAt(p.xz));
  for (int i = 0; i < ${SHADOW.STEPS}; i++) {
    if (i >= uSteps) break;
    float h = heightAt(p.xz + dir * t); if (h < -9.0e5) break;
    maxTan = max(maxTan, (h - p.y) / t - ${SHADOW.TOL});
    t *= ${SHADOW.GROWTH}; if (t > ${SHADOW.MAX_M.toFixed(1)}) break;
  }
  return clamp((elSun - atan(maxTan)) / (2.0 * ${SHADOW.SUN_RADIUS_RAD}) + 0.5, 0.0, 1.0);
}
`;
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/lib/sky/terrainField.test.ts src/lib/sky/shadowRule.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS (the agreement test at 97 % or more); clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/terrainField.ts web/src/lib/sky/shadowRule.ts web/src/lib/sky/terrainField.test.ts web/src/lib/sky/shadowRule.test.ts
git commit -m "feat(web): the stand view's terrain field and shadow rule, agreeing with the engine's sweep"
```

### Task 4: The words and the address

**Files:**
- Create: `web/src/lib/viz/stand.ts`, `web/src/lib/viz/stand.test.ts`
- Modify: `web/src/lib/links.ts` (`standHref`), `web/src/lib/links.test.ts` (create if missing)

**Interfaces:**
- Consumes: `groundWords(series, hour)`, `Series`, `PowerResult` (`powered: Uint8Array`, `firstBrownoutHour: number | null`), `dateLong(startUtc, hour)`, `parseExploreQuery`.
- Produces:
  - `standQuery(search: string | URLSearchParams): ExploreQuery & { hour?: number }` (hour: integer ≥ 0, else left out)
  - `standHref(siteId: string, startUtc: string, days: number, hour: number): string` → `/explore/stand?site=…&start=YYYY-MM-DD&days=…&hour=…` (start written as `exploreHref` writes it)
  - `landerState(power: PowerResult | null, startUtc: string, hour: number): { on: boolean; text: string }`
  - `skyLabel(body: 'sun' | 'earth', series: Series, hour: number): string`
  - `liveSentence(series: Series, hour: number): string` (the ground panel's two sentences, joined)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { standHref } from '@/lib/links';
import { landerState, liveSentence, skyLabel, standQuery } from './stand';

const series = (o: Partial<Record<'sunEl' | 'sunAz' | 'sunFraction' | 'earthEl' | 'earthAz' | 'earthVisible', number[]>>): Series => {
  const hours = (o.sunEl ?? [0]).length;
  const f = (a?: number[], v = 0) => Float64Array.from(a ?? new Array(hours).fill(v));
  return { i0: 0, hours, sunAz: f(o.sunAz, 300), sunEl: f(o.sunEl), earthAz: f(o.earthAz, 70), earthEl: f(o.earthEl), sunFraction: f(o.sunFraction), earthVisible: Uint8Array.from(o.earthVisible ?? new Array(hours).fill(0)), sunAu: f(undefined, 1) } as Series;
};

describe('the stand view’s words', () => {
  it('reads the hour from the address, and leaves out what it cannot use', () => {
    expect(standQuery('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10')).toEqual({ site: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, hour: 10 });
    expect(standQuery('?hour=-3').hour).toBeUndefined();
    expect(standQuery('?hour=ten').hour).toBeUndefined();
    expect(standQuery('?hour=2.5').hour).toBeUndefined();
  });
  it('links to the view for a site, a period and an hour', () => {
    expect(standHref('de_gerlache_rim_2', '2027-01-01T00:00:00', 30, 10)).toBe('/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
  });
  it('labels the Sun and Earth by what they are doing', () => {
    const s = series({ sunEl: [2.4, 1.0, -0.5], sunFraction: [1, 0, 0], earthEl: [4.5, 1.2, -3], earthVisible: [1, 0, 0] });
    expect(skyLabel('sun', s, 0)).toBe('Sun 2.4° up');
    expect(skyLabel('sun', s, 1)).toBe('Sun, behind the hills');
    expect(skyLabel('sun', s, 2)).toBe('Sun, below the horizon');
    expect(skyLabel('earth', s, 0)).toBe('Earth 4.5° up');
    expect(skyLabel('earth', s, 1)).toBe('Earth, behind the hills');
    expect(skyLabel('earth', s, 2)).toBe('Earth, below the horizon');
  });
  it('says when the lander has power, when it went off, when it comes back, and when it never does', () => {
    const powered = Uint8Array.from([...new Array(76).fill(1), ...new Array(390).fill(0), ...new Array(254).fill(1)]);
    const p = { powered, firstBrownoutHour: 76 } as unknown as PowerResult;
    expect(landerState(p, '2027-01-01T00:00:00', 10)).toEqual({ on: true, text: 'The lander has power.' });
    expect(landerState(p, '2027-01-01T00:00:00', 100)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 4 January. Power comes back on 20 January.' });
    expect(landerState(p, '2027-01-01T00:00:00', 500)).toEqual({ on: true, text: 'The lander has power again since 20 January.' });
    const never = { powered: Uint8Array.from([1, 1, 0, 0]), firstBrownoutHour: 2 } as unknown as PowerResult;
    expect(landerState(never, '2027-01-01T00:00:00', 3).text).toBe('The lander is off: its battery ran out on 1 January. Power does not come back in this period.');
  });
  it('joins the ground panel’s two sentences, in total darkness too', () => {
    const s = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(liveSentence(s, 0)).toBe('It is night at the site: the Sun is below the horizon, to the north-west. Earth is below the horizon: no radio contact.');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `stand.ts` and `standHref`

```ts
// web/src/lib/viz/stand.ts
import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { parseExploreQuery, type ExploreQuery } from '../store/query';
import { dateLong } from './format';
import { groundWords } from './ground';

/** Explore's address plus the hour the view opens on. */
export function standQuery(search: string | URLSearchParams): ExploreQuery & { hour?: number } {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const out: ExploreQuery & { hour?: number } = parseExploreQuery(q);
  const raw = q.get('hour');
  if (raw !== null && /^\d{1,5}$/.test(raw)) out.hour = Number(raw);
  return out;
}

const deg = (v: number) => `${v.toFixed(1)}°`;

export function skyLabel(body: 'sun' | 'earth', s: Series, hour: number): string {
  if (body === 'sun') return s.sunEl[hour] < 0 ? 'Sun, below the horizon' : s.sunFraction[hour] > 0 ? `Sun ${deg(s.sunEl[hour])} up` : 'Sun, behind the hills';
  return s.earthEl[hour] < 0 ? 'Earth, below the horizon' : s.earthVisible[hour] === 1 ? `Earth ${deg(s.earthEl[hour])} up` : 'Earth, behind the hills';
}

export function liveSentence(s: Series, hour: number): string {
  const w = groundWords(s, hour);
  return `${w.sun} ${w.earth}`;
}

export function landerState(p: PowerResult | null, startUtc: string, hour: number): { on: boolean; text: string } {
  if (!p) return { on: true, text: 'Working out the lander’s power…' };
  if (p.powered[hour] === 1) {
    const off = p.firstBrownoutHour;
    return off !== null && hour > off ? { on: true, text: `The lander has power again since ${dateLong(startUtc, backAfter(p, off))}.` } : { on: true, text: 'The lander has power.' };
  }
  const off = p.firstBrownoutHour ?? hour;
  const back = backAfter(p, hour);
  const when = back < p.powered.length ? `Power comes back on ${dateLong(startUtc, back)}.` : 'Power does not come back in this period.';
  return { on: false, text: `The lander is off: its battery ran out on ${dateLong(startUtc, off)}. ${when}` };
}

function backAfter(p: PowerResult, from: number): number {
  let h = from; while (h < p.powered.length && p.powered[h] === 0) h++; return h;
}
```

In `web/src/lib/links.ts` add, next to `exploreHref`:

```ts
/** The stand view for a site, period and hour. */
export function standHref(siteId: string, startUtc: string, days: number, hour: number): string {
  return `${exploreHref(siteId, startUtc, days).replace('/explore?', '/explore/stand?')}&hour=${hour}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/lib/links && npx tsc --noEmit && npm run lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/stand.ts web/src/lib/viz/stand.test.ts web/src/lib/links.ts
git commit -m "feat(web): the stand view's words: the live sentence, the lander's state, the sky labels and the address"
```

### Task 5: The renderer

**Files:**
- Create: `web/src/lib/sky/shaders.ts`, `web/src/lib/sky/standRenderer.ts`, `web/src/lib/sky/standRenderer.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3 (`dirAzEl`, `enuBasis`, `moonMatrixAt`, `placeStars`, `starColour`, `starSize`, `starGain`, `earthAxes`, `earthLitFraction`, `TerrainField`, `SHADOW_GLSL`), `Series`, `MaskDoc.elevation_deg` and its `az0_deg`/`az_step_deg` (default 0 and 0.5).
- Produces:
  - `interface StandScene { field: TerrainField; mask: { az0: number; step: number; el: ArrayLike<number> }; series: Series; startUtc: string; site: { lat: number; lon: number }; mastM: number; sky: SkyAssets; quality?: 'full' | 'fast' }` (`fast`: pixel ratio 0.75, no drawn detail, 48 shadow steps)
  - `class StandRenderer { constructor(canvas: HTMLCanvasElement, scene: StandScene); setTime(hour: number): void; setView(yawDeg: number, pitchDeg: number, fovDeg: number): void; resize(w: number, h: number): void; render(): void; project(world: Vec3): { x: number; y: number; visible: boolean }; sunWorld(): Vec3; earthWorld(): Vec3; dispose(): void }`
  - `buildScene(scene: StandScene): { root: THREE.Scene; update(hour: number): void; parts: { ground: THREE.Mesh[]; stars: THREE.Points; earth: THREE.Mesh; sun: THREE.Sprite } }` (no WebGL needed; the renderer wraps it)

- [ ] **Step 1: Write the failing test** (three.js scene graphs build in Node without WebGL)

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildScene } from './standRenderer';
import { flatField } from './terrainField';
import type { Series } from '@/lib/engine/metrics';

const hours = 3;
const series = { i0: 0, hours, sunAz: Float64Array.from([300, 301, 302]), sunEl: Float64Array.from([2, 1, -1]), earthAz: Float64Array.from([70, 70, 70]), earthEl: Float64Array.from([4, 4, 4]), sunFraction: Float64Array.from([1, 1, 0]), earthVisible: Uint8Array.from([1, 1, 1]), sunAu: Float64Array.from([1, 1, 1]) } as Series;
const sky = { stars: { count: 2, j2000: Float32Array.from([1, 0, 0, 0, 0, 1]), vmag: Float32Array.from([1, 5]), bv: Float32Array.from([0, 1]) }, moon: { startMs: Date.parse('2024-01-01T00:00:00Z'), stepMs: 6 * 3600e3, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) }, earthDayUrl: 'day.jpg', earthCloudsUrl: 'clouds.jpg' };

describe('the stand scene', () => {
  it('puts the Sun, Earth and stars on the sky sphere, in the directions of the hour', () => {
    const s = buildScene({ field: flatField(0), mask: { az0: 0, step: 0.5, el: new Array(720).fill(0) }, series, startUtc: '2027-01-01T00:00:00', site: { lat: -88.28, lon: -64.31 }, mastM: 2, sky });
    s.update(0);
    const sun = s.parts.sun.position.clone().normalize();
    expect(THREE.MathUtils.radToDeg(Math.asin(sun.y))).toBeCloseTo(2, 1);
    expect(s.parts.stars.geometry.getAttribute('position').count).toBe(2);
    s.update(2);
    const mat = s.parts.ground[0].material as THREE.ShaderMaterial;
    const u = mat.uniforms.uSun.value as THREE.Vector3;
    expect(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.z)).toBe(true);
    expect(THREE.MathUtils.radToDeg(Math.asin(u.y))).toBeCloseTo(-1, 1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/lib/sky/standRenderer.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the shaders** (`shaders.ts`; the approved mockup's, with the shared shadow rule)

```ts
import { SHADOW_GLSL } from './shadowRule';

export const GROUND_VERT = /* glsl */ `
varying vec3 vWorld; varying vec3 vNormal;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w;
#include <logdepthbuf_vertex>
}`;

export const GROUND_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld; varying vec3 vNormal;
uniform vec3 uSun, uEarth; uniform float uEarthshine, uDetail, uSunPower; uniform vec2 uHole;
${SHADOW_GLSL}
#include <logdepthbuf_pars_fragment>
vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float hash1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1, 0)), u.x), mix(hash1(i + vec2(0, 1)), hash1(i + vec2(1, 1)), u.x), u.y); }
float craters(vec2 p, float cell) { vec2 g = floor(p / cell), f = p / cell - g; float h = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)); vec2 rnd = hash2(g + o); vec2 c = o + rnd;
    float rad = mix(0.12, 0.42, fract(rnd.x * 17.31 + rnd.y)); float r = length(f - c) / rad;
    if (r < 1.8) { float bowl = r < 1.0 ? (r * r - 1.0) : 0.0; float rim = 0.32 * exp(-pow((r - 1.0) * 3.2, 2.0)); h += (bowl * 0.24 + rim) * rad * cell; } }
  return h; }
float detailH(vec2 p) { return craters(p, 46.0) * 0.55 + craters(p + 17.0, 11.0) * 0.6 + craters(p + 93.0, 2.6) * 0.6 + (vnoise(p * 0.9) - 0.5) * 0.35 + (vnoise(p * 3.7) - 0.5) * 0.12; }
void main() {
  #include <logdepthbuf_fragment>
  vec2 m = toMap(vWorld.xz);
  if (abs(m.x) < uHole.x && abs(m.y) < uHole.y) discard;
  vec3 Nn = normalize(vNormal); float dist = length(vWorld - cameraPosition); float albedoVar = 1.0;
  if (uDetail > 0.5) { float w = 1.0 - smoothstep(250.0, 1600.0, dist);
    if (w > 0.0) { float e = max(0.15, dist * 0.004); float h0 = detailH(vWorld.xz), hx = detailH(vWorld.xz + vec2(e, 0.0)), hz = detailH(vWorld.xz + vec2(0.0, e));
      Nn = normalize(Nn - vec3((hx - h0) / e, 0.0, (hz - h0) / e) * w * 1.15); albedoVar += w * (0.12 * (vnoise(vWorld.xz * 0.21) - 0.5) + 0.25 * max(0.0, h0) / 3.0); } }
  albedoVar += 0.1 * (vnoise(vWorld.xz * 0.004) - 0.5);
  vec3 Ls = normalize(uSun), V = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(Nn, Ls), 0.0), mu = max(dot(Nn, V), 0.03);
  float alpha = acos(clamp(dot(Ls, V), -1.0, 1.0));
  float phase = exp(-0.82 * alpha); float surge = 1.0 + 0.9 / (1.0 + tan(alpha * 0.5) / 0.055); float ls = mu0 / (mu0 + mu);
  float vis = mu0 > 0.0 ? sunFraction(vWorld + Nn * 0.4, uSun) : 0.0;
  vec3 albedo = vec3(0.17, 0.164, 0.156) * albedoVar;
  vec3 col = albedo * vec3(1.0, 0.99, 0.975) * uSunPower * ls * phase * surge * vis;
  vec3 Le = normalize(uEarth); float mue = max(dot(Nn, Le), 0.0); col += albedo * vec3(0.5, 0.62, 1.0) * uEarthshine * mue / (mue + mu);
  gl_FragColor = vec4(col, 1.0);
}`;

export const EARTH_VERT = /* glsl */ `
varying vec3 vN; varying vec2 vUv; varying vec3 vW;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
#include <logdepthbuf_vertex>
}`;

export const EARTH_FRAG = /* glsl */ `
uniform sampler2D uDay, uClouds; uniform vec3 uSun; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vN), l = normalize(uSun), v = normalize(cameraPosition - vW); float d = dot(n, l); float lit = smoothstep(-0.06, 0.2, d);
  vec3 day = texture2D(uDay, vUv).rgb; float cl = texture2D(uClouds, vUv).r; vec3 base = mix(day * vec3(0.92, 0.98, 1.08), vec3(1.0), cl * 0.92);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  gl_FragColor = vec4(base * lit * 0.95 + vec3(0.28, 0.5, 1.0) * rim * smoothstep(-0.25, 0.35, d) * 0.5, 1.0);
}`;

export const STAR_VERT = /* glsl */ `
attribute float size; varying vec3 vC; uniform float uPx;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uPx;
#include <logdepthbuf_vertex>
}`;

export const STAR_FRAG = /* glsl */ `
varying vec3 vC; uniform float uGain;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(p)); gl_FragColor = vec4(vC * a * uGain, a);
}`;
```

- [ ] **Step 4: Implement the scene and the renderer** (`standRenderer.ts`)

```ts
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { SkyAssets } from '../data/sky';
import type { Series } from '../engine/metrics';
import { earthAxes, earthLitFraction } from './earth';
import { dirAzEl, enuBasis, type Vec3 } from './frames';
import { moonMatrixAt } from './moonOrientation';
import { EARTH_FRAG, EARTH_VERT, GROUND_FRAG, GROUND_VERT, STAR_FRAG, STAR_VERT } from './shaders';
import { SHADOW } from './shadowRule';
import { placeStars, starColour, starGain, starSize } from './stars';
import { worldOf, type FieldLevel, type TerrainField } from './terrainField';

export interface StandScene { field: TerrainField; mask: { az0: number; step: number; el: ArrayLike<number> }; series: Series; startUtc: string; site: { lat: number; lon: number }; mastM: number; sky: SkyAssets; quality?: 'full' | 'fast' }

const RS = 300000, RING = 200000, DEG = Math.PI / 180, R_MOON = 1737400;
const SUN_D = 2 * RS * Math.tan(0.2665 * DEG), EARTH_R = RS * Math.tan(0.95 * DEG);
const MESH_HALF_M = [5000, 20500, 125000];   // the part of each level the ground mesh draws (finest first)

const lerpAngle = (a: number, b: number, f: number) => ((a + ((((b - a + 540) % 360) - 180) * f)) % 360 + 360) % 360;
function sampleSeries(s: Series, t: number) {
  const i = Math.min(s.hours - 1, Math.floor(t)), j = Math.min(s.hours - 1, i + 1), f = t - i;
  return { sunAz: lerpAngle(s.sunAz[i], s.sunAz[j], f), sunEl: s.sunEl[i] + (s.sunEl[j] - s.sunEl[i]) * f, earthAz: lerpAngle(s.earthAz[i], s.earthAz[j], f), earthEl: s.earthEl[i] + (s.earthEl[j] - s.earthEl[i]) * f };
}

function heightTexture(l: FieldLevel): THREE.DataTexture {
  const half = new Uint16Array(l.heights.length);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(l.heights[i]);
  const t = new THREE.DataTexture(half, l.cols, l.rows, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t;
}

function groundMesh(l: FieldLevel, lonDeg: number, halfM: number, material: THREE.ShaderMaterial, flattenM: number): THREE.Mesh {
  const halfC = Math.min(Math.floor(halfM / l.cell), Math.floor((l.cols - 3) / 2)), halfR = Math.min(Math.floor(halfM / l.cell), Math.floor((l.rows - 3) / 2));
  const c0 = Math.max(1, Math.round(l.siteCol) - halfC), c1 = Math.min(l.cols - 2, Math.round(l.siteCol) + halfC);
  const r0 = Math.max(1, Math.round(l.siteRow) - halfR), r1 = Math.min(l.rows - 2, Math.round(l.siteRow) + halfR);
  const cols = c1 - c0 + 1, rows = r1 - r0 + 1, pos = new Float32Array(cols * rows * 3), nor = new Float32Array(cols * rows * 3);
  const h = (r: number, c: number) => l.heights[r * l.cols + c];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = (r - r0) * cols + (c - c0), mx = (c - l.siteCol) * l.cell, my = -(r - l.siteRow) * l.cell, w = worldOf(lonDeg, mx, my);
    const pad = flattenM > 0 ? Math.min(1, Math.max(0, (Math.hypot(mx, my) - flattenM) / 60)) : 1;
    pos[k * 3] = w.x; pos[k * 3 + 1] = h(r, c) * pad; pos[k * 3 + 2] = w.z;
    const gx = (h(r, c + 1) - h(r, c - 1)) / (2 * l.cell), gy = (h(r - 1, c) - h(r + 1, c)) / (2 * l.cell);
    const g = worldOf(lonDeg, -gx, -gy), len = Math.hypot(g.x, 1, g.z);
    nor[k * 3] = g.x / len; nor[k * 3 + 1] = 1 / len; nor[k * 3 + 2] = g.z / len;
  }
  const idx = new Uint32Array((rows - 1) * (cols - 1) * 6); let n = 0;
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; idx[n++] = a; idx[n++] = d; idx[n++] = b; idx[n++] = b; idx[n++] = d; idx[n++] = e; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false; return mesh;
}

/** The scene graph for a site and period; `update(hour)` moves the Sun, Earth and stars and sets the shaders' light. */
export function buildScene(scene: StandScene) {
  const root = new THREE.Scene(); root.background = new THREE.Color(0x000000);
  const basis = enuBasis(scene.site.lat, scene.site.lon), eye = scene.mastM, levels = scene.field.levels;
  const tex = [0, 1, 2].map((i) => (levels[i] ? heightTexture(levels[i]) : new THREE.DataTexture(new Uint16Array([0]), 1, 1, THREE.RedFormat, THREE.HalfFloatType)));
  const lv = (i: number) => new THREE.Vector3(levels[i]?.siteCol ?? 0, levels[i]?.siteRow ?? 0, levels[i]?.cell ?? 1);
  const sz = (i: number) => new THREE.Vector2(levels[i]?.cols ?? 1, levels[i]?.rows ?? 1);
  const c = Math.cos(scene.field.lonDeg * DEG), s = Math.sin(scene.field.lonDeg * DEG);
  const uniforms = (detail: number, hole: number) => ({
    uH0: { value: tex[0] }, uH1: { value: tex[1] }, uH2: { value: tex[2] }, uL0: { value: lv(0) }, uL1: { value: lv(1) }, uL2: { value: lv(2) }, uS0: { value: sz(0) }, uS1: { value: sz(1) }, uS2: { value: sz(2) },
    uCS: { value: new THREE.Vector2(c, s) }, uLevels: { value: levels.length }, uSteps: { value: scene.quality === 'fast' ? 48 : SHADOW.STEPS }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uEarth: { value: new THREE.Vector3(0, 1, 0) },
    uEarthshine: { value: 0 }, uDetail: { value: scene.quality === 'fast' ? 0 : detail }, uSunPower: { value: 3.4 }, uHole: { value: new THREE.Vector2(hole, hole) },
  });
  const ground: THREE.Mesh[] = [];
  if (levels.length === 0) {
    const flat = new THREE.Mesh(new THREE.CircleGeometry(150000, 256).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: uniforms(1, 0), vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG }));
    const p = flat.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, -(x * x + z * z) / (2 * R_MOON)); }
    flat.geometry.computeVertexNormals(); ground.push(flat);
  } else {
    levels.forEach((l, i) => {
      const hole = i === 0 ? 0 : MESH_HALF_M[i - 1] - 40;
      const mat = new THREE.ShaderMaterial({ uniforms: uniforms(i === 0 ? 1 : 0, hole), vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, polygonOffset: i > 0, polygonOffsetFactor: i, polygonOffsetUnits: i * 4 });
      ground.push(groundMesh(l, scene.field.lonDeg, MESH_HALF_M[i] ?? 125000, mat, i === 0 ? 25 : 0));
    });
  }
  ground.forEach((g) => root.add(g));

  // The skyline beyond the measured ground: the site's horizon as a dark ring.
  const ringPos = new Float32Array(721 * 6), ringIdx: number[] = [];
  for (let i = 0; i <= 720; i++) {
    const az = (scene.mask.az0 + (i % 720) * scene.mask.step) * DEG, el = Number(scene.mask.el[i % scene.mask.el.length]) * DEG, x = RING * Math.sin(az), z = -RING * Math.cos(az);
    ringPos.set([x, eye + RING * Math.tan(el), z, x, eye - (RING * RING) / (2 * R_MOON) - 6000, z], i * 6);
    if (i < 720) { const a = i * 2; ringIdx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  }
  const ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3)); ringGeo.setIndex(ringIdx);
  root.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x090908, side: THREE.DoubleSide })));

  // Stars.
  const st = scene.sky.stars, starPos = new Float32Array(st.count * 3), starCol = new Float32Array(st.count * 3), size = new Float32Array(st.count);
  for (let i = 0; i < st.count; i++) { const col = starColour(st.bv[i]), g = starGain(st.vmag[i]); starCol.set([col[0] * g, col[1] * g, col[2] * g], i * 3); size[i] = starSize(st.vmag[i]); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3)); starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3)); starGeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const starMat = new THREE.ShaderMaterial({ uniforms: { uGain: { value: 1 }, uPx: { value: 1 } }, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(starGeo, starMat); root.add(stars);

  // The Sun: a white disc, glare and a faint six-spike flare.
  const tex2 = (draw: (g: CanvasRenderingContext2D) => void) => { if (typeof document === 'undefined') return null; const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d'); if (!g) return null; draw(g); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const radial = (stops: [number, string][]) => tex2((g) => { const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256); for (const [o, cl] of stops) grd.addColorStop(o, cl); g.fillStyle = grd; g.fillRect(0, 0, 512, 512); });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, '#fff'], [0.46, '#fff'], [0.5, 'rgba(255,255,255,0)']]), color: new THREE.Color(14, 14, 13.5), transparent: true, depthWrite: false, toneMapped: false }));
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,255,255,0.55)'], [0.06, 'rgba(240,244,255,0.2)'], [0.3, 'rgba(220,230,255,0.035)'], [1, 'rgba(0,0,0,0)']]), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const spikes = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex2((g) => { g.translate(256, 256); for (let k = 0; k < 6; k++) { g.rotate(Math.PI / 3); const grd = g.createLinearGradient(0, 0, 250, 0); grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, -1.2, 250, 2.4); } }), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
  sun.scale.setScalar(SUN_D * 2.05); glare.scale.setScalar(SUN_D * 34); spikes.scale.setScalar(SUN_D * 26); root.add(sun, glare, spikes);

  // Earth.
  const loader = typeof document === 'undefined' ? null : new THREE.TextureLoader();
  const day = loader ? loader.load(scene.sky.earthDayUrl) : null; if (day) day.colorSpace = THREE.SRGBColorSpace;
  const clouds = loader ? loader.load(scene.sky.earthCloudsUrl) : null;
  const earthMat = new THREE.ShaderMaterial({ uniforms: { uDay: { value: day }, uClouds: { value: clouds }, uSun: { value: new THREE.Vector3(1, 0, 0) } }, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 48), earthMat); earth.matrixAutoUpdate = false; root.add(earth);

  const startMs = Date.parse(scene.startUtc + 'Z');
  function update(t: number) {
    const v = sampleSeries(scene.series, t), sd = dirAzEl(v.sunAz, v.sunEl), ed = dirAzEl(v.earthAz, v.earthEl);
    sun.position.set(sd[0] * RS, sd[1] * RS + eye, sd[2] * RS); glare.position.copy(sun.position); spikes.position.copy(sun.position);
    const m = moonMatrixAt(scene.sky.moon, startMs + t * 3600e3);
    placeStars(scene.sky.stars, m, basis, RS, starPos); starGeo.getAttribute('position').needsUpdate = true;
    const ax = earthAxes(m, basis, startMs + t * 3600e3);
    earth.matrix.makeBasis(new THREE.Vector3(...ax.x), new THREE.Vector3(...ax.y), new THREE.Vector3(...ax.z)).setPosition(ed[0] * RS, ed[1] * RS + eye, ed[2] * RS); earth.matrixWorldNeedsUpdate = true;
    earthMat.uniforms.uSun.value.set(...sd);
    const full = earthLitFraction(sd as Vec3, ed as Vec3);
    for (const g of ground) { const u = (g.material as THREE.ShaderMaterial).uniforms; u.uSun.value.set(...sd); u.uEarth.value.set(...ed); u.uEarthshine.value = v.earthEl > -0.5 ? 0.25 * full : 0; }
    const h = Math.min(scene.series.hours - 1, Math.round(t)); starMat.uniforms.uGain.value = scene.series.sunFraction[h] > 0 ? 0.35 : 1.6;
  }
  return { root, update, parts: { ground, stars, earth, sun } };
}

/** The WebGL side: camera, bloom, quality; throws when WebGL 2 is not available. */
export class StandRenderer {
  private renderer: THREE.WebGLRenderer; private composer: EffectComposer; private bloom: UnrealBloomPass; private camera: THREE.PerspectiveCamera; private built: ReturnType<typeof buildScene>; private eye: number;
  constructor(canvas: HTMLCanvasElement, scene: StandScene) {
    if (!canvas.getContext('webgl2')) throw new Error('WebGL 2 is not available');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(scene.quality === 'fast' ? 0.75 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.eye = scene.mastM; this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 700000); this.camera.position.set(0, this.eye, 0);
    this.built = buildScene(scene);
    (this.built.parts.stars.material as THREE.ShaderMaterial).uniforms.uPx.value = this.renderer.getPixelRatio();
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.built.root, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 0.985); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
  }
  setTime(hour: number) { this.built.update(hour); }
  setView(yawDeg: number, pitchDeg: number, fovDeg: number) { const d = dirAzEl(yawDeg, pitchDeg); this.camera.fov = fovDeg; this.camera.updateProjectionMatrix(); this.camera.lookAt(d[0], this.eye + d[1], d[2]); }
  resize(w: number, h: number) { this.renderer.setSize(w, h, false); this.composer.setSize(w, h); this.bloom.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  render() { this.composer.render(); }
  project(world: Vec3) { const p = new THREE.Vector3(...world).project(this.camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, visible: p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 }; }
  sunWorld(): Vec3 { const p = this.built.parts.sun.position; return [p.x, p.y, p.z]; }
  earthWorld(): Vec3 { const e = new THREE.Vector3().setFromMatrixPosition(this.built.parts.earth.matrix); return [e.x, e.y, e.z]; }
  dispose() { this.renderer.dispose(); this.built.root.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); }
}
```

- [ ] **Step 5: Run the test, the types and lint**

Run: `cd web && npx vitest run src/lib/sky && npx tsc --noEmit && npm run lint`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/sky/shaders.ts web/src/lib/sky/standRenderer.ts web/src/lib/sky/standRenderer.test.ts
git commit -m "feat(web): the stand view's renderer: NASA ground to 125 km, regolith light, the engine's shadows, the white Sun, Earth and the stars"
```

### Task 6: The view, the route and the ways in

**Files:**
- Create: `web/src/components/stand/StandView.tsx`, `web/src/components/stand/StandCanvas.tsx`, `web/src/components/stand/StandView.test.tsx`, `web/src/app/explore/stand/page.tsx`
- Modify: `web/src/components/explore/GroundPanel.tsx` (+ test), `web/src/components/explore/VerdictPanel.tsx` (+ test), `web/src/components/ExploreView.tsx` (pass the stand link), `web/src/app/globals.css` (the dark values also on `.theme-dark`, so the time bar under the black sky is dark in either theme: change the selector `:root[data-theme="dark"]` to `:root[data-theme="dark"], .theme-dark`)

**Interfaces:**
- Consumes: `exploreStore` (`init`, `applyQuery`, `setCursor`, `site`, `series`, `power`, `summary`, `best`, `mask`, `maskMeta`, `heightmap`, `contextHeightmap`, `capHeightmap`, `params`, `startUtc`, `days`, `cursorHour`, `status`), `shadowLevels`, `terrainField`, `flatField`, `loadSkyAssets`, `StandRenderer`, `standQuery`, `standHref`, `liveSentence`, `landerState`, `skyLabel`, `answerFor`, `TimeBar`, `HorizonView`.
- Produces: `StandView({ store?, createRenderer? }: { store?: StoreApi<ExploreState>; createRenderer?: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike })` where `RendererLike = Pick<StandRenderer, 'setTime' | 'setView' | 'resize' | 'render' | 'project' | 'sunWorld' | 'earthWorld' | 'dispose'>`.

- [ ] **Step 1: Write the failing tests** (`StandView.test.tsx`, with a stub renderer; the real one needs WebGL)

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { StandView } from './StandView';

vi.mock('@/lib/data/sky', () => ({ loadSkyAssets: async () => ({ stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() }, moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) }, earthDayUrl: '', earthCloudsUrl: '' }) }));
const stub = () => ({ setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), project: () => ({ x: 0.5, y: 0.5, visible: true }), sunWorld: () => [0, 0, -1] as [number, number, number], earthWorld: () => [1, 0, 0] as [number, number, number], dispose: vi.fn() });

async function open(search: string, createRenderer = stub) {
  window.history.replaceState(null, '', `/explore/stand${search}`);
  const store = createExploreStore(fileLoaders());
  render(<StandView store={store} createRenderer={() => createRenderer()} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing at/), { timeout: 20_000 });
  return store;
}

describe('StandView', () => {
  it('opens on the site, period and hour of the address, with the answer, the live sentence, the lander and the time bar', async () => {
    const store = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    expect(store.getState().cursorHour).toBe(10);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night');
    expect(screen.getByText(/^The site is in sunlight: the Sun is/)).toBeTruthy();
    expect(screen.getByText('The lander has power.')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Explore' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    for (const name of ['Face the Sun', 'Face Earth', 'Look up']) expect(screen.getByRole('button', { name })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('N')).toBeTruthy());
    expect(document.querySelector('.theme-dark')).toBeTruthy();
    expect(screen.getByText(/the small craters underfoot are drawn, not measured/)).toBeTruthy();
  });
  it('clamps an hour beyond the period to its last hour', async () => {
    const store = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=14&hour=99999');
    expect(store.getState().cursorHour).toBe(14 * 24 - 1);
  });
  it('opens a site with no polar terrain on flat ground, with its words', async () => {
    await open('?site=blue_ghost_m1&start=2025-03-02T09:00&days=14&hour=0');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing at Blue Ghost/);
  });
  it('falls back to the view all round, with the same words, when the renderer cannot start', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => { throw new Error('WebGL 2 is not available'); });
    expect(screen.getByText(/This browser cannot draw the view from the site/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /^The view all round the site/ })).toBeTruthy();
    expect(screen.getByText(/^The site is in sunlight/)).toBeTruthy();
  });
  it('moves the time with the slider and labels the Sun and Earth for the hour', async () => {
    const store = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    act(() => store.getState().setCursor(300));
    await waitFor(() => expect(screen.getByText(/It is night at the site/)).toBeTruthy());
    expect(screen.getByText('Sun, below the horizon')).toBeTruthy();
  });
});
```

In `GroundPanel.test.tsx` add: the panel shows a link "Stand here" whose href is `standHref(site.id, startUtc, days, cursor)` for a polar site. In `VerdictPanel.test.tsx` add: the answer offers "Stand at the site" as a plain link (not gold) when a `standLink` prop is given.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/components/stand src/components/explore/GroundPanel.test.tsx src/components/explore/VerdictPanel.test.tsx`
Expected: FAIL, modules not found and links missing.

- [ ] **Step 3: Implement the canvas wrapper** (`StandCanvas.tsx`): owns the renderer, the look controls and the label positions.

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { dirAzEl, type Vec3 } from '@/lib/sky/frames';
import type { StandRenderer, StandScene } from '@/lib/sky/standRenderer';

export type RendererLike = Pick<StandRenderer, 'setTime' | 'setView' | 'resize' | 'render' | 'project' | 'sunWorld' | 'earthWorld' | 'dispose'>;
export interface LookTarget { yaw: number; pitch: number; fov: number }
type Spot = { x: number; y: number; visible: boolean };
export interface SkyLabels { sun: Spot; earth: Spot; compass: (Spot & { letter: string })[] }

/**
 * The sky from the site: drag, wheel and arrow keys look around; `look` turns the view smoothly; labels
 * follow the bodies and the compass points. The shown time glides to the hour (14 hours a second, faster
 * than Play's 12), so Play sweeps the shadows smoothly; a jump of more than 2 hours is taken at once.
 */
export function StandCanvas({ scene, hour, look, startYaw, reducedMotion, createRenderer, onLabels, onFail }: {
  scene: StandScene; hour: number; look: LookTarget | null; startYaw: number; reducedMotion: boolean;
  createRenderer: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike;
  onLabels: (l: SkyLabels) => void;
  onFail: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const r = useRef<RendererLike | null>(null);
  const view = useRef({ yaw: startYaw, pitch: reducedMotion ? 2 : 34, fov: 60 });
  const goal = useRef<LookTarget | null>(reducedMotion ? null : { yaw: startYaw, pitch: 2, fov: 60 });
  const hourRef = useRef(hour);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { hourRef.current = hour; }, [hour]);
  useEffect(() => { if (look) goal.current = look; }, [look]);
  useEffect(() => {
    const el = canvas.current!; let raf = 0;
    try { r.current = createRenderer(el, scene); } catch (e) { onFail(e instanceof Error ? e.message : String(e)); return; }
    const size = () => r.current?.resize(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight); size();
    window.addEventListener('resize', size);
    let shown = hourRef.current, last = performance.now();
    r.current.setTime(shown);
    const tick = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const d = hourRef.current - shown;
      if (d !== 0) { shown = Math.abs(d) > 2 ? hourRef.current : shown + Math.sign(d) * Math.min(Math.abs(d), dt * 14); r.current!.setTime(shown); }
      const v = view.current, g = goal.current;
      if (g) { v.yaw = (v.yaw + ((((g.yaw - v.yaw + 540) % 360) - 180) * 0.08) + 360) % 360; v.pitch += (g.pitch - v.pitch) * 0.08; v.fov += (g.fov - v.fov) * 0.08; if (Math.abs(g.pitch - v.pitch) < 0.05 && Math.abs(g.fov - v.fov) < 0.05) goal.current = null; }
      r.current!.setView(v.yaw, v.pitch, v.fov); r.current!.render();
      const compass = (['N', 'E', 'S', 'W'] as const).map((letter, k) => { const p = dirAzEl(k * 90, 0); return { letter, ...r.current!.project([p[0] * 2e5, scene.mastM, p[2] * 2e5]) }; });
      onLabels({ sun: r.current!.project(r.current!.sunWorld() as Vec3), earth: r.current!.project(r.current!.earthWorld() as Vec3), compass });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); r.current?.dispose(); r.current = null; };
  }, [scene, createRenderer, onFail, onLabels]);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  return (
    <canvas
      ref={canvas}
      aria-label="The sky and the ground seen from the site. Drag to look around."
      className={`fixed inset-0 h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch }; goal.current = null; setDragging(true); e.currentTarget.setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; const k = view.current.fov / (e.currentTarget.clientHeight || window.innerHeight); view.current.yaw = (d.yaw - (e.clientX - d.x) * k + 360) % 360; view.current.pitch = Math.max(-35, Math.min(85, d.pitch + (e.clientY - d.y) * k)); }}
      onPointerUp={() => { drag.current = null; setDragging(false); }}
      onWheel={(e) => { goal.current = null; view.current.fov = Math.max(14, Math.min(75, view.current.fov * (e.deltaY > 0 ? 1.08 : 0.93))); }}
      tabIndex={0}
      onKeyDown={(e) => { const v = view.current; if (e.key === 'ArrowLeft') v.yaw = (v.yaw - 3 + 360) % 360; if (e.key === 'ArrowRight') v.yaw = (v.yaw + 3) % 360; if (e.key === 'ArrowUp') v.pitch = Math.min(85, v.pitch + 3); if (e.key === 'ArrowDown') v.pitch = Math.max(-35, v.pitch - 3); if (e.key === '+') v.fov = Math.max(14, v.fov * 0.93); if (e.key === '-') v.fov = Math.min(75, v.fov * 1.08); }}
    />
  );
}
```

- [ ] **Step 4: Implement the view** (`StandView.tsx`): store, address, scene, plates, labels, time bar, fallback.

```tsx
'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { HorizonView } from '@/components/explore/HorizonView';
import { TimeBar } from '@/components/explore/TimeBar';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { shadowLevels } from '@/lib/data/terrain';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { exploreHref } from '@/lib/links';
import { StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, terrainField } from '@/lib/sky/terrainField';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { answerFor } from '@/lib/viz/answer';
import { landerState, liveSentence, skyLabel, standQuery } from '@/lib/viz/stand';
import { StandCanvas, type LookTarget, type RendererLike, type SkyLabels } from './StandCanvas';

const NOTE = "Ground from NASA's laser altimeter (20 m near you, 80 m to 20 km, 960 m to 125 km), shadows worked out from those heights for every hour, the Sun and Earth from JPL's ephemeris, real stars placed for this site and hour, Earth from NASA's Blue Marble. The small craters underfoot are drawn, not measured.";

export function StandView({ store = exploreStore, createRenderer = (c: HTMLCanvasElement, s: StandScene) => new StandRenderer(c, s) }: { store?: StoreApi<ExploreState>; createRenderer?: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike }) {
  const s = useStore(store);
  const reducedMotion = useReducedMotion();
  const [sky, setSky] = useState<SkyAssets | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [look, setLook] = useState<LookTarget | null>(null);
  const [labels, setLabels] = useState<SkyLabels | null>(null);
  // ?quality=fast for weaker graphics: a lower pixel ratio, no drawn detail, fewer shadow steps.
  const [quality] = useState<'full' | 'fast'>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('quality') === 'fast' ? 'fast' : 'full'));
  useEffect(() => {
    const q = standQuery(typeof window === 'undefined' ? '' : window.location.search);
    void store.getState().init().then(async () => { await store.getState().applyQuery(typeof window === 'undefined' ? '' : window.location.search); if (q.hour !== undefined) store.getState().setCursor(q.hour); });
    void loadSkyAssets(dataBase()).then(setSky, (e) => setFailed(String(e)));
  }, [store]);
  const scene = useMemo<StandScene | null>(() => {
    if (!s.site || !s.series || !s.mask || !sky) return null;
    const levels = s.site.polar ? shadowLevels(s.site, s.heightmap, s.contextHeightmap, s.capHeightmap) : [];
    const siteH = s.heightmap?.meta.site_height_m ?? s.maskMeta?.siteHeightM ?? 0;
    const field = levels.length ? terrainField(levels, s.site.lon, siteH) : flatField(s.site.lon);
    return { field, mask: { az0: 0, step: 360 / s.mask.length, el: s.mask }, series: s.series, startUtc: s.startUtc, site: s.site, mastM: s.params.mastM, sky, quality };
  }, [s.site, s.series, s.mask, s.heightmap, s.contextHeightmap, s.capHeightmap, s.maskMeta, s.params.mastM, s.startUtc, sky, quality]);
  const onFail = useCallback((m: string) => setFailed(m), []);
  const onLabels = useCallback((l: SkyLabels) => setLabels(l), []);
  if (s.status !== 'ready' || !s.site || !s.series || !s.summary) return <p className="fixed inset-0 grid place-items-center bg-black text-ink-2">Building the ground from NASA heights…</p>;
  const hour = Math.min(s.series.hours - 1, Math.max(0, s.cursorHour));
  const p = s.params.power;
  const answer = answerFor({ siteName: siteLabel(s.site), series: s.series, summary: s.summary, power: s.power!, startUtc: s.startUtc, days: s.days, loadW: p.loadW, batteryWh: p.batteryWh, best: s.best });
  const lander = landerState(s.power, s.startUtc, hour);
  const face = (az: number, el: number, fov: number) => setLook({ yaw: az, pitch: Math.max(-8, Math.min(60, el + 1.5)), fov });
  return (
    <div className="theme-dark fixed inset-0 bg-black text-[#f2f0ea]">
      {scene && !failed && <StandCanvas scene={scene} hour={hour} look={look} startYaw={s.series.sunAz[hour]} reducedMotion={reducedMotion} createRenderer={createRenderer} onLabels={onLabels} onFail={onFail} />}
      {failed && (
        <div className="fixed inset-x-4 top-[45%] mx-auto max-w-[900px]">
          <p className="mb-3 text-[15px] text-[#c3bfb6]">This browser cannot draw the view from the site, so here is the view all round instead.</p>
          <HorizonView mask={s.mask!} series={s.series} cursor={hour} lat={s.site.lat} startUtc={s.startUtc} />
        </div>
      )}
      {labels && !failed && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0">
          {labels.sun.visible && <span className="absolute -translate-x-1/2 -translate-y-[160%] whitespace-nowrap rounded-[5px] border border-white/15 bg-black/75 px-2 py-1 text-[15px] text-[#f6b646]" style={{ left: `${labels.sun.x * 100}%`, top: `${labels.sun.y * 100}%` }}>{skyLabel('sun', s.series, hour)}</span>}
          {labels.earth.visible && <span className="absolute -translate-x-1/2 -translate-y-[160%] whitespace-nowrap rounded-[5px] border border-white/15 bg-black/75 px-2 py-1 text-[15px] text-[#74adff]" style={{ left: `${labels.earth.x * 100}%`, top: `${labels.earth.y * 100}%` }}>{skyLabel('earth', s.series, hour)}</span>}
          {labels.compass.map((c) => c.visible && <span key={c.letter} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[5px] bg-black/60 px-1.5 text-[15px] font-semibold" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>{c.letter}</span>)}
        </div>
      )}
      <div className="pointer-events-none fixed inset-x-4 top-4 flex flex-col items-start justify-between gap-4 md:flex-row">
        <section aria-live="polite" className="pointer-events-auto grid w-full max-w-[560px] gap-2 rounded-lg border border-white/15 bg-black/75 p-5">
          <p className="text-[15px] text-[#c3bfb6]">Standing at {siteLabel(s.site)}, {Math.abs(s.site.lat).toFixed(1)}° {s.site.lat < 0 ? 'S' : 'N'}{s.site.blurb ? `: ${s.site.blurb}` : ''}.</p>
          <h1 className="display text-balance text-[24px] font-bold leading-tight sm:text-[30px]">{answer.title}</h1>
          <p className="text-base">{liveSentence(s.series, hour)}</p>
          <p className="flex items-center gap-2 text-[15px]"><i aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${lander.on ? 'bg-[#8ddcaa]' : 'bg-[#ff9180]'}`} />{lander.text}</p>
          <Link href={exploreHref(s.site.id, s.startUtc, s.days)} className="text-[15px] underline underline-offset-4">Back to Explore</Link>
        </section>
        <div role="group" aria-label="Look towards" className="pointer-events-auto flex flex-wrap gap-2 rounded-lg border border-white/15 bg-black/75 p-2.5">
          <button type="button" className="min-h-10 rounded-lg border border-white/15 px-3.5 text-[15px]" onClick={() => face(s.series!.sunAz[hour], s.series!.sunEl[hour] - 2, 46)}>Face the Sun</button>
          <button type="button" className="min-h-10 rounded-lg border border-white/15 px-3.5 text-[15px]" onClick={() => face(s.series!.earthAz[hour], s.series!.earthEl[hour], 16)}>Face Earth</button>
          <button type="button" className="min-h-10 rounded-lg border border-white/15 px-3.5 text-[15px]" onClick={() => setLook({ yaw: s.series!.sunAz[hour], pitch: 70, fov: 72 })}>Look up</button>
          <p className="w-full px-1 text-[15px] text-[#c3bfb6]">Drag to look around; scroll to zoom.</p>
        </div>
      </div>
      <aside className="fixed bottom-28 right-4 hidden w-[340px] rounded-lg border border-white/15 bg-black/75 p-3.5 text-[15px] text-[#c3bfb6] md:block"><b className="text-[#f2f0ea]">What is measured.</b> {NOTE}</aside>
      <details className="fixed inset-x-4 bottom-28 rounded-lg border border-white/15 bg-black/75 px-3.5 text-[15px] text-[#c3bfb6] md:hidden"><summary className="flex min-h-10 cursor-pointer items-center text-[#f2f0ea]">What is measured</summary><p className="pb-3">{NOTE}</p></details>
      <div className="fixed inset-x-0 bottom-0"><TimeBar series={s.series} power={s.power} startUtc={s.startUtc} cursor={hour} hoverHour={null} batteryWh={p.batteryWh} onCursor={s.setCursor} /></div>
    </div>
  );
}
```

`web/src/app/explore/stand/page.tsx`:

```tsx
import { StandView } from '@/components/stand/StandView';

export default function StandPage() {
  return <StandView />;
}
```

Entry points: in `GroundPanel.tsx`, beside the tabs, for a polar site: `<Link href={standHref(site.id, startUtc, days, cursor)} className="btn">Stand here</Link>` (add `days` to its props from `ExploreView`); in `VerdictPanel.tsx`, an optional `standLink?: string` prop rendered as a plain underlined link "Stand at the site" after the nearby line; `ExploreView` passes `standHref(s.site.id, s.startUtc, s.days, s.cursorHour)`.

- [ ] **Step 5: Run the tests, the whole suite, types, lint and build**

Run: `cd web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; clean; the build lists `/explore/stand`.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/stand web/src/app/explore/stand web/src/components/explore/GroundPanel.tsx web/src/components/explore/GroundPanel.test.tsx web/src/components/explore/VerdictPanel.tsx web/src/components/explore/VerdictPanel.test.tsx web/src/components/ExploreView.tsx
git commit -m "feat(web): stand on the Moon: the full-window view from the site, with the answer, the hour and the lander, opened from Explore"
```

### Task 7: Documents, a look, the blind read, the pull request

- [ ] Docs: `web/README.md` (the stand view and `lib/sky`), `README.md` (one line in the tour), `docs/data-credits.md` (the Yale catalogue via HEASARC, Blue Marble and clouds via NASA GSFC), `docs/pitch.md` and `docs/video-storyboard.md` (the stand view's shots: the Sun on the ridge, Play sweeping the shadows, Earth rising), the test badge (`npm run validation:tests`).
- [ ] A look in the browser at `127.0.0.1` (the production build): the view at de Gerlache Rim 2 at hours 10 and 300, looking at the Sun, away from it and at Earth; Blue Ghost; the fallback. Not a performance check (the development laptop is not a target).
- [ ] Blind read of the stand view (two fresh readers, screenshots; gate 4, 4, 4, 3, 3 and immersion 4); fix what both name; repeat until it passes.
- [ ] Spec section 13 (a new amendment) with the read; ledger rulings; self-review against `code-reviewer.md`; pull request; merge on green.
