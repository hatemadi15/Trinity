# Week 1 — Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the offline Python pipeline that turns NASA data (SPICE DE440 kernels, LOLA polar DEMs, LOLA illumination maps) into the small static artifacts the web app will ship, plus a validated reference implementation of the Sun/Earth horizon science, demonstrable from the command line.

**Architecture:** A `uv`-managed Python package `lunar_pipeline` under `pipeline/`. It downloads raw data into a gitignored `data_raw/`, writes committed small outputs into `data/` (ephemeris table, site catalog, per-site horizon masks, JPL Horizons fixtures) and gitignored large outputs into `data_out/` (DEM tiles). Science functions (projection, horizon mask, illumination metrics) are pure numpy so the same math can be ported 1:1 to TypeScript in Week 2.

**Tech Stack:** Python 3.12 (uv), numpy ≥ 2, spiceypy ≥ 8, rasterio ≥ 1.5 (bundles GDAL), requests, pytest, ruff.

**Spec:** `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md` (sections 5.1, 5.2, 5.3, 5.7, 6, 8 Week 1).

## Global Constraints

- Python `>=3.12`; run everything with `uv run` from the `pipeline/` directory.
- Committed outputs under `data/` must stay below 30 MB in total. Raw downloads stay in `data_raw/` (gitignored) and total below 1 GB — the dev machine has ~11 GB free.
- Reference radius `R_MOON_M = 1737400.0` m (LOLA sphere). Angles in degrees at API boundaries, radians internally.
- Body-fixed frame: `MOON_ME` from `moon_de440_250416.tf` (alias of `MOON_ME_DE440_ME421`). Aberration correction `LT+S`. Ephemeris `de440s.bsp`.
- Kernel files, exact: `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `de440s.bsp`.
- LOLA files, exact: `ldem_875s_20m.img/.lbl` (115 MB, 7584², offsets 3791.5), `ldem_80s_80m.img/.lbl` (115 MB, 7600², offsets 3799.5), `ldem_60s_240m.img/.lbl` (120 MB, 7760², offsets 3879.5). DN × 0.5 = height (m) above the reference sphere. Polar stereographic, south, true scale at pole: `x = ρ sin λ`, `y = ρ cos λ`, `ρ = 2R tan((90° − |φ|)/2)`; `col = SAMPLE_PROJECTION_OFFSET + x/scale`, `row = LINE_PROJECTION_OFFSET − y/scale` (0-based pixel centres).
- Illumination maps, exact: `avgvisib_85s_060m_201608.img/.lbl` (5058², 60 m, offsets 2528.5, DN × 0.00004 = fraction 0..1, span 2009-07-13 → 2013-07-18), `avgvisib_85s_060m_201608_earth.img/.lbl`, `lpsr_85s_060m_201608.img/.lbl`.
- No runtime backend. This pipeline runs offline only.
- Every dataset used is listed in `docs/data-credits.md` with URL and citation.
- Code, comments, docs, commit messages: normal English.

## Review Focus

1. **Sites near a DEM coverage edge** (for example IM-1 at −80.13°, 3.9 km inside the 80°S grid): part of a horizon ring falls outside the fine grid. Expected: the mask uses the next coarser grid for those samples, never NaN or −90°. Pinned by Task 6 test `test_band_fallback_outside_fine_grid`.
2. **Longitude given as 200° or −160°**: both must map to the same site. Pinned by Task 4 test `test_normalize_lon`.
3. **Dates outside the ephemeris table** (before 2024-01-01 or after 2036-12-31): expected a clear `ValueError`, not silently extrapolated vectors. Pinned by Task 3 test `test_interp_rejects_out_of_range`.
4. **JPL Horizons returns an error page or HTTP 5xx**: fixture fetch must fail loudly with the URL; the comparison test must skip when fixtures are missing, never pass vacuously. Pinned by Task 10 tests `test_parse_horizons_rejects_missing_soe` and the `needs_fixtures` skip marker.
5. **Truncated or corrupt download** (size mismatch with `Content-Length`): expected re-download, never a silent short file. Pinned by Task 2 tests `test_size_mismatch_triggers_redownload` and `test_partial_without_range_support_restarts`.

---

### Task 1: Pipeline project scaffold and configuration

**Files:**
- Create: `pipeline/pyproject.toml`
- Create: `pipeline/.python-version`
- Create: `pipeline/lunar_pipeline/__init__.py`
- Create: `pipeline/lunar_pipeline/config.py`
- Create: `pipeline/tests/__init__.py`
- Create: `pipeline/tests/conftest.py`
- Create: `pipeline/tests/test_config.py`
- Create: `pipeline/README.md`
- Create: `.gitignore` (repo root)
- Create: `.gitattributes` (repo root)

**Interfaces:**
- Produces: `lunar_pipeline.config` constants `REPO_ROOT, DATA_DIR, RAW_DIR, OUT_DIR, KERNEL_DIR, LOLA_DIR, ILLUM_DIR: Path`, `R_MOON_M = 1737400.0`, `AU_KM = 149597870.7`, `SUN_RADIUS_KM = 695700.0`. Test markers `needs_kernels`, `needs_lola`, `needs_illum`, `needs_fixtures` in `conftest.py`.

- [ ] **Step 1: Create the uv project files**

`pipeline/pyproject.toml`:

```toml
[project]
name = "lunar-pipeline"
version = "0.1.0"
description = "Offline NASA-data pipeline for the CLPS Lunar Mission Browser (Space Apps 2026)"
requires-python = ">=3.12"
dependencies = [
    "numpy>=2.0",
    "spiceypy>=8.0",
    "rasterio>=1.5",
    "requests>=2.32",
]

[dependency-groups]
dev = ["pytest>=8.3", "ruff>=0.6"]

[tool.uv]
package = false

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
markers = [
    "data: needs downloaded NASA data (skipped when absent)",
    "network: talks to the internet",
]

[tool.ruff]
line-length = 100
target-version = "py312"
```

`pipeline/.python-version`:

```
3.12
```

`pipeline/lunar_pipeline/__init__.py`:

```python
"""Offline data pipeline for the CLPS Lunar Mission Browser."""
```

`pipeline/lunar_pipeline/config.py`:

```python
"""Paths and physical constants shared by every pipeline module."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"  # committed, small outputs
RAW_DIR = REPO_ROOT / "data_raw"  # gitignored downloads
OUT_DIR = REPO_ROOT / "data_out"  # gitignored generated tiles

KERNEL_DIR = RAW_DIR / "kernels"
LOLA_DIR = RAW_DIR / "lola"
ILLUM_DIR = RAW_DIR / "illumination"

R_MOON_M = 1737400.0  # LOLA reference sphere radius, metres
AU_KM = 149_597_870.7
SUN_RADIUS_KM = 695_700.0
```

- [ ] **Step 2: Write the config test**

`pipeline/tests/__init__.py`: empty file.

`pipeline/tests/conftest.py`:

```python
import numpy as np
import pytest

from lunar_pipeline import config

needs_kernels = pytest.mark.skipif(
    not (config.KERNEL_DIR / "de440s.bsp").exists(),
    reason="run: uv run python -m lunar_pipeline.cli fetch --group kernels",
)
needs_lola = pytest.mark.skipif(
    not (config.LOLA_DIR / "ldem_875s_20m.img").exists(),
    reason="run: uv run python -m lunar_pipeline.cli fetch --group lola",
)
needs_illum = pytest.mark.skipif(
    not (config.ILLUM_DIR / "avgvisib_85s_060m_201608.img").exists(),
    reason="run: uv run python -m lunar_pipeline.cli fetch --group illumination",
)
needs_fixtures = pytest.mark.skipif(
    not (config.DATA_DIR / "fixtures" / "horizons").exists(),
    reason="run: uv run python -m lunar_pipeline.cli horizons-fetch",
)


@pytest.fixture
def synthetic_grid_factory():
    """Builds an in-memory south-polar grid centred on the pole (0-based pixel centres)."""

    def make(size: int = 1024, scale_m: float = 20.0, fill_dn: int = 0):
        from lunar_pipeline.lola import GridLabel, LolaGrid

        label = GridLabel(
            lines=size,
            samples=size,
            map_scale_m=scale_m,
            line_offset_px=(size - 1) / 2,
            sample_offset_px=(size - 1) / 2,
            scaling_factor=0.5,
            offset=1737400.0,
            max_latitude_deg=-89.0,
        )
        return LolaGrid(label, np.full((size, size), fill_dn, dtype=np.int16))

    return make
```

`pipeline/tests/test_config.py`:

```python
from lunar_pipeline import config


def test_constants_and_paths():
    assert config.R_MOON_M == 1737400.0
    assert config.REPO_ROOT.name == "Trinity"
    assert config.DATA_DIR == config.REPO_ROOT / "data"
    assert config.KERNEL_DIR == config.REPO_ROOT / "data_raw" / "kernels"
```

- [ ] **Step 3: Create repo-level git hygiene files**

`.gitignore` (repo root):

```
# pipeline data
data_raw/
data_out/
pipeline/.venv/
__pycache__/
.pytest_cache/
.ruff_cache/
*.py[cod]

# web app (Week 2+)
node_modules/
.next/
out/
public/data/
.env
.env.*

# tooling
.playwright-mcp/
.DS_Store
Thumbs.db
```

`.gitattributes` (repo root):

```
* text=auto eol=lf
*.f32 binary
*.bin binary
*.img binary
*.png binary
```

`pipeline/README.md`:

```markdown
# lunar_pipeline

Offline pipeline that converts NASA data into the static artifacts used by the web app.

## Setup

    cd pipeline
    uv sync

## Commands (run from `pipeline/`)

    uv run python -m lunar_pipeline.cli fetch --group kernels --group lola --group illumination
    uv run python -m lunar_pipeline.cli ephemeris
    uv run python -m lunar_pipeline.cli tiles
    uv run python -m lunar_pipeline.cli sites-derive
    uv run python -m lunar_pipeline.cli masks
    uv run python -m lunar_pipeline.cli horizons-fetch
    uv run python -m lunar_pipeline.cli horizons-compare
    uv run python -m lunar_pipeline.cli report --site shackleton_rim_high

## Tests

    uv run pytest -q            # synthetic tests always run; data tests skip until fetched
```

- [ ] **Step 4: Install and run the test**

Run (from `pipeline/`): `uv sync && uv run pytest -q`
Expected: `1 passed` (plus zero skips).

- [ ] **Step 5: Commit**

```bash
git add .gitignore .gitattributes pipeline/
git commit -m "chore(pipeline): scaffold uv project with config and test markers"
```

---

### Task 2: Asset manifest and resumable downloader

**Files:**
- Create: `pipeline/lunar_pipeline/fetch.py`
- Create: `pipeline/tests/test_fetch.py`
- Create: `docs/data-credits.md`

**Interfaces:**
- Produces: `Asset(name, url, dest_dir, group)`, `assets() -> list[Asset]`, `download(asset, session=None) -> Path`, `fetch_all(groups: set[str] | None) -> list[Path]`. Groups: `"kernels"`, `"lola"`, `"illumination"`.

- [ ] **Step 1: Write the failing tests (local HTTP server, no internet)**

`pipeline/tests/test_fetch.py`:

```python
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from lunar_pipeline.fetch import Asset, assets, download


@pytest.fixture
def served_dir(tmp_path):
    root = tmp_path / "srv"
    root.mkdir()
    (root / "blob.bin").write_bytes(bytes(range(256)) * 4000)  # 1,024,000 bytes
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    yield root, f"http://127.0.0.1:{srv.server_port}/"
    srv.shutdown()


def _asset(url_base, dest: Path):
    return Asset("blob.bin", url_base + "blob.bin", dest, "test")


def test_download_writes_exact_bytes(served_dir, tmp_path):
    root, base = served_dir
    out = download(_asset(base, tmp_path / "dl"))
    assert out.read_bytes() == (root / "blob.bin").read_bytes()
    assert not out.with_name("blob.bin.part").exists()


def test_complete_file_is_not_redownloaded(served_dir, tmp_path):
    root, base = served_dir
    out = download(_asset(base, tmp_path / "dl"))
    mtime = out.stat().st_mtime_ns
    download(_asset(base, tmp_path / "dl"))
    assert out.stat().st_mtime_ns == mtime


def test_size_mismatch_triggers_redownload(served_dir, tmp_path):
    root, base = served_dir
    dest = tmp_path / "dl" / "blob.bin"
    dest.parent.mkdir(parents=True)
    dest.write_bytes(b"short")
    out = download(_asset(base, tmp_path / "dl"))
    assert out.stat().st_size == 1_024_000


def test_partial_without_range_support_restarts(served_dir, tmp_path):
    # SimpleHTTPRequestHandler ignores Range headers (answers 200), so a leftover .part must be replaced.
    root, base = served_dir
    part = tmp_path / "dl" / "blob.bin.part"
    part.parent.mkdir(parents=True)
    part.write_bytes(b"\xff" * 10)
    out = download(_asset(base, tmp_path / "dl"))
    assert out.read_bytes() == (root / "blob.bin").read_bytes()


def test_manifest_lists_required_files():
    names = {a.name for a in assets()}
    for required in [
        "naif0012.tls", "pck00011.tpc", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf",
        "de440s.bsp", "ldem_875s_20m.img", "ldem_875s_20m.lbl", "ldem_80s_80m.img",
        "ldem_60s_240m.img", "avgvisib_85s_060m_201608.img", "avgvisib_85s_060m_201608_earth.img",
        "lpsr_85s_060m_201608.img",
    ]:
        assert required in names
    assert {a.group for a in assets()} == {"kernels", "lola", "illumination"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_fetch.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.fetch'`

- [ ] **Step 3: Implement fetch.py**

`pipeline/lunar_pipeline/fetch.py`:

```python
"""Download NASA source files with resume and size verification."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import requests

from . import config

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
PDS_POLAR = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
    "data/lola_gdr/polar/img/"
)
PDS_ILLUM = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
    "extras/illumination/img/"
)

KERNELS = [
    ("naif0012.tls", "lsk/"),
    ("pck00011.tpc", "pck/"),
    ("moon_pa_de440_200625.bpc", "pck/"),
    ("moon_de440_250416.tf", "fk/satellites/"),
    ("de440s.bsp", "spk/planets/"),
]
LOLA_STEMS = ["ldem_875s_20m", "ldem_80s_80m", "ldem_60s_240m"]
ILLUM_STEMS = [
    "avgvisib_85s_060m_201608",
    "avgvisib_85s_060m_201608_earth",
    "lpsr_85s_060m_201608",
]


@dataclass(frozen=True)
class Asset:
    name: str
    url: str
    dest_dir: Path
    group: str


def assets() -> list[Asset]:
    out: list[Asset] = []
    for name, sub in KERNELS:
        out.append(Asset(name, NAIF + sub + name, config.KERNEL_DIR, "kernels"))
    for stem in LOLA_STEMS:
        for ext in (".lbl", ".img"):
            out.append(Asset(stem + ext, PDS_POLAR + stem + ext, config.LOLA_DIR, "lola"))
    for stem in ILLUM_STEMS:
        for ext in (".lbl", ".img"):
            out.append(Asset(stem + ext, PDS_ILLUM + stem + ext, config.ILLUM_DIR, "illumination"))
    return out


def remote_size(url: str, session: requests.Session) -> int | None:
    r = session.head(url, allow_redirects=True, timeout=60)
    r.raise_for_status()
    length = r.headers.get("Content-Length")
    return int(length) if length else None


def download(asset: Asset, session: requests.Session | None = None, chunk: int = 1 << 20) -> Path:
    """Download one asset into asset.dest_dir. Resumes a .part file when the server supports Range."""
    session = session or requests.Session()
    dest = asset.dest_dir / asset.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = remote_size(asset.url, session)
    if dest.exists() and (size is None or dest.stat().st_size == size):
        return dest

    part = dest.with_name(dest.name + ".part")
    have = part.stat().st_size if part.exists() else 0
    if size is not None and have >= size:
        part.unlink()
        have = 0
    headers = {"Range": f"bytes={have}-"} if have else {}
    with session.get(asset.url, headers=headers, stream=True, timeout=120) as r:
        r.raise_for_status()
        resumed = bool(have) and r.status_code == 206
        with open(part, "ab" if resumed else "wb") as f:
            for block in r.iter_content(chunk):
                f.write(block)
    got = part.stat().st_size
    if size is not None and got != size:
        raise OSError(f"{asset.name}: expected {size} bytes, got {got} (url {asset.url})")
    part.replace(dest)
    return dest


def fetch_all(groups: set[str] | None = None) -> list[Path]:
    session = requests.Session()
    session.headers["User-Agent"] = "trinity-lunar-pipeline/0.1 (Space Apps 2026)"
    done: list[Path] = []
    for asset in assets():
        if groups and asset.group not in groups:
            continue
        print(f"[fetch] {asset.group}/{asset.name}", flush=True)
        done.append(download(asset, session))
    return done
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_fetch.py -q`
Expected: `5 passed`

- [ ] **Step 5: Write the data credits page**

`docs/data-credits.md`:

```markdown
# NASA data used

| Dataset | What we use it for | Source | Citation |
|---|---|---|---|
| SPICE generic kernels: `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `de440s.bsp` | Sun and Earth positions in the Moon body-fixed frame (MOON_ME), light-time and stellar aberration corrected | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | Acton et al. 2018, Planet. Space Sci. 150, 9–12; Park et al. 2021 (DE440) |
| LRO LOLA polar DEMs `ldem_875s_20m`, `ldem_80s_80m`, `ldem_60s_240m` | Terrain horizon masks, tiles for the browser engine, 3D terrain | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ | Smith et al. 2017, Icarus 283, 70–91 |
| LOLA Lunar Polar Illumination maps `avgvisib_85s_060m_201608` (+ `_earth`), `lpsr_85s_060m_201608` | Independent check of our illumination and Earth-visibility numbers; overlay layers | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/ | Mazarico et al. 2011, Icarus 211, 1066–1081 |
| JPL Horizons API (observer on the lunar surface) | Cross-check of Sun and Earth azimuth/elevation | https://ssd-api.jpl.nasa.gov/doc/horizons.html | Giorgini et al. 1996 |
| CLPS landing coordinates (IM-1, IM-2, Blue Ghost M1) | Featured sites and mission backcasts | NASA / provider press releases, LROC | — |

Method reference for horizon masks: Barker et al. 2021, Planet. Space Sci. 203, 105119 (nested-grid horizon computation).
```

- [ ] **Step 6: Download the kernels now (needed by Task 3) and commit**

Run: `uv run python -c "from lunar_pipeline.fetch import fetch_all; fetch_all({'kernels'})"`
Expected: five `[fetch] kernels/...` lines, files in `data_raw/kernels/` (~45 MB total, `de440s.bsp` ≈ 31 MB).

```bash
git add pipeline/lunar_pipeline/fetch.py pipeline/tests/test_fetch.py docs/data-credits.md
git commit -m "feat(pipeline): asset manifest and resumable downloader with data credits"
```

---

### Task 3: SPICE environment and hourly MOON_ME ephemeris table

**Files:**
- Create: `pipeline/lunar_pipeline/spice_env.py`
- Create: `pipeline/lunar_pipeline/ephemeris.py`
- Create: `pipeline/tests/test_ephemeris.py`

**Interfaces:**
- Produces: `spice_kernels(kernel_dir=config.KERNEL_DIR)` context manager; `T0_UTC = "2024-01-01T00:00:00"`, `STEP_S = 3600.0`, `N_STEPS = 113_952`; `build_table(n_steps=N_STEPS) -> tuple[np.ndarray, float]` (table shape `(n, 2, 3)` km float32, `t0_et`); `write_table(out_dir=config.DATA_DIR / "ephemeris", n_steps=N_STEPS) -> Path`; `load_table(dir=...) -> tuple[np.ndarray, dict]`; `interp_vectors(table, t0_et, step_s, et) -> np.ndarray` shape `(2, 3)` (row 0 Sun, row 1 Earth); `utc_to_et(iso: str) -> float` (requires kernels loaded).

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_ephemeris.py`:

```python
import numpy as np
import pytest
import spiceypy as spice

from lunar_pipeline import ephemeris
from lunar_pipeline.spice_env import spice_kernels
from tests.conftest import needs_kernels


@needs_kernels
def test_small_table_is_physical():
    table, t0_et = ephemeris.build_table(n_steps=48)
    assert table.shape == (48, 2, 3) and table.dtype == np.float32
    sun, earth = table[:, 0, :].astype(float), table[:, 1, :].astype(float)
    sun_r = np.linalg.norm(sun, axis=1)
    earth_r = np.linalg.norm(earth, axis=1)
    assert np.all((sun_r > 0.97 * 149_597_870.7) & (sun_r < 1.03 * 149_597_870.7))
    assert np.all((earth_r > 356_000) & (earth_r < 407_000))
    subsolar_lat = np.degrees(np.arcsin(sun[:, 2] / sun_r))
    subearth_lat = np.degrees(np.arcsin(earth[:, 2] / earth_r))
    assert np.all(np.abs(subsolar_lat) < 1.6)
    assert np.all(np.abs(subearth_lat) < 8.0)


@needs_kernels
def test_interp_matches_spice_at_half_steps():
    table, t0_et = ephemeris.build_table(n_steps=12)
    with spice_kernels():
        for i in (2, 5, 8):
            et = t0_et + (i + 0.5) * ephemeris.STEP_S
            got = ephemeris.interp_vectors(table, t0_et, ephemeris.STEP_S, et)
            for row, body in enumerate(("SUN", "EARTH")):
                truth, _ = spice.spkpos(body, et, "MOON_ME", "LT+S", "MOON")
                cos_ang = np.dot(got[row], truth) / (np.linalg.norm(got[row]) * np.linalg.norm(truth))
                assert np.degrees(np.arccos(np.clip(cos_ang, -1, 1))) < 0.002


def test_interp_rejects_out_of_range():
    table = np.zeros((10, 2, 3), dtype=np.float32)
    with pytest.raises(ValueError):
        ephemeris.interp_vectors(table, 0.0, 3600.0, -10.0)
    with pytest.raises(ValueError):
        ephemeris.interp_vectors(table, 0.0, 3600.0, 9 * 3600.0)


@needs_kernels
def test_write_and_load_roundtrip(tmp_path):
    path = ephemeris.write_table(out_dir=tmp_path, n_steps=6)
    table, header = ephemeris.load_table(tmp_path)
    assert path.exists() and table.shape == (6, 2, 3)
    assert header["frame"] == "MOON_ME" and header["n"] == 6 and header["step_s"] == 3600.0
    assert len(header["kernels"]) == 5 and all(len(k["sha256"]) == 64 for k in header["kernels"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_ephemeris.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.ephemeris'`

- [ ] **Step 3: Implement spice_env.py and ephemeris.py**

`pipeline/lunar_pipeline/spice_env.py`:

```python
"""Load and unload the fixed kernel set."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import spiceypy as spice

from . import config

KERNEL_ORDER = [
    "naif0012.tls",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
    "de440s.bsp",
]


@contextmanager
def spice_kernels(kernel_dir: Path = config.KERNEL_DIR):
    paths = [kernel_dir / k for k in KERNEL_ORDER]
    missing = [p.name for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError(f"missing kernels {missing}; run the fetch command first")
    for p in paths:
        spice.furnsh(str(p))
    try:
        yield paths
    finally:
        spice.kclear()


def utc_to_et(iso_utc: str) -> float:
    """ISO 8601 UTC string -> TDB seconds past J2000. Kernels must be loaded."""
    return spice.str2et(iso_utc)
```

`pipeline/lunar_pipeline/ephemeris.py`:

```python
"""Hourly Sun and Earth position table in the MOON_ME body-fixed frame."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import spiceypy as spice

from . import config
from .spice_env import KERNEL_ORDER, spice_kernels

T0_UTC = "2024-01-01T00:00:00"
STEP_S = 3600.0
N_STEPS = 113_952  # hourly through 2036-12-31T23:00 UTC
BODIES = ("SUN", "EARTH")
FRAME = "MOON_ME"
ABCORR = "LT+S"
TABLE_NAME = "moon_me_2024_2036_1h.f32"
HEADER_NAME = "moon_me_2024_2036_1h.json"


def build_table(n_steps: int = N_STEPS) -> tuple[np.ndarray, float]:
    """Return (table[n, 2, 3] km float32, t0_et). Row 0 = Sun, row 1 = Earth."""
    table = np.empty((n_steps, 2, 3), dtype=np.float64)
    with spice_kernels():
        t0_et = spice.str2et(T0_UTC)
        for i in range(n_steps):
            et = t0_et + i * STEP_S
            for b, body in enumerate(BODIES):
                pos, _lt = spice.spkpos(body, et, FRAME, ABCORR, "MOON")
                table[i, b, :] = pos
    return table.astype("<f4"), float(t0_et)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def write_table(out_dir: Path = config.DATA_DIR / "ephemeris", n_steps: int = N_STEPS) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    table, t0_et = build_table(n_steps)
    table_path = out_dir / TABLE_NAME
    table.tofile(table_path)
    header = {
        "t0_utc": T0_UTC,
        "t0_et": t0_et,
        "step_s": STEP_S,
        "n": n_steps,
        "bodies": list(BODIES),
        "frame": FRAME,
        "abcorr": ABCORR,
        "observer": "MOON",
        "units": "km",
        "dtype": "<f4",
        "shape": [n_steps, 2, 3],
        "layout": "row-major [step][body][xyz]",
        "interpolation": "cubic Catmull-Rom on the hourly grid",
        "tdb_minus_utc_note": "TDB-UTC = 69.184 s while no new leap second is scheduled",
        "kernels": [{"name": k, "sha256": _sha256(config.KERNEL_DIR / k)} for k in KERNEL_ORDER],
        "table_sha256": _sha256(table_path),
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out_dir / HEADER_NAME).write_text(json.dumps(header, indent=2) + "\n")
    return table_path


def load_table(dir: Path = config.DATA_DIR / "ephemeris") -> tuple[np.ndarray, dict]:
    header = json.loads((dir / HEADER_NAME).read_text())
    table = np.fromfile(dir / TABLE_NAME, dtype="<f4").reshape(header["shape"])
    return table, header


def interp_vectors(table: np.ndarray, t0_et: float, step_s: float, et: float) -> np.ndarray:
    """Catmull-Rom interpolation of both body vectors at TDB epoch et. Returns (2, 3) km."""
    x = (et - t0_et) / step_s
    n = table.shape[0]
    if not (1.0 <= x <= n - 3):
        raise ValueError(f"epoch outside interpolation range (x={x:.3f}, n={n})")
    i = int(np.floor(x))
    if i > n - 3:
        i = n - 3
    t = x - i
    p0, p1, p2, p3 = (table[i - 1 : i + 3].astype(np.float64))
    return 0.5 * (
        2.0 * p1
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_ephemeris.py -q`
Expected: `4 passed`

- [ ] **Step 5: Build the full table and commit it**

Run: `uv run python -c "from lunar_pipeline.ephemeris import write_table; print(write_table())"`
Expected: prints the path; `data/ephemeris/moon_me_2024_2036_1h.f32` is exactly 2,734,848 bytes; the JSON header lists 5 kernels with hashes. Takes roughly 10–30 s.

```bash
git add pipeline/lunar_pipeline/spice_env.py pipeline/lunar_pipeline/ephemeris.py pipeline/tests/test_ephemeris.py data/ephemeris/
git commit -m "feat(pipeline): hourly MOON_ME Sun/Earth ephemeris table from SPICE DE440"
```

---

### Task 4: Geometry — site frame, azimuth/elevation with parallax, polar stereographic projection

**Files:**
- Create: `pipeline/lunar_pipeline/geometry.py`
- Create: `pipeline/tests/test_geometry.py`

**Interfaces:**
- Produces: `normalize_lon(lon) -> float in (-180, 180]`; `site_vector_km(lat_deg, lon_deg, height_m=0.0) -> np.ndarray(3)`; `enu_basis(lat_deg, lon_deg) -> (east, north, up)` unit vectors; `azel_from_body_vectors(body_km, lat_deg, lon_deg, height_m=0.0) -> (az_deg, el_deg)` (body_km shape `(..., 3)`, az in `[0, 360)`); `ps_south_xy_m(lat_deg, lon_deg) -> (x, y)`; `ps_south_latlon_deg(x_m, y_m) -> (lat, lon)`.

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_geometry.py`:

```python
import numpy as np
import pytest

from lunar_pipeline import geometry as g
from lunar_pipeline.config import R_MOON_M


def test_normalize_lon():
    assert g.normalize_lon(200.0) == pytest.approx(-160.0)
    assert g.normalize_lon(-160.0) == pytest.approx(-160.0)
    assert g.normalize_lon(180.0) == pytest.approx(180.0)
    assert g.normalize_lon(-180.0) == pytest.approx(180.0)
    assert g.normalize_lon(360.0) == pytest.approx(0.0)


def test_enu_basis_is_orthonormal():
    e, n, u = g.enu_basis(-85.0, 30.0)
    for v in (e, n, u):
        assert np.linalg.norm(v) == pytest.approx(1.0)
    assert abs(np.dot(e, n)) < 1e-12 and abs(np.dot(e, u)) < 1e-12 and abs(np.dot(n, u)) < 1e-12
    assert np.allclose(np.cross(e, n), u)


def test_azel_cardinal_directions():
    lat, lon = -85.0, 30.0
    p = g.site_vector_km(lat, lon)
    e, n, u = g.enu_basis(lat, lon)
    az, el = g.azel_from_body_vectors(p + 1e6 * u, lat, lon)
    assert el == pytest.approx(90.0, abs=1e-6)
    az, el = g.azel_from_body_vectors(p + 1e6 * e, lat, lon)
    assert az == pytest.approx(90.0, abs=1e-6) and el == pytest.approx(0.0, abs=1e-6)
    az, el = g.azel_from_body_vectors(p + 1e6 * n, lat, lon)
    assert az == pytest.approx(0.0, abs=1e-6)
    az, el = g.azel_from_body_vectors(p - 1e6 * n, lat, lon)
    assert az == pytest.approx(180.0, abs=1e-6)


def test_earth_parallax_dip_at_limb():
    # Site on the equator at lon 90 sees a body lying along +X (lon 0 direction) exactly 0.259 deg below the horizon.
    body = np.array([384_400.0, 0.0, 0.0])
    az, el = g.azel_from_body_vectors(body, 0.0, 90.0)
    expected = -np.degrees(np.arctan2(R_MOON_M / 1000.0, 384_400.0))
    assert el == pytest.approx(expected, abs=1e-6)
    assert az == pytest.approx(270.0, abs=1e-6)


def test_azel_broadcasts_over_time_axis():
    body = np.tile(np.array([384_400.0, 0.0, 0.0]), (5, 1))
    az, el = g.azel_from_body_vectors(body, -89.0, 10.0)
    assert az.shape == (5,) and el.shape == (5,)


def test_polar_stereographic_scale_at_875():
    x, y = g.ps_south_xy_m(-87.5, 0.0)
    assert abs(x) < 1e-6
    assert y == pytest.approx(2 * R_MOON_M * np.tan(np.radians(1.25)), abs=1e-3)
    assert y == pytest.approx(75_826.6, abs=5.0)
    x, y = g.ps_south_xy_m(-87.5, 90.0)
    assert x == pytest.approx(75_826.6, abs=5.0) and abs(y) < 1e-6


def test_polar_stereographic_roundtrip():
    rng = np.random.default_rng(0)
    lat = rng.uniform(-90.0, -60.0, 200)
    lon = rng.uniform(-180.0, 180.0, 200)
    x, y = g.ps_south_xy_m(lat, lon)
    lat2, lon2 = g.ps_south_latlon_deg(x, y)
    assert np.allclose(lat, lat2, atol=1e-9)
    dlon = (np.asarray(lon2) - lon + 180.0) % 360.0 - 180.0
    assert np.allclose(dlon, 0.0, atol=1e-7)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_geometry.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.geometry'`

- [ ] **Step 3: Implement geometry.py**

`pipeline/lunar_pipeline/geometry.py`:

```python
"""Spherical-Moon geometry: local frames, azimuth/elevation, south polar stereographic projection."""

from __future__ import annotations

import numpy as np

from .config import R_MOON_M


def normalize_lon(lon_deg: float) -> float:
    """Wrap longitude into (-180, 180]."""
    lon = (float(lon_deg) + 180.0) % 360.0 - 180.0
    return 180.0 if lon == -180.0 else lon


def site_vector_km(lat_deg: float, lon_deg: float, height_m: float = 0.0) -> np.ndarray:
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    r = (R_MOON_M + height_m) / 1000.0
    return np.array([r * np.cos(lat) * np.cos(lon), r * np.cos(lat) * np.sin(lon), r * np.sin(lat)])


def enu_basis(lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    return east, north, up


def azel_from_body_vectors(body_km: np.ndarray, lat_deg: float, lon_deg: float, height_m: float = 0.0):
    """Topocentric azimuth (deg, clockwise from north) and elevation (deg) of body vectors.

    body_km: array (..., 3) of body positions relative to the Moon centre, MOON_ME frame, km.
    The site offset is subtracted (parallax), so nearby bodies such as Earth are handled exactly.
    """
    body = np.asarray(body_km, dtype=np.float64)
    d = body - site_vector_km(lat_deg, lon_deg, height_m)
    east, north, up = enu_basis(lat_deg, lon_deg)
    de, dn, du = d @ east, d @ north, d @ up
    az = np.degrees(np.arctan2(de, dn)) % 360.0
    el = np.degrees(np.arctan2(du, np.hypot(de, dn)))
    return az, el


def ps_south_xy_m(lat_deg, lon_deg):
    """South polar stereographic (sphere, true scale at the pole): x = rho sin(lon), y = rho cos(lon)."""
    lat = np.asarray(lat_deg, dtype=np.float64)
    lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
    rho = 2.0 * R_MOON_M * np.tan(np.radians((90.0 - np.abs(lat)) / 2.0))
    return rho * np.sin(lon), rho * np.cos(lon)


def ps_south_latlon_deg(x_m, y_m):
    x = np.asarray(x_m, dtype=np.float64)
    y = np.asarray(y_m, dtype=np.float64)
    rho = np.hypot(x, y)
    lat = -90.0 + 2.0 * np.degrees(np.arctan(rho / (2.0 * R_MOON_M)))
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_geometry.py -q`
Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add pipeline/lunar_pipeline/geometry.py pipeline/tests/test_geometry.py
git commit -m "feat(pipeline): site geometry, az/el with parallax, south polar stereographic projection"
```

---

### Task 5: LOLA grid access — PDS label parser, pixel mapping, bilinear sampling, subgrids

**Files:**
- Create: `pipeline/lunar_pipeline/lola.py`
- Create: `pipeline/tests/test_lola.py`

**Interfaces:**
- Produces: `GridLabel(lines, samples, map_scale_m, line_offset_px, sample_offset_px, scaling_factor, offset, max_latitude_deg, sample_bits=16)`; `parse_label(text) -> GridLabel`; `class LolaGrid(label, data)` with `from_pds(lbl_path, mmap=True)`, `pixel_from_latlon(lat, lon) -> (col, row)`, `latlon_from_pixel(col, row)`, `value_bilinear(col, row) -> np.ndarray` (DN × scaling_factor, NaN outside), `value_at(lat, lon)`, `subgrid(row0, col0, rows, cols) -> LolaGrid`, `covers(lat, lon) -> bool`; `remote_window(url, label, row0, col0, rows, cols) -> LolaGrid` (HTTP range reads through GDAL `/vsicurl/`).

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_lola.py`:

```python
import dataclasses

import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.lola import GridLabel, LolaGrid, parse_label
from tests.conftest import needs_lola

LABEL_875S_20M = """
PDS_VERSION_ID            = PDS3
RECORD_TYPE               = FIXED_LENGTH
RECORD_BYTES              = 15168
FILE_RECORDS              = 7584
^IMAGE                    = "LDEM_875S_20M.IMG"
OBJECT                    = IMAGE
    LINES                 = 7584
    LINE_SAMPLES          = 7584
    SAMPLE_TYPE           = LSB_INTEGER
    SAMPLE_BITS           = 16
    UNIT                  = METER
    SCALING_FACTOR        = 0.5
    OFFSET                = 1737400.
END_OBJECT                = IMAGE
OBJECT                       = IMAGE_MAP_PROJECTION
 MAP_PROJECTION_TYPE          = "POLAR STEREOGRAPHIC"
 MAP_RESOLUTION               = 1516.17 <pix/deg>
 A_AXIS_RADIUS                = 1737.4 <km>
 CENTER_LATITUDE              = -90 <deg>
 CENTER_LONGITUDE             = 0 <deg>
 MAP_SCALE                    = 20 <m/pix>
 MAXIMUM_LATITUDE             = -87.5 <deg>
 MINIMUM_LATITUDE             = -90 <deg>
 LINE_PROJECTION_OFFSET       = 3791.5 <pix>
 SAMPLE_PROJECTION_OFFSET     = 3791.5 <pix>
END_OBJECT                   = IMAGE_MAP_PROJECTION
END
"""


def test_parse_label_reads_projection_fields():
    lab = parse_label(LABEL_875S_20M)
    assert lab == GridLabel(7584, 7584, 20.0, 3791.5, 3791.5, 0.5, 1737400.0, -87.5, 16)


def test_pixel_mapping_matches_label_extent():
    lab = parse_label(LABEL_875S_20M)
    # Same projection constants, tiny data array: pixel mapping only depends on the label.
    grid = LolaGrid(dataclasses.replace(lab, lines=8, samples=8), np.zeros((8, 8), dtype=np.int16))
    col, row = grid.pixel_from_latlon(-90.0, 0.0)
    assert col == pytest.approx(3791.5) and row == pytest.approx(3791.5)
    col, row = grid.pixel_from_latlon(-87.5, 0.0)  # lon 0 points up (row 0)
    assert col == pytest.approx(3791.5, abs=1e-6) and row == pytest.approx(0.2, abs=0.3)
    col, row = grid.pixel_from_latlon(-87.5, 90.0)  # lon 90E points right (last column)
    assert col == pytest.approx(7582.8, abs=0.3) and row == pytest.approx(3791.5, abs=1e-6)
    lat, lon = grid.latlon_from_pixel(*grid.pixel_from_latlon(-88.7, 123.4))
    assert lat == pytest.approx(-88.7, abs=1e-9) and lon == pytest.approx(123.4, abs=1e-7)


def test_bilinear_and_nan_outside(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=4, scale_m=20.0)
    grid.data[:] = np.array([[0, 2, 4, 6], [10, 12, 14, 16], [20, 22, 24, 26], [30, 32, 34, 36]], dtype=np.int16)
    v = grid.value_bilinear(np.array([0.5, 1.0, -1.0, 3.5]), np.array([0.5, 2.0, 0.0, 0.0]))
    assert v[0] == pytest.approx(0.5 * (0 + 2 + 10 + 12) / 4)  # DN mean 6 -> 3.0 m
    assert v[1] == pytest.approx(0.5 * 22)
    assert np.isnan(v[2]) and np.isnan(v[3])


def test_subgrid_keeps_georeferencing(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=64, scale_m=20.0)
    grid.data[:] = np.arange(64 * 64, dtype=np.int16).reshape(64, 64)
    sub = grid.subgrid(row0=10, col0=20, rows=8, cols=8)
    lat, lon = grid.latlon_from_pixel(23.0, 13.0)
    assert sub.value_at(lat, lon) == pytest.approx(grid.value_at(lat, lon))
    assert sub.data.shape == (8, 8)


@pytest.mark.data
@needs_lola
def test_shackleton_is_a_deep_hole_in_real_data():
    grid = LolaGrid.from_pds(config.LOLA_DIR / "ldem_875s_20m.lbl")
    centre = grid.value_at(-89.66, 129.20)
    rim = []
    for az in range(0, 360, 15):
        col, row = grid.pixel_from_latlon(-89.66, 129.20)
        col += 525 * np.sin(np.radians(az))  # 10.5 km ring in pixels (20 m)
        row -= 525 * np.cos(np.radians(az))
        rim.append(grid.value_bilinear(np.array([col]), np.array([row]))[0])
    assert max(rim) - centre > 2000.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_lola.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.lola'`

- [ ] **Step 3: Implement lola.py**

`pipeline/lunar_pipeline/lola.py`:

```python
"""Read LOLA PDS3 polar-stereographic grids (local files or HTTP windows)."""

from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import config
from .geometry import ps_south_latlon_deg, ps_south_xy_m

_KEY = re.compile(r"^\s*(\^?[A-Z_]+)\s*=\s*([^\n]+?)\s*$", re.M)
_NUM = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


@dataclass(frozen=True)
class GridLabel:
    lines: int
    samples: int
    map_scale_m: float
    line_offset_px: float
    sample_offset_px: float
    scaling_factor: float
    offset: float
    max_latitude_deg: float
    sample_bits: int = 16


def parse_label(text: str) -> GridLabel:
    kv: dict[str, str] = {}
    for m in _KEY.finditer(text):
        kv.setdefault(m.group(1), m.group(2))

    def num(key: str) -> float:
        return float(_NUM.search(kv[key]).group(0))

    return GridLabel(
        lines=int(num("LINES")),
        samples=int(num("LINE_SAMPLES")),
        map_scale_m=num("MAP_SCALE"),
        line_offset_px=num("LINE_PROJECTION_OFFSET"),
        sample_offset_px=num("SAMPLE_PROJECTION_OFFSET"),
        scaling_factor=num("SCALING_FACTOR"),
        offset=num("OFFSET"),
        max_latitude_deg=num("MAXIMUM_LATITUDE"),
        sample_bits=int(num("SAMPLE_BITS")),
    )


class LolaGrid:
    """int16 south-polar grid. (col, row) are 0-based pixel-centre coordinates."""

    def __init__(self, label: GridLabel, data: np.ndarray):
        if data.shape != (label.lines, label.samples):
            raise ValueError(f"data shape {data.shape} != label {(label.lines, label.samples)}")
        self.label = label
        self.data = data

    @classmethod
    def from_pds(cls, lbl_path: Path, mmap: bool = True) -> "LolaGrid":
        label = parse_label(lbl_path.read_text())
        img = lbl_path.with_suffix(".img")
        shape = (label.lines, label.samples)
        if mmap:
            data = np.memmap(img, dtype="<i2", mode="r", shape=shape)
        else:
            data = np.fromfile(img, dtype="<i2").reshape(shape)
        return cls(label, data)

    def pixel_from_latlon(self, lat_deg, lon_deg):
        x, y = ps_south_xy_m(lat_deg, lon_deg)
        return (
            self.label.sample_offset_px + x / self.label.map_scale_m,
            self.label.line_offset_px - y / self.label.map_scale_m,
        )

    def latlon_from_pixel(self, col, row):
        x = (np.asarray(col, float) - self.label.sample_offset_px) * self.label.map_scale_m
        y = (self.label.line_offset_px - np.asarray(row, float)) * self.label.map_scale_m
        return ps_south_latlon_deg(x, y)

    def value_bilinear(self, col, row) -> np.ndarray:
        """DN * scaling_factor at fractional pixel positions; NaN where outside the grid."""
        col = np.asarray(col, dtype=np.float64)
        row = np.asarray(row, dtype=np.float64)
        out = np.full(col.shape, np.nan, dtype=np.float64)
        c0 = np.floor(col).astype(np.int64)
        r0 = np.floor(row).astype(np.int64)
        ok = (c0 >= 0) & (r0 >= 0) & (c0 < self.label.samples - 1) & (r0 < self.label.lines - 1)
        if not np.any(ok):
            return out
        cc, rr = c0[ok], r0[ok]
        fc, fr = col[ok] - cc, row[ok] - rr
        d = self.data
        top = d[rr, cc] * (1.0 - fc) + d[rr, cc + 1] * fc
        bottom = d[rr + 1, cc] * (1.0 - fc) + d[rr + 1, cc + 1] * fc
        out[ok] = (top * (1.0 - fr) + bottom * fr) * self.label.scaling_factor
        return out

    def value_at(self, lat_deg, lon_deg):
        col, row = self.pixel_from_latlon(lat_deg, lon_deg)
        v = self.value_bilinear(np.atleast_1d(col), np.atleast_1d(row))
        return float(v[0]) if np.ndim(lat_deg) == 0 else v

    def covers(self, lat_deg: float, lon_deg: float) -> bool:
        return not np.isnan(self.value_at(lat_deg, lon_deg))

    def subgrid(self, row0: int, col0: int, rows: int, cols: int) -> "LolaGrid":
        data = np.ascontiguousarray(self.data[row0 : row0 + rows, col0 : col0 + cols])
        label = dataclasses.replace(
            self.label,
            lines=data.shape[0],
            samples=data.shape[1],
            line_offset_px=self.label.line_offset_px - row0,
            sample_offset_px=self.label.sample_offset_px - col0,
        )
        return LolaGrid(label, data)


def remote_window(url: str, label: GridLabel, row0: int, col0: int, rows: int, cols: int) -> LolaGrid:
    """Read a window of a raw PDS .img over HTTP range requests via GDAL's /vsicurl/ and a raw-band VRT."""
    import os

    import rasterio
    from rasterio.windows import Window

    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
    # GDAL >= 3.10 refuses raw-band VRT sources outside the VRT's directory unless this is set.
    os.environ.setdefault("GDAL_VRT_RAWRASTERBAND_ALLOWED_SOURCE", "ALL")
    vrt_dir = config.OUT_DIR / "vrt"
    vrt_dir.mkdir(parents=True, exist_ok=True)
    vrt_path = vrt_dir / (Path(url).stem + ".vrt")
    vrt_path.write_text(
        f'<VRTDataset rasterXSize="{label.samples}" rasterYSize="{label.lines}">'
        f'<VRTRasterBand dataType="Int16" band="1" subClass="VRTRawRasterBand">'
        f'<SourceFilename relativeToVRT="0">/vsicurl/{url}</SourceFilename>'
        f"<ImageOffset>0</ImageOffset><PixelOffset>2</PixelOffset>"
        f"<LineOffset>{label.samples * 2}</LineOffset><ByteOrder>LSB</ByteOrder>"
        f"</VRTRasterBand></VRTDataset>"
    )
    with rasterio.open(vrt_path) as ds:
        data = ds.read(1, window=Window(col0, row0, cols, rows)).astype("<i2")
    sub = dataclasses.replace(
        label,
        lines=data.shape[0],
        samples=data.shape[1],
        line_offset_px=label.line_offset_px - row0,
        sample_offset_px=label.sample_offset_px - col0,
    )
    return LolaGrid(sub, data)
```

- [ ] **Step 4: Run the synthetic tests, then fetch LOLA and run the data test**

Run: `uv run pytest tests/test_lola.py -q`
Expected: `4 passed, 1 skipped` (the Shackleton test skips until the DEMs exist).

Run: `uv run python -c "from lunar_pipeline.fetch import fetch_all; fetch_all({'lola','illumination'})"`
Expected: 12 files under `data_raw/lola/` and `data_raw/illumination/` (~440 MB total). Then:

Run: `uv run pytest tests/test_lola.py -q`
Expected: `5 passed`. If `test_shackleton_is_a_deep_hole_in_real_data` fails, the `x = ρ sin λ` / `y = ρ cos λ` orientation is wrong: swap the sign of `y` in `ps_south_xy_m` and `ps_south_latlon_deg`, rerun Task 4 tests, and rerun this test. Do not proceed until it passes.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lunar_pipeline/lola.py pipeline/tests/test_lola.py
git commit -m "feat(pipeline): LOLA PDS grid reader with pixel mapping, bilinear sampling and HTTP windows"
```

---

### Task 6: Nested-grid terrain horizon mask

**Files:**
- Create: `pipeline/lunar_pipeline/horizon.py`
- Create: `pipeline/tests/test_horizon.py`

**Interfaces:**
- Produces: `Band(grid: LolaGrid, r_min_m: float, r_max_m: float, step_m: float)`; `site_height_m(lat, lon, grids: list[LolaGrid]) -> float` (first grid that covers the site); `horizon_mask(lat_deg, lon_deg, bands: list[Band], n_az=720, mast_m=2.0, site_height_m=None) -> np.ndarray` of shape `(n_az,)`, elevation in degrees for azimuths `k * 360/n_az`, clockwise from north; `mask_at_azimuth(mask, az_deg) -> float` (periodic linear interpolation).

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_horizon.py`:

```python
import numpy as np
import pytest

from lunar_pipeline.config import R_MOON_M
from lunar_pipeline.horizon import Band, horizon_mask, mask_at_azimuth, site_height_m

SITE = (-89.9, 45.0)  # 3.0 km from the pole, well inside a 1024 px x 20 m synthetic grid


def _paint_ring(grid, lat, lon, r_in_m, r_out_m, dn):
    col_c, row_c = grid.pixel_from_latlon(lat, lon)
    rows, cols = np.mgrid[0 : grid.label.lines, 0 : grid.label.samples]
    dist = np.hypot(cols - col_c, rows - row_c) * grid.label.map_scale_m
    grid.data[(dist >= r_in_m) & (dist <= r_out_m)] = dn


def test_flat_terrain_gives_slightly_negative_horizon(synthetic_grid_factory):
    # Flat sphere seen from a 2 m mast: skyline sits just below 0 deg (mast height and curvature).
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    mask = horizon_mask(*SITE, [Band(grid, 40.0, 8000.0, 10.0)], mast_m=2.0)
    d = np.arange(40.0, 8000.0, 10.0)
    expected = np.max(np.degrees(np.arctan2(R_MOON_M * np.cos(d / R_MOON_M) - (R_MOON_M + 2.0),
                                            R_MOON_M * np.sin(d / R_MOON_M))))
    assert -0.12 < expected < -0.05
    assert mask.shape == (720,)
    assert np.allclose(mask, expected, atol=0.01)


def test_ring_wall_matches_analytic_elevation(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    _paint_ring(grid, *SITE, 5000.0, 5100.0, dn=2000)  # 1000 m wall, 5 km away, all azimuths
    mask = horizon_mask(*SITE, [Band(grid, 40.0, 8000.0, 10.0)], mast_m=2.0)
    delta = 5000.0 / R_MOON_M
    expected = np.degrees(np.arctan2((R_MOON_M + 1000.0) * np.cos(delta) - (R_MOON_M + 2.0),
                                     (R_MOON_M + 1000.0) * np.sin(delta)))
    assert expected == pytest.approx(11.2, abs=0.1)
    assert np.all(np.abs(mask - expected) < 0.15)


def test_band_fallback_outside_fine_grid(synthetic_grid_factory):
    fine = synthetic_grid_factory(size=256, scale_m=20.0)  # covers only +-2.56 km around the pole
    coarse = synthetic_grid_factory(size=1024, scale_m=20.0)
    _paint_ring(coarse, *SITE, 5000.0, 5100.0, dn=2000)
    bands = [Band(fine, 40.0, 8000.0, 10.0), Band(coarse, 40.0, 8000.0, 10.0)]
    mask = horizon_mask(*SITE, bands, mast_m=2.0)
    assert np.all(mask > 10.9) and np.all(mask < 11.5)


def test_site_height_uses_first_covering_grid(synthetic_grid_factory):
    tiny = synthetic_grid_factory(size=8, scale_m=20.0, fill_dn=100)
    big = synthetic_grid_factory(size=1024, scale_m=20.0, fill_dn=-400)
    assert site_height_m(*SITE, [tiny, big]) == pytest.approx(-200.0)
    assert site_height_m(-90.0, 0.0, [tiny, big]) == pytest.approx(50.0)


def test_mask_at_azimuth_wraps():
    mask = np.zeros(720)
    mask[0] = 10.0
    assert mask_at_azimuth(mask, 359.75) == pytest.approx(5.0)
    assert mask_at_azimuth(mask, 0.25) == pytest.approx(5.0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_horizon.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.horizon'`

- [ ] **Step 3: Implement horizon.py**

`pipeline/lunar_pipeline/horizon.py`:

```python
"""Terrain horizon mask by great-circle ray marching over nested DEM grids (Barker et al. 2021 method)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import R_MOON_M
from .geometry import enu_basis, site_vector_km
from .lola import LolaGrid


@dataclass(frozen=True)
class Band:
    grid: LolaGrid
    r_min_m: float
    r_max_m: float
    step_m: float


def site_height_m(lat_deg: float, lon_deg: float, grids: list[LolaGrid]) -> float:
    for grid in grids:
        h = grid.value_at(lat_deg, lon_deg)
        if not np.isnan(h):
            return float(h)
    raise ValueError(f"no grid covers site ({lat_deg}, {lon_deg})")


def horizon_mask(
    lat_deg: float,
    lon_deg: float,
    bands: list[Band],
    n_az: int = 720,
    mast_m: float = 2.0,
    site_height_m_: float | None = None,
) -> np.ndarray:
    """Elevation angle (deg) of the terrain skyline for n_az azimuths (0 = north, clockwise)."""
    if site_height_m_ is None:
        site_height_m_ = site_height_m(lat_deg, lon_deg, [b.grid for b in bands])
    r_o = R_MOON_M + site_height_m_ + mast_m
    p_hat = site_vector_km(lat_deg, lon_deg) / np.linalg.norm(site_vector_km(lat_deg, lon_deg))
    east, north, _up = enu_basis(lat_deg, lon_deg)
    az = np.radians(np.arange(n_az) * (360.0 / n_az))
    t_hat = np.cos(az)[:, None] * north[None, :] + np.sin(az)[:, None] * east[None, :]  # (n_az, 3)

    mask = np.full(n_az, -90.0)
    for band in bands:
        d = np.arange(band.r_min_m, band.r_max_m, band.step_m, dtype=np.float64)  # (k,)
        delta = d / R_MOON_M
        cos_d, sin_d = np.cos(delta), np.sin(delta)
        q = cos_d[None, :, None] * p_hat[None, None, :] + sin_d[None, :, None] * t_hat[:, None, :]
        lat_q = np.degrees(np.arcsin(np.clip(q[..., 2], -1.0, 1.0)))
        lon_q = np.degrees(np.arctan2(q[..., 1], q[..., 0]))
        col, row = band.grid.pixel_from_latlon(lat_q, lon_q)
        h = band.grid.value_bilinear(col, row)  # (n_az, k), NaN outside coverage
        r_t = R_MOON_M + h
        el = np.degrees(np.arctan2(r_t * cos_d[None, :] - r_o, r_t * sin_d[None, :]))
        el = np.where(np.isnan(el), -90.0, el)
        mask = np.maximum(mask, el.max(axis=1))
    return mask


def mask_at_azimuth(mask: np.ndarray, az_deg) -> np.ndarray | float:
    n = mask.shape[0]
    step = 360.0 / n
    x = (np.asarray(az_deg, dtype=np.float64) % 360.0) / step
    i0 = np.floor(x).astype(int) % n
    i1 = (i0 + 1) % n
    f = x - np.floor(x)
    v = mask[i0] * (1.0 - f) + mask[i1] * f
    return float(v) if np.ndim(az_deg) == 0 else v
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_horizon.py -q`
Expected: `5 passed`. The ring test takes a few seconds (720 × 796 samples).

- [ ] **Step 5: Commit**

```bash
git add pipeline/lunar_pipeline/horizon.py pipeline/tests/test_horizon.py
git commit -m "feat(pipeline): nested-grid terrain horizon mask with exact spherical curvature"
```

---

### Task 7: DEM tile cutter and manifest for the browser engine

**Files:**
- Create: `pipeline/lunar_pipeline/tiles.py`
- Create: `pipeline/tests/test_tiles.py`

**Interfaces:**
- Produces: `TILE = 512`; `encode_tile(block: np.ndarray[int16]) -> bytes` (zlib of little-endian int16, row-major, padded to 512×512 with `NODATA = -32768`); `decode_tile(buf) -> np.ndarray (512, 512) int16`; `cut_grid(grid: LolaGrid, level_id: str, out_dir: Path) -> dict` (level manifest entry); `write_all(out_dir=config.OUT_DIR / "tiles") -> Path` (writes `manifest.json`).
- Consumes: `LolaGrid.from_pds` (Task 5).

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_tiles.py`:

```python
import json

import numpy as np

from lunar_pipeline.tiles import NODATA, TILE, cut_grid, decode_tile, encode_tile


def test_encode_decode_roundtrip():
    block = (np.arange(TILE * TILE, dtype=np.int32) % 5000 - 2500).astype(np.int16).reshape(TILE, TILE)
    assert np.array_equal(decode_tile(encode_tile(block)), block)


def test_cut_grid_pads_and_indexes(synthetic_grid_factory, tmp_path):
    grid = synthetic_grid_factory(size=1100, scale_m=20.0)
    grid.data[:] = (np.arange(1100 * 1100) % 3000).astype(np.int16).reshape(1100, 1100)
    entry = cut_grid(grid, "L9", tmp_path)
    assert entry["tiles_x"] == 3 and entry["tiles_y"] == 3 and entry["map_scale_m"] == 20.0
    assert entry["line_offset_px"] == 549.5 and entry["sample_offset_px"] == 549.5
    tile = decode_tile((tmp_path / "L9" / "2_2.bin").read_bytes())
    assert np.array_equal(tile[:76, :76], grid.data[1024:1100, 1024:1100])
    assert np.all(tile[76:, :] == NODATA) and np.all(tile[:, 76:] == NODATA)
    tile0 = decode_tile((tmp_path / "L9" / "0_1.bin").read_bytes())
    assert np.array_equal(tile0, grid.data[0:512, 512:1024])
    assert json.loads((tmp_path / "L9" / "level.json").read_text())["id"] == "L9"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_tiles.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.tiles'`

- [ ] **Step 3: Implement tiles.py**

`pipeline/lunar_pipeline/tiles.py`:

```python
"""Cut LOLA grids into 512x512 int16 zlib tiles for the browser horizon engine."""

from __future__ import annotations

import json
import zlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import config
from .lola import LolaGrid

TILE = 512
NODATA = -32768
LEVELS = [  # (level id, PDS stem, expected map scale m)
    ("L0", "ldem_875s_20m", 20.0),
    ("L1", "ldem_80s_80m", 80.0),
    ("L2", "ldem_60s_240m", 240.0),
]


def encode_tile(block: np.ndarray) -> bytes:
    if block.shape != (TILE, TILE):
        raise ValueError(f"tile must be {TILE}x{TILE}, got {block.shape}")
    return zlib.compress(np.ascontiguousarray(block, dtype="<i2").tobytes(), 6)


def decode_tile(buf: bytes) -> np.ndarray:
    return np.frombuffer(zlib.decompress(buf), dtype="<i2").reshape(TILE, TILE).copy()


def cut_grid(grid: LolaGrid, level_id: str, out_dir: Path) -> dict:
    lab = grid.label
    tiles_y = -(-lab.lines // TILE)
    tiles_x = -(-lab.samples // TILE)
    level_dir = out_dir / level_id
    level_dir.mkdir(parents=True, exist_ok=True)
    sizes: dict[str, int] = {}
    for ty in range(tiles_y):
        for tx in range(tiles_x):
            block = np.full((TILE, TILE), NODATA, dtype=np.int16)
            src = grid.data[ty * TILE : (ty + 1) * TILE, tx * TILE : (tx + 1) * TILE]
            block[: src.shape[0], : src.shape[1]] = src
            buf = encode_tile(block)
            (level_dir / f"{ty}_{tx}.bin").write_bytes(buf)
            sizes[f"{ty}_{tx}"] = len(buf)
    entry = {
        "id": level_id,
        "map_scale_m": lab.map_scale_m,
        "lines": lab.lines,
        "samples": lab.samples,
        "line_offset_px": lab.line_offset_px,
        "sample_offset_px": lab.sample_offset_px,
        "max_latitude_deg": lab.max_latitude_deg,
        "dn_scale_m": lab.scaling_factor,
        "tile_size": TILE,
        "tiles_x": tiles_x,
        "tiles_y": tiles_y,
        "nodata": NODATA,
        "path": f"{level_id}/{{y}}_{{x}}.bin",
        "bytes": sizes,
    }
    (level_dir / "level.json").write_text(json.dumps(entry, indent=1) + "\n")
    return entry


def write_all(out_dir: Path = config.OUT_DIR / "tiles") -> Path:
    levels = []
    for level_id, stem, scale in LEVELS:
        grid = LolaGrid.from_pds(config.LOLA_DIR / f"{stem}.lbl", mmap=False)
        if grid.label.map_scale_m != scale:
            raise ValueError(f"{stem}: expected {scale} m/px, label says {grid.label.map_scale_m}")
        print(f"[tiles] {level_id} <- {stem} ({grid.label.lines}x{grid.label.samples})", flush=True)
        entry = cut_grid(grid, level_id, out_dir)
        entry["source"] = f"{stem}.img"
        levels.append(entry)
    manifest = {
        "version": 1,
        "encoding": "zlib(int16 little-endian, row-major)",
        "reference_radius_m": config.R_MOON_M,
        "projection": "south polar stereographic, x = rho sin(lon), y = rho cos(lon), rho = 2R tan((90-|lat|)/2)",
        "pixel": "col = sample_offset_px + x/map_scale_m; row = line_offset_px - y/map_scale_m (0-based centres)",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "levels": levels,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=1) + "\n")
    return path
```

- [ ] **Step 4: Run tests, then cut the real tiles**

Run: `uv run pytest tests/test_tiles.py -q`
Expected: `2 passed`

Run: `uv run python -c "from lunar_pipeline.tiles import write_all; print(write_all())"`
Expected: `data_out/tiles/manifest.json` plus `L0/` (225 tiles), `L1/` (225 tiles), `L2/` (256 tiles); total roughly 150–200 MB; takes 1–3 minutes.

- [ ] **Step 5: Commit (tiles themselves are gitignored)**

```bash
git add pipeline/lunar_pipeline/tiles.py pipeline/tests/test_tiles.py
git commit -m "feat(pipeline): 512px int16 zlib DEM tiles with projection manifest"
```

---

### Task 8: Site catalog with derived rim points

**Files:**
- Create: `data/sites.json`
- Create: `pipeline/lunar_pipeline/sites.py`
- Create: `pipeline/tests/test_sites.py`

**Interfaces:**
- Produces: `Site(id, name, lat, lon, category, polar, source, landed_utc=None, derive_rim=None)`; `load_sites(path=config.DATA_DIR / "sites.json") -> list[Site]`; `polar_sites() -> list[Site]`; `derive_rim_points(grid: LolaGrid, sites: list[Site]) -> list[Site]` (for every site with `derive_rim`, the highest DEM point in the annulus becomes `<id>_rim_high`); `write_derived(out=config.DATA_DIR / "sites_derived.json")`.

- [ ] **Step 1: Write the catalog**

`data/sites.json`:

```json
{
  "version": 1,
  "sites": [
    {"id": "south_pole", "name": "Lunar South Pole (reference)", "lat": -90.0, "lon": 0.0,
     "category": "reference", "polar": true, "source": "definition"},
    {"id": "shackleton_center", "name": "Shackleton crater centre", "lat": -89.66, "lon": 129.20,
     "category": "classic", "polar": true, "source": "Zuber et al. 2012, Nature 486, 378 (LOLA)",
     "derive_rim": {"r_min_km": 8.5, "r_max_km": 12.0}},
    {"id": "de_gerlache_center", "name": "de Gerlache crater centre", "lat": -88.5, "lon": -87.1,
     "category": "classic", "polar": true, "source": "IAU Gazetteer of Planetary Nomenclature",
     "derive_rim": {"r_min_km": 13.0, "r_max_km": 18.0}},
    {"id": "im1_odysseus", "name": "IM-1 Odysseus landing site (Malapert A)", "lat": -80.13, "lon": 1.44,
     "category": "clps_landed", "polar": true, "landed_utc": "2024-02-22T23:23:00Z",
     "source": "NASA / Intuitive Machines, February 2024"},
    {"id": "im2_athena", "name": "IM-2 Athena landing site (Mons Mouton)", "lat": -84.7906, "lon": 29.1957,
     "category": "clps_landed", "polar": true, "landed_utc": "2025-03-06T17:30:00Z",
     "source": "Intuitive Machines / LROC, March 2025"},
    {"id": "blue_ghost_m1", "name": "Blue Ghost Mission 1 landing site (Mare Crisium)", "lat": 18.562, "lon": 61.810,
     "category": "clps_landed", "polar": false, "landed_utc": "2025-03-02T08:34:00Z",
     "source": "Firefly Aerospace / NSSDCA, March 2025"}
  ]
}
```

- [ ] **Step 2: Write the failing tests**

`pipeline/tests/test_sites.py`:

```python
import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.lola import LolaGrid
from lunar_pipeline.sites import Site, derive_rim_points, load_sites, polar_sites
from tests.conftest import needs_lola


def test_catalog_is_valid():
    sites = load_sites()
    ids = [s.id for s in sites]
    assert len(ids) == len(set(ids))
    for s in sites:
        assert -90.0 <= s.lat <= 90.0 and -180.0 < s.lon <= 180.0
        assert s.polar == (s.lat <= -80.0)
        assert s.category in {"reference", "classic", "clps_landed", "clps_planned", "artemis3"}
    assert {"shackleton_center", "im1_odysseus", "blue_ghost_m1"} <= set(ids)
    assert all(s.lat <= -80.0 for s in polar_sites())


def test_derive_rim_on_synthetic_crater(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    centre = Site("c", "c", -89.9, 45.0, "classic", True, "test", derive_rim={"r_min_km": 4.0, "r_max_km": 6.0})
    col, row = grid.pixel_from_latlon(centre.lat, centre.lon)
    rows, cols = np.mgrid[0:1024, 0:1024]
    dist = np.hypot(cols - col, rows - row) * 20.0
    grid.data[(dist > 4500) & (dist < 4700)] = 3000  # rim 1500 m high
    grid.data[int(row) + 230, int(col)] = 4000  # single peak 4.6 km south, 2000 m high
    derived = derive_rim_points(grid, [centre])
    assert derived[0].id == "c_rim_high"
    dcol, drow = grid.pixel_from_latlon(derived[0].lat, derived[0].lon)
    assert abs(dcol - col) < 1.5 and abs(drow - (row + 230)) < 1.5


@pytest.mark.data
@needs_lola
def test_shackleton_rim_high_is_above_centre():
    grid = LolaGrid.from_pds(config.LOLA_DIR / "ldem_875s_20m.lbl")
    centre = next(s for s in load_sites() if s.id == "shackleton_center")
    rim = derive_rim_points(grid, [centre])[0]
    assert grid.value_at(rim.lat, rim.lon) - grid.value_at(centre.lat, centre.lon) > 2000.0
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/test_sites.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.sites'`

- [ ] **Step 4: Implement sites.py**

`pipeline/lunar_pipeline/sites.py`:

```python
"""Featured-site catalog and derived rim points."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from . import config
from .lola import LolaGrid


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    lat: float
    lon: float
    category: str
    polar: bool
    source: str
    landed_utc: str | None = None
    derive_rim: dict | None = None


def load_sites(path: Path = config.DATA_DIR / "sites.json") -> list[Site]:
    raw = json.loads(path.read_text())["sites"]
    return [Site(**{k: v for k, v in s.items() if k in Site.__dataclass_fields__}) for s in raw]


def polar_sites(path: Path = config.DATA_DIR / "sites.json") -> list[Site]:
    return [s for s in load_sites(path) if s.polar]


def derive_rim_points(grid: LolaGrid, sites: list[Site]) -> list[Site]:
    out: list[Site] = []
    for s in sites:
        if not s.derive_rim:
            continue
        r_min = s.derive_rim["r_min_km"] * 1000.0
        r_max = s.derive_rim["r_max_km"] * 1000.0
        col_c, row_c = grid.pixel_from_latlon(s.lat, s.lon)
        half = int(np.ceil(r_max / grid.label.map_scale_m)) + 1
        r0, c0 = int(row_c) - half, int(col_c) - half
        r0c, c0c = max(r0, 0), max(c0, 0)
        window = grid.data[r0c : int(row_c) + half, c0c : int(col_c) + half].astype(np.float64)
        rows, cols = np.mgrid[r0c : r0c + window.shape[0], c0c : c0c + window.shape[1]]
        dist = np.hypot(cols - col_c, rows - row_c) * grid.label.map_scale_m
        window[(dist < r_min) | (dist > r_max)] = -np.inf
        k = int(np.argmax(window))
        rr, cc = np.unravel_index(k, window.shape)
        lat, lon = grid.latlon_from_pixel(float(cols[rr, cc]), float(rows[rr, cc]))
        out.append(
            Site(
                id=f"{s.id}_rim_high",
                name=f"{s.name.replace(' centre', '')} rim, highest point {s.derive_rim['r_min_km']}–{s.derive_rim['r_max_km']} km",
                lat=round(float(lat), 5),
                lon=round(float(lon), 5),
                category="classic",
                polar=True,
                source=f"derived: argmax LOLA {grid.label.map_scale_m:.0f} m height in annulus around {s.id}",
            )
        )
    return out


def write_derived(out: Path = config.DATA_DIR / "sites_derived.json") -> Path:
    grid = LolaGrid.from_pds(config.LOLA_DIR / "ldem_875s_20m.lbl")
    derived = derive_rim_points(grid, load_sites())
    out.write_text(json.dumps({"version": 1, "sites": [asdict(s) for s in derived]}, indent=2) + "\n")
    return out


def all_sites() -> list[Site]:
    sites = load_sites()
    derived = config.DATA_DIR / "sites_derived.json"
    if derived.exists():
        sites += load_sites(derived)
    return sites
```

- [ ] **Step 5: Run tests, generate the derived file, commit**

Run: `uv run pytest tests/test_sites.py -q`
Expected: `3 passed`

Run: `uv run python -c "from lunar_pipeline.sites import write_derived; print(write_derived())"`
Expected: `data/sites_derived.json` with `shackleton_center_rim_high` and `de_gerlache_center_rim_high`, both with `lat` below −88.

```bash
git add data/sites.json data/sites_derived.json pipeline/lunar_pipeline/sites.py pipeline/tests/test_sites.py
git commit -m "feat(pipeline): featured site catalog with derived crater-rim high points"
```

---

### Task 9: Per-site horizon masks (JSON artifacts)

**Files:**
- Create: `pipeline/lunar_pipeline/masks.py`
- Create: `pipeline/tests/test_masks.py`

**Interfaces:**
- Produces: `load_grids() -> dict[str, LolaGrid]` keyed `"L0" | "L1" | "L2"` (fully loaded, not mmap); `bands_for_site(site: Site, grids) -> list[Band]`; `mask_for_site(site, grids, mast_m=2.0) -> dict` (JSON-ready); `write_masks(site_ids: list[str] | None = None, out_dir=config.DATA_DIR / "masks") -> list[Path]`; `load_mask(site_id) -> np.ndarray`.
- Consumes: `Band`, `horizon_mask`, `site_height_m` (Task 6); `all_sites` (Task 8).

Mask JSON schema (one file per site, `data/masks/<site_id>.json`):

```json
{"site_id": "shackleton_center_rim_high", "lat": -89.7, "lon": 130.0, "n_az": 720, "az0_deg": 0.0, "az_step_deg": 0.5,
 "mast_m": 2.0, "site_height_m": 1234.5, "elevation_deg": [720 numbers, 3 decimals],
 "bands": [{"grid": "ldem_875s_20m", "r_min_m": 40, "r_max_m": 6000, "step_m": 10}, {"grid": "ldem_80s_80m", "r_min_m": 6000, "r_max_m": 100000, "step_m": 40}, {"grid": "ldem_60s_240m", "r_min_m": 100000, "r_max_m": 220000, "step_m": 120}],
 "method": "Barker et al. 2021 nested-grid horizon; great-circle march; exact spherical curvature; bilinear DEM sampling",
 "generated_utc": "2026-10-02T10:00:00+00:00"}
```

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_masks.py`:

```python
import json

import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.masks import bands_for_site, load_grids, load_mask, mask_for_site, write_masks
from lunar_pipeline.sites import Site, all_sites
from tests.conftest import needs_lola


def _site(sid):
    return next(s for s in all_sites() if s.id == sid)


@pytest.mark.data
@needs_lola
def test_band_selection_by_latitude():
    grids = load_grids()
    deep = bands_for_site(_site("shackleton_center"), grids)
    assert [b.grid.label.map_scale_m for b in deep] == [20.0, 80.0, 240.0]
    mid = bands_for_site(_site("im2_athena"), grids)  # -84.79: outside the 87.5S 20 m grid
    assert [b.grid.label.map_scale_m for b in mid] == [80.0, 240.0]
    assert mid[0].r_min_m == 40.0 and mid[0].step_m == 20.0


@pytest.mark.data
@needs_lola
def test_crater_floor_sees_high_horizon_and_rim_sees_low(tmp_path):
    grids = load_grids()
    floor = mask_for_site(_site("shackleton_center"), grids)
    rim = mask_for_site(_site("shackleton_center_rim_high"), grids)
    assert len(floor["elevation_deg"]) == 720
    assert float(np.mean(floor["elevation_deg"])) > 8.0
    assert float(np.mean(rim["elevation_deg"])) < 4.0
    assert max(rim["elevation_deg"]) < 15.0 and min(rim["elevation_deg"]) > -5.0


@pytest.mark.data
@needs_lola
def test_write_and_load_mask_roundtrip(tmp_path):
    paths = write_masks(["south_pole"], out_dir=tmp_path)
    doc = json.loads(paths[0].read_text())
    assert doc["site_id"] == "south_pole" and doc["az_step_deg"] == 0.5 and doc["mast_m"] == 2.0
    mask = load_mask("south_pole", masks_dir=tmp_path)
    assert mask.shape == (720,) and np.all(np.isfinite(mask))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_masks.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.masks'`

- [ ] **Step 3: Implement masks.py**

`pipeline/lunar_pipeline/masks.py`:

```python
"""Compute and store per-site terrain horizon masks."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import config
from .horizon import Band, horizon_mask, site_height_m
from .lola import LolaGrid
from .sites import Site, all_sites

GRID_FILES = {"L0": "ldem_875s_20m", "L1": "ldem_80s_80m", "L2": "ldem_60s_240m"}
METHOD = (
    "Barker et al. 2021 nested-grid horizon; great-circle march; exact spherical curvature; "
    "bilinear DEM sampling"
)


def load_grids() -> dict[str, LolaGrid]:
    return {k: LolaGrid.from_pds(config.LOLA_DIR / f"{v}.lbl", mmap=False) for k, v in GRID_FILES.items()}


def bands_for_site(site: Site, grids: dict[str, LolaGrid]) -> list[Band]:
    l0, l1, l2 = grids["L0"], grids["L1"], grids["L2"]
    if site.lat <= -87.55:  # 20 m grid covers the site and its first 6 km
        return [Band(l0, 40.0, 6_000.0, 10.0), Band(l1, 6_000.0, 100_000.0, 40.0), Band(l2, 100_000.0, 220_000.0, 120.0)]
    return [Band(l1, 40.0, 100_000.0, 20.0), Band(l2, 100_000.0, 220_000.0, 120.0)]


def mask_for_site(site: Site, grids: dict[str, LolaGrid], mast_m: float = 2.0, n_az: int = 720) -> dict:
    bands = bands_for_site(site, grids)
    h_site = site_height_m(site.lat, site.lon, [b.grid for b in bands])
    mask = horizon_mask(site.lat, site.lon, bands, n_az=n_az, mast_m=mast_m, site_height_m_=h_site)
    names = {id(g): name for name, g in zip(GRID_FILES.values(), grids.values())}
    return {
        "site_id": site.id,
        "lat": site.lat,
        "lon": site.lon,
        "n_az": n_az,
        "az0_deg": 0.0,
        "az_step_deg": 360.0 / n_az,
        "mast_m": mast_m,
        "site_height_m": round(float(h_site), 2),
        "elevation_deg": [round(float(v), 3) for v in mask],
        "bands": [
            {"grid": names[id(b.grid)], "r_min_m": b.r_min_m, "r_max_m": b.r_max_m, "step_m": b.step_m}
            for b in bands
        ],
        "method": METHOD,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def write_masks(site_ids: list[str] | None = None, out_dir: Path = config.DATA_DIR / "masks") -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    grids = load_grids()
    paths: list[Path] = []
    for site in all_sites():
        if not site.polar or (site_ids and site.id not in site_ids):
            continue
        print(f"[masks] {site.id}", flush=True)
        doc = mask_for_site(site, grids)
        path = out_dir / f"{site.id}.json"
        path.write_text(json.dumps(doc) + "\n")
        paths.append(path)
    return paths


def load_mask(site_id: str, masks_dir: Path = config.DATA_DIR / "masks") -> np.ndarray:
    doc = json.loads((masks_dir / f"{site_id}.json").read_text())
    return np.asarray(doc["elevation_deg"], dtype=np.float64)
```

- [ ] **Step 4: Run tests, generate all masks, commit**

Run: `uv run pytest tests/test_masks.py -q`
Expected: `3 passed` (each mask takes about 2–5 s).

Run: `uv run python -c "from lunar_pipeline.masks import write_masks; print(len(write_masks()))"`
Expected: `7` files in `data/masks/` (south_pole, shackleton_center, de_gerlache_center, im1_odysseus, im2_athena, shackleton_center_rim_high, de_gerlache_center_rim_high), each about 6 KB.

```bash
git add pipeline/lunar_pipeline/masks.py pipeline/tests/test_masks.py data/masks/
git commit -m "feat(pipeline): per-site 720-azimuth horizon masks as JSON artifacts"
```

---

### Task 10: JPL Horizons fixtures and cross-check

**Files:**
- Create: `pipeline/lunar_pipeline/horizons.py`
- Create: `pipeline/tests/test_horizons.py`

**Interfaces:**
- Produces: `horizons_url(lat, lon, alt_km, body_id, start, stop, step) -> str`; `parse_horizons_csv(result_text) -> list[dict(utc: str, az: float, el: float)]`; `fetch_fixtures(site_ids, start="2025-01-01", stop="2027-01-01", step="30d", out_dir=config.DATA_DIR / "fixtures" / "horizons") -> list[Path]`; `compare_all(fixtures_dir=...) -> dict` (per-site/body max |Δaz·cos(el)| and |Δel| in degrees; writes `summary.json`).
- Consumes: `load_table`, `interp_vectors`, `utc_to_et` (Task 3); `azel_from_body_vectors` (Task 4); `all_sites` (Task 8).

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_horizons.py`:

```python
import json

import pytest

from lunar_pipeline import config
from lunar_pipeline.horizons import compare_all, horizons_url, parse_horizons_csv
from tests.conftest import needs_fixtures, needs_kernels

SAMPLE = """API VERSION: 1.2
*******************************************************************************
$$SOE
 2025-Jan-01 00:00,*,m,  123.4567,   -1.2345,
 2025-Jan-31 00:00, ,m,  200.0001,    3.5000,
$$EOE
*******************************************************************************
"""


def test_parse_horizons_csv_rows():
    rows = parse_horizons_csv(SAMPLE)
    assert rows == [
        {"utc": "2025-01-01T00:00:00", "az": 123.4567, "el": -1.2345},
        {"utc": "2025-01-31T00:00:00", "az": 200.0001, "el": 3.5},
    ]


def test_parse_horizons_rejects_missing_soe():
    with pytest.raises(ValueError):
        parse_horizons_csv("No ephemeris for target ... error")


def test_horizons_url_encodes_site_and_body():
    url = horizons_url(-89.66, 129.2, 0.0, 10, "2025-01-01", "2027-01-01", "30d")
    assert "CENTER=%27coord%40301%27" in url and "SITE_COORD=%27129.2%2C-89.66%2C0.0%27" in url
    assert "COMMAND=%2710%27" in url and "QUANTITIES=%274%27" in url and "APPARENT=%27AIRLESS%27" in url


@pytest.mark.data
@needs_kernels
@needs_fixtures
def test_our_azel_matches_horizons_within_tolerance():
    summary = compare_all()
    assert summary["n_rows"] >= 100
    assert summary["max_abs_delta_el_deg"] < 0.05
    assert summary["max_abs_delta_az_cos_el_deg"] < 0.05
    assert (config.DATA_DIR / "fixtures" / "horizons" / "summary.json").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_horizons.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.horizons'`

- [ ] **Step 3: Implement horizons.py**

`pipeline/lunar_pipeline/horizons.py`:

```python
"""JPL Horizons cross-check: Sun/Earth az/el seen from lunar surface sites."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

import numpy as np
import requests

from . import config
from .ephemeris import interp_vectors, load_table
from .geometry import azel_from_body_vectors
from .sites import all_sites
from .spice_env import spice_kernels, utc_to_et

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODY_IDS = {"SUN": 10, "EARTH": 399}
FIXTURE_SITES = ["south_pole", "shackleton_center", "de_gerlache_center", "im1_odysseus", "im2_athena", "blue_ghost_m1"]


def horizons_url(lat: float, lon: float, alt_km: float, body_id: int, start: str, stop: str, step: str) -> str:
    params = {
        "format": "json",
        "COMMAND": f"'{body_id}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},{alt_km}'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'4'",
        "APPARENT": "'AIRLESS'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'UT'",
    }
    return API + "?" + urlencode(params)


_ROW = re.compile(r"^\s*(\d{4}-[A-Za-z]{3}-\d{2} \d{2}:\d{2})")


def parse_horizons_csv(text: str) -> list[dict]:
    if "$$SOE" not in text or "$$EOE" not in text:
        raise ValueError("Horizons result has no $$SOE/$$EOE block: " + text[:200])
    body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for line in body.strip().splitlines():
        m = _ROW.match(line)
        if not m:
            continue
        fields = [f.strip() for f in line.split(",")]
        numeric = [f for f in fields[1:] if re.fullmatch(r"[-+]?\d+(\.\d+)?", f)]
        az, el = float(numeric[-2]), float(numeric[-1])
        utc = datetime.strptime(m.group(1), "%Y-%b-%d %H:%M").strftime("%Y-%m-%dT%H:%M:%S")
        rows.append({"utc": utc, "az": az, "el": el})
    if not rows:
        raise ValueError("Horizons result contained no ephemeris rows")
    return rows


def fetch_fixtures(
    site_ids: list[str] | None = None,
    start: str = "2025-01-01",
    stop: str = "2027-01-01",
    step: str = "30d",
    out_dir: Path = config.DATA_DIR / "fixtures" / "horizons",
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    sites = {s.id: s for s in all_sites()}
    paths: list[Path] = []
    for sid in site_ids or FIXTURE_SITES:
        site = sites[sid]
        for body, body_id in BODY_IDS.items():
            url = horizons_url(site.lat, site.lon, 0.0, body_id, start, stop, step)
            r = requests.get(url, timeout=120)
            if r.status_code != 200:
                raise RuntimeError(f"Horizons HTTP {r.status_code} for {url}")
            result = r.json().get("result", "")
            rows = parse_horizons_csv(result)
            doc = {"site_id": sid, "body": body, "lat": site.lat, "lon": site.lon, "alt_km": 0.0,
                   "query_url": url, "rows": rows}
            path = out_dir / f"{sid}_{body.lower()}.json"
            path.write_text(json.dumps(doc, indent=1) + "\n")
            print(f"[horizons] {path.name}: {len(rows)} rows", flush=True)
            paths.append(path)
    return paths


def compare_all(fixtures_dir: Path = config.DATA_DIR / "fixtures" / "horizons") -> dict:
    table, header = load_table()
    per_file = []
    worst_el = worst_az = 0.0
    n_rows = 0
    with spice_kernels():
        for path in sorted(fixtures_dir.glob("*_sun.json")) + sorted(fixtures_dir.glob("*_earth.json")):
            doc = json.loads(path.read_text())
            row_index = 0 if doc["body"] == "SUN" else 1
            d_el = d_az = 0.0
            for row in doc["rows"]:
                et = utc_to_et(row["utc"])
                vec = interp_vectors(table, header["t0_et"], header["step_s"], et)[row_index]
                az, el = azel_from_body_vectors(vec, doc["lat"], doc["lon"], 0.0)
                daz = (float(az) - row["az"] + 180.0) % 360.0 - 180.0
                d_az = max(d_az, abs(daz * np.cos(np.radians(row["el"]))))
                d_el = max(d_el, abs(float(el) - row["el"]))
                n_rows += 1
            per_file.append({"file": path.name, "max_abs_delta_el_deg": d_el, "max_abs_delta_az_cos_el_deg": d_az})
            worst_el, worst_az = max(worst_el, d_el), max(worst_az, d_az)
    summary = {"n_rows": n_rows, "max_abs_delta_el_deg": worst_el, "max_abs_delta_az_cos_el_deg": worst_az,
               "files": per_file}
    (fixtures_dir / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    return summary
```

- [ ] **Step 4: Run the offline tests, fetch fixtures, run the comparison**

Run: `uv run pytest tests/test_horizons.py -q`
Expected: `3 passed, 1 skipped`

Run: `uv run python -c "from lunar_pipeline.horizons import fetch_fixtures; fetch_fixtures()"`
Expected: 12 files in `data/fixtures/horizons/`, 25 rows each. If Horizons answers with an error block, the command fails with the query URL in the message; open the URL in a browser to read the message, fix the parameter, rerun.

Run: `uv run pytest tests/test_horizons.py -q`
Expected: `4 passed`; open `data/fixtures/horizons/summary.json` and note the two maxima (expected below 0.02°). If `max_abs_delta_az_cos_el_deg` is around 0.5° or more, azimuth is mirrored: check the sign of `east` in `enu_basis` against the Task 4 tests before touching anything else.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lunar_pipeline/horizons.py pipeline/tests/test_horizons.py data/fixtures/horizons/
git commit -m "feat(pipeline): JPL Horizons fixtures and az/el cross-check with summary"
```

---

### Task 11: Illumination and Earth-visibility series, Mazarico check, report CLI

**Files:**
- Create: `pipeline/lunar_pipeline/illumination.py`
- Create: `pipeline/lunar_pipeline/cli.py`
- Create: `pipeline/tests/test_illumination.py`
- Create: `pipeline/tests/test_cli.py`

**Interfaces:**
- Produces: `disk_fraction(delta_deg, disk_radius_deg) -> np.ndarray` (fraction of the solar disk above the skyline); `sun_radius_deg(dist_km) -> np.ndarray`; `hourly_series(site, mask, table, header, start_utc: str, hours: int) -> dict` with arrays `utc_index`, `sun_az`, `sun_el`, `earth_az`, `earth_el`, `sun_fraction`, `earth_visible`; `longest_run(flags) -> int`; `summarize(series) -> dict` with `illum_fraction`, `mean_sun_fraction`, `longest_dark_h`, `earth_vis_fraction`, `longest_earth_gap_h`, `joint_fraction`; `mazarico_fraction(lat, lon, product="avgvisib_85s_060m_201608") -> float`; `report(site_id, start_utc, days) -> dict`.
- Produces CLI `python -m lunar_pipeline.cli {fetch,ephemeris,tiles,sites-derive,masks,horizons-fetch,horizons-compare,report}`.
- Consumes: Tasks 3, 4, 6, 8, 9, 10.

- [ ] **Step 1: Write the failing tests**

`pipeline/tests/test_illumination.py`:

```python
import numpy as np
import pytest

from lunar_pipeline import illumination as il
from tests.conftest import needs_illum, needs_kernels, needs_lola


def test_disk_fraction_endpoints_and_middle():
    assert il.disk_fraction(np.array([-1.0]), 0.2665)[0] == pytest.approx(0.0)
    assert il.disk_fraction(np.array([1.0]), 0.2665)[0] == pytest.approx(1.0)
    assert il.disk_fraction(np.array([0.0]), 0.2665)[0] == pytest.approx(0.5)
    assert il.disk_fraction(np.array([0.13325]), 0.2665)[0] == pytest.approx(0.8045, abs=1e-3)


def test_sun_radius_at_one_au():
    assert il.sun_radius_deg(np.array([149_597_870.7]))[0] == pytest.approx(0.2665, abs=1e-3)


def test_longest_run():
    assert il.longest_run(np.array([0, 1, 1, 0, 1, 1, 1, 0], dtype=bool)) == 3
    assert il.longest_run(np.zeros(5, dtype=bool)) == 0
    assert il.longest_run(np.ones(5, dtype=bool)) == 5


def test_summarize_on_synthetic_series():
    n = 100
    series = {
        "sun_fraction": np.r_[np.ones(60), np.zeros(40)],
        "earth_visible": np.r_[np.ones(50, dtype=bool), np.zeros(50, dtype=bool)],
    }
    s = il.summarize(series)
    assert s["illum_fraction"] == pytest.approx(0.6) and s["longest_dark_h"] == 40
    assert s["earth_vis_fraction"] == pytest.approx(0.5) and s["longest_earth_gap_h"] == 50
    assert s["joint_fraction"] == pytest.approx(0.5)


@pytest.mark.data
@needs_kernels
@needs_lola
@needs_illum
def test_shackleton_floor_is_dark_and_rim_is_bright():
    floor = il.report("shackleton_center", "2025-01-01", 730)
    rim = il.report("shackleton_center_rim_high", "2025-01-01", 730)
    assert floor["metrics"]["illum_fraction"] < 0.02 and floor["mazarico_avgvisib"] < 0.02
    assert rim["metrics"]["illum_fraction"] > 0.5
    assert abs(rim["metrics"]["illum_fraction"] - rim["mazarico_avgvisib"]) < 0.15
    assert 0.3 < rim["metrics"]["earth_vis_fraction"] < 0.8
```

`pipeline/tests/test_cli.py`:

```python
import pytest

from lunar_pipeline.cli import build_parser


def test_cli_has_all_subcommands():
    parser = build_parser()
    for cmd in ["fetch", "ephemeris", "tiles", "sites-derive", "masks", "horizons-fetch", "horizons-compare", "report"]:
        args = parser.parse_args([cmd] + (["--site", "x"] if cmd == "report" else []))
        assert args.cmd == cmd


def test_report_requires_site():
    with pytest.raises(SystemExit):
        build_parser().parse_args(["report"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_illumination.py tests/test_cli.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'lunar_pipeline.illumination'`

- [ ] **Step 3: Implement illumination.py and cli.py**

`pipeline/lunar_pipeline/illumination.py`:

```python
"""Hourly illumination and Earth-visibility series for a site, plus the Mazarico map check."""

from __future__ import annotations

import numpy as np

from . import config
from .config import SUN_RADIUS_KM
from .ephemeris import load_table
from .geometry import azel_from_body_vectors
from .horizon import mask_at_azimuth
from .lola import LolaGrid
from .masks import load_mask
from .sites import all_sites
from .spice_env import spice_kernels, utc_to_et


def disk_fraction(delta_deg, disk_radius_deg) -> np.ndarray:
    """Fraction of a disk of angular radius disk_radius_deg lying above a straight skyline.

    delta_deg = disk centre elevation minus skyline elevation.
    """
    x = np.clip(np.asarray(delta_deg, dtype=np.float64) / np.asarray(disk_radius_deg, dtype=np.float64), -1.0, 1.0)
    return (np.arccos(-x) + x * np.sqrt(1.0 - x * x)) / np.pi


def sun_radius_deg(dist_km) -> np.ndarray:
    return np.degrees(np.arcsin(SUN_RADIUS_KM / np.asarray(dist_km, dtype=np.float64)))


def hourly_series(site, mask: np.ndarray, table: np.ndarray, header: dict, start_utc: str, hours: int) -> dict:
    with spice_kernels():
        et0 = utc_to_et(start_utc)
    i0 = int(round((et0 - header["t0_et"]) / header["step_s"]))
    if i0 < 0 or i0 + hours > header["n"]:
        raise ValueError("requested span is outside the ephemeris table")
    rows = table[i0 : i0 + hours].astype(np.float64)  # (hours, 2, 3)
    sun_az, sun_el = azel_from_body_vectors(rows[:, 0, :], site.lat, site.lon, 0.0)
    earth_az, earth_el = azel_from_body_vectors(rows[:, 1, :], site.lat, site.lon, 0.0)
    sun_dist = np.linalg.norm(rows[:, 0, :], axis=1)
    sun_fraction = disk_fraction(sun_el - mask_at_azimuth(mask, sun_az), sun_radius_deg(sun_dist))
    earth_visible = (earth_el - mask_at_azimuth(mask, earth_az)) > 0.0
    return {
        "utc_index": np.arange(hours) + i0,
        "sun_az": sun_az, "sun_el": sun_el, "earth_az": earth_az, "earth_el": earth_el,
        "sun_fraction": sun_fraction, "earth_visible": earth_visible,
    }


def longest_run(flags: np.ndarray) -> int:
    best = cur = 0
    for v in np.asarray(flags, dtype=bool):
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return int(best)


def summarize(series: dict) -> dict:
    lit = np.asarray(series["sun_fraction"]) > 0.0
    vis = np.asarray(series["earth_visible"], dtype=bool)
    return {
        "hours": int(lit.size),
        "illum_fraction": float(lit.mean()),
        "mean_sun_fraction": float(np.mean(series["sun_fraction"])),
        "longest_dark_h": longest_run(~lit),
        "earth_vis_fraction": float(vis.mean()),
        "longest_earth_gap_h": longest_run(~vis),
        "joint_fraction": float(np.mean(lit & vis)),
    }


def mazarico_fraction(lat: float, lon: float, product: str = "avgvisib_85s_060m_201608") -> float:
    grid = LolaGrid.from_pds(config.ILLUM_DIR / f"{product}.lbl")
    return float(grid.value_at(lat, lon))


def report(site_id: str, start_utc: str = "2025-01-01T00:00:00", days: int = 730) -> dict:
    site = next(s for s in all_sites() if s.id == site_id)
    if len(start_utc) == 10:
        start_utc += "T00:00:00"
    table, header = load_table()
    mask = load_mask(site_id)
    series = hourly_series(site, mask, table, header, start_utc, days * 24)
    out = {"site_id": site_id, "lat": site.lat, "lon": site.lon, "start_utc": start_utc, "days": days,
           "metrics": summarize(series)}
    if site.lat <= -82.9:
        out["mazarico_avgvisib"] = mazarico_fraction(site.lat, site.lon)
        out["mazarico_earth_visib"] = mazarico_fraction(site.lat, site.lon, "avgvisib_85s_060m_201608_earth")
    return out
```

`pipeline/lunar_pipeline/cli.py`:

```python
"""Command-line entry point: python -m lunar_pipeline.cli <command>."""

from __future__ import annotations

import argparse
import json


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="lunar_pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download NASA source files")
    f.add_argument("--group", action="append", choices=["kernels", "lola", "illumination"])
    sub.add_parser("ephemeris", help="build the hourly MOON_ME Sun/Earth table")
    sub.add_parser("tiles", help="cut DEM tiles into data_out/tiles")
    sub.add_parser("sites-derive", help="derive crater-rim high points")
    m = sub.add_parser("masks", help="compute per-site horizon masks")
    m.add_argument("--site", action="append")
    sub.add_parser("horizons-fetch", help="download JPL Horizons fixtures")
    sub.add_parser("horizons-compare", help="compare our az/el against Horizons fixtures")
    r = sub.add_parser("report", help="illumination / Earth-visibility metrics for a site")
    r.add_argument("--site", required=True)
    r.add_argument("--start", default="2025-01-01")
    r.add_argument("--days", type=int, default=730)
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    if args.cmd == "fetch":
        from .fetch import fetch_all
        fetch_all(set(args.group) if args.group else None)
    elif args.cmd == "ephemeris":
        from .ephemeris import write_table
        print(write_table())
    elif args.cmd == "tiles":
        from .tiles import write_all
        print(write_all())
    elif args.cmd == "sites-derive":
        from .sites import write_derived
        print(write_derived())
    elif args.cmd == "masks":
        from .masks import write_masks
        for path in write_masks(args.site):
            print(path)
    elif args.cmd == "horizons-fetch":
        from .horizons import fetch_fixtures
        fetch_fixtures()
    elif args.cmd == "horizons-compare":
        from .horizons import compare_all
        print(json.dumps(compare_all(), indent=1))
    elif args.cmd == "report":
        from .illumination import report
        print(json.dumps(report(args.site, args.start, args.days), indent=1))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run all tests, then the Week 1 demo command**

Run: `uv run pytest -q`
Expected: all tests pass, zero skips (every data group has been fetched by now). Runtime a few minutes because of the mask tests.

Run: `uv run python -m lunar_pipeline.cli report --site shackleton_center_rim_high`
Expected JSON with `metrics.illum_fraction` above 0.6, `mazarico_avgvisib` within 0.15 of it, `longest_dark_h` in the low hundreds of hours, and `earth_vis_fraction` roughly 0.4–0.7.

Run: `uv run python -m lunar_pipeline.cli report --site shackleton_center`
Expected: `illum_fraction` near 0 and `mazarico_avgvisib` near 0 (permanently shadowed floor).

- [ ] **Step 5: Commit**

```bash
git add pipeline/lunar_pipeline/illumination.py pipeline/lunar_pipeline/cli.py pipeline/tests/test_illumination.py pipeline/tests/test_cli.py
git commit -m "feat(pipeline): illumination and Earth-visibility metrics with Mazarico check and CLI"
```

---

### Task 12: Week 1 exit — method notes and data size check

**Files:**
- Create: `docs/method.md`
- Modify: `pipeline/README.md` (append the "Week 1 results" section)

- [ ] **Step 1: Write the method page from the numbers you now have**

`docs/method.md` (fill the three numbers from `summary.json` and the two report runs):

```markdown
# Method (Week 1 reference implementation)

## Sun and Earth positions
- SPICE DE440 (`de440s.bsp`), lunar orientation `moon_pa_de440_200625.bpc`, frame `MOON_ME` (alias of `MOON_ME_DE440_ME421`), aberration `LT+S`, observer = Moon centre.
- Hourly table 2024-01-01 → 2036-12-31 (113,952 steps), float32 km, Catmull-Rom interpolation between samples (error below 0.002° at half steps).
- Topocentric az/el from a site on the 1737.4 km sphere with the site offset subtracted (Earth parallax up to 0.26°).

## Terrain horizon
- LOLA polar DEMs (20 m to 6 km, 80 m to 100 km, 240 m to 220 km), 720 azimuths, great-circle march, exact spherical curvature, bilinear sampling. Observer mast 2 m.
- Sunlit fraction = fraction of the solar disk (radius 0.267°) above the skyline; Earth visible when Earth centre is above the skyline.

## Cross-checks (from `data/fixtures/horizons/summary.json` and the report command)
- JPL Horizons, 6 sites × 2 bodies × 25 epochs: max |Δel| = ___°, max |Δaz·cos el| = ___°.
- Mazarico et al. 2011 average illumination at Shackleton rim high point: ours ___ vs map ___ (different time spans: 2025–2026 vs 2009–2013).
```

- [ ] **Step 2: Append results to the README and check committed data size**

Append to `pipeline/README.md`:

```markdown
## Week 1 results

- `uv run pytest -q` → all green (record the count).
- `report --site shackleton_center_rim_high` → paste the JSON here.
- Committed data size: run `du -sh ../data` (must stay below 30 MB).
```

Run: `du -sh ../data` (from `pipeline/`)
Expected: below 30 MB (ephemeris 2.7 MB, masks ~50 KB, fixtures ~100 KB, sites ~5 KB).

- [ ] **Step 3: Commit**

```bash
git add docs/method.md pipeline/README.md
git commit -m "docs: Week 1 method notes and pipeline results"
```

---

## Verified before execution (2026-09-28 probes)

- LOLA labels read directly from PDS: sizes, offsets and scale in Global Constraints are exact.
- Projection orientation confirmed on real data over HTTP: Shackleton centre (−89.66, 129.20) reads −2773 m on `ldem_80s_20m`, the 10.5 km ring reads 905–1678 m (Δ = 2689 m), IM-2 site reads +5320 m (Mons Mouton plateau). The Task 5 landmark test therefore should pass on the first run.
- `remote_window` needs `GDAL_VRT_RAWRASTERBAND_ALLOWED_SOURCE=ALL` (GDAL 3.12.4 via rasterio 1.5.1); a 16×16 window costs 6–7 s over HTTP, so it is for spot checks only.
- The PGDA 5 m mosaic is a tiled GeoTIFF (256 px deflate tiles, float32, NaN nodata, transform 5 m/px with origin (−100000, 100000) m) and remote windowed reads work intermittently (tile reads sometimes fail mid-transfer). 5 m near-field masks stay out of this plan.
- Toolchain on the dev machine: uv 0.12.0, Python 3.12.13 (managed) and 3.13.2, spiceypy 8.2.0 and rasterio 1.5.1 have wheels for both. Disk free ≈ 11 GB; this plan downloads ≈ 440 MB.

## Self-review notes

- Spec coverage: 5.1 ephemeris (Task 3), 5.2 tiles + nested-grid masks (Tasks 5–7, 9), 5.3 metrics (Task 11), 6 validation Horizons/Mazarico/landmark tests (Tasks 5, 10, 11), 8 Week 1 milestone (Task 11 demo command). Not in this plan by design: 5 m near-field masks (needs the 3.3 GB PGDA GeoTIFF over HTTP; deferred to the validation-page week once the remote-read probe is confirmed), Artemis III region polygons (USGS ScienceBase blocks scripted downloads; add via browser download in the site-picker week), Next.js scaffold (Week 2 plan), R2 upload (hosting week).
- Types: `GridLabel` field order used positionally in `test_parse_label_reads_projection_fields` matches the dataclass order. `horizon_mask` keyword is `site_height_m_` (trailing underscore) to avoid shadowing the function `site_height_m`; `masks.py` passes it that way.
- Review Focus items 1–5 are pinned by `test_band_fallback_outside_fine_grid`, `test_normalize_lon`, `test_interp_rejects_out_of_range`, `test_parse_horizons_rejects_missing_soe` + `needs_fixtures`, and the two fetch tests.
