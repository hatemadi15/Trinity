# Week 5 — Validation Page, Mission Backcasts, Export Brief and Learn Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the science defensible and shareable: a Validate page with three tables (JPL Horizons cross-check with a live re-check, LOLA illumination-map agreement, CLPS mission backcasts), a printable one-page mission brief, and a Learn mode that turns the same screens into a five-step story for educators and the public.

**Architecture:** The Python pipeline gains a `validate` command that writes three small JSON documents into `data/validation/` (committed, synced to `web/public/data/validation/`): the Horizons comparison rows with query URLs, our 2024–2036 hourly sunlit fraction against the Mazarico `AVGVISIB_85S_060M` map at every site the map covers, and predicted local sunrise/sunset around each landed CLPS mission against the reported mission end. The web app renders them on `/validate` and adds a live re-check through a Next.js route handler that proxies the JPL Horizons API (server side, fixture fallback offline). The brief is a print-styled `/brief` page built from the store (KPIs, verdict, timeline, sky dome, method, credits) and `window.print()`; no PDF library. Learn mode is a store flag (`audience: 'planner' | 'learn'`, persisted in localStorage) that hides three KPIs, adds plain-language help lines under the tiles and shows a five-step guided story panel.

**Tech Stack:** unchanged. No new dependencies, no downloads.

**Spec:** `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md` (sections 2 Learn toggle and backcast hook, 3 differentiators "Mission backcast", "Validation page", "Export brief", "Learn mode", 6 Validity story, 8 Week 5).

## Design plan (frontend-design)

Validate is a lab notebook page: three tables in one column, each headed by the question it answers ("Do we point where JPL points?", "Do we light what LOLA lights?", "Did the landers die when the Sun set?") and a one-line verdict under the heading with the worst number. Tables use tabular figures, right-aligned numbers, units in the header, a quiet row divider; rows never colour-code except the verdict line (status tokens). The live re-check is one button per table ("Re-check with JPL now") that reports "8 epochs, worst 0.00003° (12 s)" or, offline, "JPL unreachable; showing the stored 2025–2026 comparison". The brief page is printable A4 portrait: title, site and window, verdict chip, six KPIs in two rows, the timeline and sky dome as SVG, two paragraphs of method, the data credits; a "Print or save as PDF" button hidden in print. Learn mode adds a slim guided-story panel above the hero with five numbered steps (a real sequence) and sentence-case copy; tiles keep their numbers and gain one plain line each ("Longest night: the longest stretch without any sunlight; batteries must last this long").

## Global Constraints

- Validation numbers come from the pipeline, never typed by hand: `validate` writes `data/validation/horizons.json`, `mazarico.json`, `backcasts.json`; the web only reads them.
- Horizons cross-check target: |Δel| < 0.01° and |Δaz·cos el| < 0.01° over every fixture row (currently 300 rows, worst 2.7e-5°). The live re-check compares 8 epochs per site through `/api/horizons` with a 12 s timeout and falls back to the stored table.
- Mazarico agreement: our sunlit fraction is the mean over 2024-01-01 → 2036-12-31 (hourly) of `sunFraction > 0`; the map value is the bilinear sample of `avgvisib_85s_060m_201608`; report the difference in percentage points for every site the map covers (lat ≤ −85°); expected within 10 points, Shackleton centre 0 % on both.
- Backcasts: for each site with `landed_utc`, compute the first hour after landing with `sunFraction === 0` (local sunset) and the first sunlit hour after it (sunrise), using the site's mask (Blue Ghost, a mare site without LOLA polar coverage, uses a flat 0° skyline); store `mission_end_utc` and its source in the catalogue; report predicted sunset minus reported end in hours.
- Reported mission ends (sources in `docs/data-credits.md`): IM-1 2024-02-29T00:00:00Z (Intuitive Machines: final transmission on Feb 29 as the lunar night began; hour unknown, use 00:00 and say so), IM-2 2025-03-07T12:00:00Z (mission declared over on Mar 7, batteries depleted on its side in a crater; hour unknown), Blue Ghost M1 2025-03-16T23:25:00Z (Firefly: mission end declared, about 5 h after local sunset).
- Brief: A4 portrait, one page at 100 % scale in Chrome's print preview; charts are the existing SVG components; no images beyond SVG; print stylesheet hides navigation and controls.
- Learn mode: hides "Both at once", "Lowest battery" and "Hours without full power"; keeps Sun, longest night, Earth, longest gap; help lines under each remaining tile; the guided story has exactly five steps and highlights nothing that needs WebGL.
- Tests: `npm test` and `uv run pytest -q` stay green; Playwright checks at 1360×900 for Validate and the brief (print preview via `page.pdf()`), Learn mode on Explore.

## Review Focus

1. **Horizons API unreachable or slow** (venue Wi-Fi): the re-check button reports the failure within the timeout and leaves the stored table; no unhandled rejection. Pinned by Task 4 `re-check falls back to the stored table when the API fails`.
2. **A site with no mask file in backcasts** (Blue Ghost, mare): the flat-skyline path is used, never a 404. Pinned by Task 2 `backcast for a non-polar site uses a flat skyline`.
3. **Mazarico map sample off-grid** (a site north of 85°S): the site is listed as "not covered", not as 0 %. Pinned by Task 2 `mazarico rows skip uncovered sites`.
4. **Brief with a custom site** (no featured name, computed mask): the brief renders with the custom name and "computed in your browser" provenance. Pinned by Task 5 `brief renders a custom site`.
5. **Learn mode persisted then WebGL missing**: the story panel still renders, the 3D step says the terrain view needs WebGL. Pinned by Task 6 `guided story renders without WebGL`.

---

### Task 1: Catalogue mission ends and data credits

**Files:**
- Modify: `data/sites.json` (`mission_end_utc`, `mission_end_source` for the three landed missions)
- Modify: `pipeline/lunar_pipeline/sites.py` (dataclass fields `mission_end_utc: str | None = None`, `mission_end_source: str | None = None`)
- Modify: `pipeline/tests/test_sites.py`
- Modify: `web/src/lib/data/loaders.ts` (`Site.mission_end_utc?`, `Site.mission_end_source?`)
- Modify: `docs/data-credits.md`

- [ ] **Step 1: Failing test**

```python
def test_landed_missions_carry_reported_ends():
    sites = {s.id: s for s in load_sites()}
    for sid in ("im1_odysseus", "im2_athena", "blue_ghost_m1"):
        s = sites[sid]
        assert s.landed_utc and s.mission_end_utc and s.mission_end_source
        assert s.mission_end_utc > s.landed_utc
    assert sites["blue_ghost_m1"].mission_end_utc == "2025-03-16T23:25:00Z"
```

- [ ] **Step 2: Run** `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest -q tests/test_sites.py -k mission_end` → FAIL (`TypeError` on the dataclass or missing fields).

- [ ] **Step 3: Implement** — add the two dataclass fields (after `approximate`), the JSON fields:
  - im1_odysseus: `"mission_end_utc": "2024-02-29T00:00:00Z", "mission_end_source": "Intuitive Machines, IM-1 mission update 29 Feb 2024: final transmission as the lunar night began (hour not published)"`
  - im2_athena: `"mission_end_utc": "2025-03-07T12:00:00Z", "mission_end_source": "Intuitive Machines / NASA release 7 Mar 2025: mission concluded, batteries depleted with the lander on its side in a crater (hour not published)"`
  - blue_ghost_m1: `"mission_end_utc": "2025-03-16T23:25:00Z", "mission_end_source": "Firefly Aerospace, Blue Ghost Mission 1 update 16 Mar 2025: mission concluded about 5 h after lunar sunset"`
  and the web `Site` type. Append the three sources to `docs/data-credits.md` under "Mission backcasts".

- [ ] **Step 4: Run** the site tests → PASS. `uv run python -m lunar_pipeline.cli sync-local`.

- [ ] **Step 5: Commit** `feat(data): reported mission ends for the landed CLPS missions`.

---

### Task 2: Pipeline `validate` command (Horizons rows, Mazarico agreement, backcasts)

**Files:**
- Create: `pipeline/lunar_pipeline/validate.py`, `pipeline/tests/test_validate.py`
- Modify: `pipeline/lunar_pipeline/cli.py` (`validate` subcommand), `pipeline/lunar_pipeline/sync_local.py` (`SMALL_DIRS` gains `"validation"`), `pipeline/tests/test_cli.py`
- Create: `data/validation/horizons.json`, `mazarico.json`, `backcasts.json` (generated)

**Interfaces:**
- Produces JSON shapes the web reads:
```json
horizons.json: { "generated_utc", "n_rows", "max_abs_delta_el_deg", "max_abs_delta_az_cos_el_deg",
                 "sites": [{ "site_id", "name", "lat", "lon", "body", "query_url", "n_rows", "max_abs_delta_el_deg", "max_abs_delta_az_cos_el_deg",
                             "rows": [{ "utc", "az_jpl", "el_jpl", "az_ours", "el_ours" }] }] }
mazarico.json: { "generated_utc", "period": ["2024-01-01T00:00:00", "2036-12-31T23:00:00"], "product": "avgvisib_85s_060m_201608",
                 "rows": [{ "site_id", "name", "lat", "lon", "covered": true, "ours_fraction", "map_fraction", "delta_points" }] }
backcasts.json: { "generated_utc", "rows": [{ "site_id", "name", "landed_utc", "mission_end_utc", "mission_end_source", "skyline": "lola" | "flat",
                                              "sun_el_at_landing_deg", "sunset_utc", "sunrise_utc", "daylight_hours_after_landing", "end_minus_sunset_h" }] }
```
- Consumes: `horizons.compare_all` logic (reuse `interp_vectors`, `azel_from_body_vectors`), `illumination.hourly_series`, `mazarico_fraction`, `LolaGrid.covers`.

- [ ] **Step 1: Failing tests** (`tests/test_validate.py`)

```python
import numpy as np
import pytest

from lunar_pipeline import validate as va
from tests.conftest import needs_illum, needs_kernels


def test_sunset_sunrise_from_flags():
    # hours 0-4 lit, 5-9 dark, 10-12 lit
    lit = np.array([1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1], dtype=bool)
    assert va.first_transition(lit, start=0, to_dark=True) == 5
    assert va.first_transition(lit, start=5, to_dark=False) == 10
    assert va.first_transition(np.ones(4, dtype=bool), start=0, to_dark=True) is None


def test_backcast_for_a_non_polar_site_uses_a_flat_skyline():
    row = va.backcast_row_for("blue_ghost_m1")
    assert row["skyline"] == "flat"
    assert row["sunset_utc"].startswith("2025-03-1")  # sunset mid-March 2025
    assert 300 < row["daylight_hours_after_landing"] < 360
    assert abs(row["end_minus_sunset_h"]) < 12


@pytest.mark.data
@needs_kernels
def test_backcast_im1_matches_the_reported_end_within_a_day():
    row = va.backcast_row_for("im1_odysseus")
    assert row["skyline"] == "lola"
    assert abs(row["end_minus_sunset_h"]) < 36


@pytest.mark.data
@needs_illum
def test_mazarico_rows_skip_uncovered_sites():
    rows = va.mazarico_rows(days=30)
    by_id = {r["site_id"]: r for r in rows}
    assert by_id["im1_odysseus"]["covered"] is False and "map_fraction" not in by_id["im1_odysseus"]
    assert by_id["shackleton_center"]["covered"] is True
    assert by_id["shackleton_center"]["map_fraction"] < 0.02
```
(`first_transition` is pure; `backcast_row_for` needs the committed ephemeris table and SPICE kernels for `utc_to_et` (`hourly_series` opens `spice_kernels()` itself), so mark the flat-skyline backcast test `@pytest.mark.data` + `@needs_kernels` too.)

- [ ] **Step 2: Run** → FAIL (`ModuleNotFoundError: lunar_pipeline.validate`).

- [ ] **Step 3: Implement `validate.py`**

```python
"""Validation artifacts: Horizons cross-check rows, Mazarico map agreement, CLPS mission backcasts."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from . import config
from .ephemeris import interp_vectors, load_table
from .geometry import azel_from_body_vectors
from .illumination import hourly_series, mazarico_fraction
from .lola import LolaGrid
from .masks import load_mask
from .sites import all_sites
from .spice_env import spice_kernels, utc_to_et

OUT_DIR = config.DATA_DIR / "validation"
FULL_START = "2024-01-01T00:00:00"
FULL_HOURS = 113_976 - 8  # whole table minus the interpolation guard rows


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def horizons_doc(fixtures_dir: Path = config.DATA_DIR / "fixtures" / "horizons") -> dict:
    table, header = load_table()
    names = {s.id: s.name for s in all_sites()}
    sites, worst_el, worst_az, n = [], 0.0, 0.0, 0
    with spice_kernels():
        for path in sorted(fixtures_dir.glob("*_sun.json")) + sorted(fixtures_dir.glob("*_earth.json")):
            doc = json.loads(path.read_text())
            idx = 0 if doc["body"] == "SUN" else 1
            rows, d_el, d_az = [], 0.0, 0.0
            for r in doc["rows"]:
                vec = interp_vectors(table, header["t0_et"], header["step_s"], utc_to_et(r["utc"]))[idx]
                az, el = azel_from_body_vectors(vec, doc["lat"], doc["lon"], 0.0)
                az, el = float(az), float(el)
                daz = (az - r["az"] + 180.0) % 360.0 - 180.0
                d_az = max(d_az, abs(daz * np.cos(np.radians(r["el"]))))
                d_el = max(d_el, abs(el - r["el"]))
                rows.append({"utc": r["utc"], "az_jpl": r["az"], "el_jpl": r["el"], "az_ours": round(az, 6), "el_ours": round(el, 6)})
            n += len(rows)
            worst_el, worst_az = max(worst_el, d_el), max(worst_az, d_az)
            sites.append({"site_id": doc["site_id"], "name": names.get(doc["site_id"], doc["site_id"]), "lat": doc["lat"], "lon": doc["lon"],
                          "body": doc["body"], "query_url": doc["query_url"], "n_rows": len(rows),
                          "max_abs_delta_el_deg": d_el, "max_abs_delta_az_cos_el_deg": d_az, "rows": rows})
    return {"generated_utc": _now(), "n_rows": n, "max_abs_delta_el_deg": worst_el, "max_abs_delta_az_cos_el_deg": worst_az, "sites": sites}


def mazarico_rows(days: int | None = None, product: str = "avgvisib_85s_060m_201608") -> list[dict]:
    table, header = load_table()
    grid = LolaGrid.from_pds(config.ILLUM_DIR / f"{product}.lbl")
    hours = FULL_HOURS if days is None else days * 24
    rows = []
    for site in all_sites():
        if not site.polar:
            continue
        row = {"site_id": site.id, "name": site.name, "lat": site.lat, "lon": site.lon, "covered": bool(grid.covers(site.lat, site.lon))}
        if row["covered"]:
            series = hourly_series(site, load_mask(site.id), table, header, FULL_START, hours)
            ours = float(np.mean(np.asarray(series["sun_fraction"]) > 0.0))
            mapv = float(grid.value_at(site.lat, site.lon))
            row.update({"ours_fraction": ours, "map_fraction": mapv, "delta_points": (ours - mapv) * 100.0})
        rows.append(row)
    return rows


def first_transition(lit: np.ndarray, start: int, to_dark: bool) -> int | None:
    """Index of the first hour at or after `start` where `lit` becomes False (to_dark) or True (not to_dark)."""
    flags = np.asarray(lit, dtype=bool)
    for h in range(max(0, start), flags.size):
        if flags[h] != to_dark:  # lit == not to_dark → the transition we look for
            return h
    return None


def backcast_row_for(site_id: str, days: int = 45) -> dict:
    site = next(s for s in all_sites() if s.id == site_id)
    if not site.landed_utc:
        raise ValueError(f"{site_id} has no landed_utc")
    table, header = load_table()
    mask_path = config.DATA_DIR / "masks" / f"{site_id}.json"
    skyline = "lola" if mask_path.exists() else "flat"
    mask = load_mask(site_id) if skyline == "lola" else np.zeros(720)
    landed = site.landed_utc.replace("Z", "")
    start = landed[:13] + ":00:00"  # snap to the hour containing the landing
    series = hourly_series(site, mask, table, header, start, days * 24)
    lit = np.asarray(series["sun_fraction"]) > 0.0
    sunset_h = first_transition(lit, 0, to_dark=True)
    sunrise_h = first_transition(lit, sunset_h if sunset_h is not None else 0, to_dark=False)
    t0 = datetime.fromisoformat(start)
    iso = lambda h: (t0 + timedelta(hours=int(h))).strftime("%Y-%m-%dT%H:%M:%SZ") if h is not None else None
    end = datetime.fromisoformat(site.mission_end_utc.replace("Z", "")) if site.mission_end_utc else None
    end_minus_sunset = ((end - (t0 + timedelta(hours=int(sunset_h)))).total_seconds() / 3600.0) if (end and sunset_h is not None) else None
    return {
        "site_id": site.id, "name": site.name, "landed_utc": site.landed_utc, "mission_end_utc": site.mission_end_utc,
        "mission_end_source": site.mission_end_source, "skyline": skyline,
        "sun_el_at_landing_deg": float(series["sun_el"][0]), "sunset_utc": iso(sunset_h), "sunrise_utc": iso(sunrise_h),
        "daylight_hours_after_landing": int(sunset_h) if sunset_h is not None else None,
        "end_minus_sunset_h": end_minus_sunset,
    }


def backcasts_doc() -> dict:
    return {"generated_utc": _now(), "rows": [backcast_row_for(s.id) for s in all_sites() if s.landed_utc]}


def write_all(out_dir: Path = OUT_DIR) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    docs = {
        "horizons.json": horizons_doc(),
        "mazarico.json": {"generated_utc": _now(), "period": [FULL_START, "2036-12-31T23:00:00"], "product": "avgvisib_85s_060m_201608", "rows": mazarico_rows()},
        "backcasts.json": backcasts_doc(),
    }
    paths = []
    for name, doc in docs.items():
        p = out_dir / name
        p.write_text(json.dumps(doc, indent=1) + "\n")
        paths.append(p)
    return paths
```
`cli.py`: `sub.add_parser("validate", help="write validation tables (Horizons, Mazarico, backcasts) into data/validation")` → `from .validate import write_all; for p in write_all(): print(p)`; add `"validate"` to the `test_cli.py` list. `sync_local.SMALL_DIRS = ["ephemeris", "masks", "fixtures", "validation"]`.

- [ ] **Step 4: Run** `uv run pytest -q tests/test_validate.py tests/test_cli.py` → PASS; then `uv run python -m lunar_pipeline.cli validate && uv run python -m lunar_pipeline.cli sync-local`. Expected: three files; print `backcasts.json` and check IM-1 sunset ≈ 2024-02-29, Blue Ghost sunset ≈ 2025-03-16 18:00 UTC (±3 h), IM-2 sunset ≈ 2025-03-17..20 (the lander died long before it). Mazarico deltas within 10 points for the covered sites (record the worst in the ledger).

- [ ] **Step 5: Commit** `feat(pipeline): validate command with Horizons rows, Mazarico agreement and CLPS backcasts`.

---

### Task 3: Web loaders and Horizons route handler

**Files:**
- Create: `web/src/lib/data/validation.ts`, `web/src/lib/data/validation.test.ts`
- Create: `web/src/lib/horizons/query.ts`, `web/src/lib/horizons/query.test.ts` (URL builder + CSV parser ported from Python)
- Create: `web/src/app/api/horizons/route.ts`, `web/src/app/api/horizons/route.test.ts`

**Interfaces:**
```ts
export interface HorizonsDoc {...as JSON above...}; export interface MazaricoDoc; export interface BackcastsDoc
export async function loadValidation(base: string): Promise<{ horizons: HorizonsDoc; mazarico: MazaricoDoc; backcasts: BackcastsDoc }>
export function horizonsUrl(lat, lon, altKm, bodyId: 10 | 399, startUtc, stopUtc, step: string): string   // same params as Python
export function parseHorizonsCsv(text: string): { utc: string; az: number; el: number }[]
// GET /api/horizons?lat=&lon=&body=SUN|EARTH&start=&stop=&step=  → { rows } | { error } (status 502/504); 12 s timeout via AbortController
```

- [ ] **Step 1: Failing tests** — `query.test.ts`: `horizonsUrl` reproduces the fixture's `query_url` for `im1_odysseus_sun.json` byte for byte (read the fixture, rebuild with its lat/lon/start/stop/step `30d`); `parseHorizonsCsv` parses a small `$$SOE … $$EOE` sample (three rows, with the `*m` daylight markers Horizons emits) into `{utc, az, el}` and throws without `$$SOE`. `route.test.ts`: call the handler's `GET` with a `Request` whose fetch is stubbed (`vi.stubGlobal('fetch', …)`) to return a Horizons JSON body → rows; stub a rejection → status 502 and `{ error }`; missing params → 400.

- [ ] **Step 2: Run** → FAIL (modules missing).

- [ ] **Step 3: Implement** the URL builder with `URLSearchParams` in the same order as Python (`format, COMMAND, OBJ_DATA, MAKE_EPHEM, EPHEM_TYPE, CENTER, COORD_TYPE, SITE_COORD, START_TIME, STOP_TIME, STEP_SIZE, QUANTITIES, APPARENT, CSV_FORMAT, TIME_TYPE`; `urlencode` quotes `'` as `%27`, `@` as `%40`, `,` as `%2C` — use `encodeURIComponent` and compare against the fixture), the parser (regex `^\s*(\d{4}-[A-Za-z]{3}-\d{2} \d{2}:\d{2})`, last two numeric fields are az, el; month names → numbers), and the route handler (`export const dynamic = 'force-dynamic'`; validate params; `fetch(url, { signal: AbortSignal.timeout(12000) })`; map errors to 502/504 with a message).

- [ ] **Step 4: Run** tests → PASS; `npx tsc --noEmit`.

- [ ] **Step 5: Commit** `feat(web): validation loaders and a Horizons proxy route with a 12 s timeout`.

---

### Task 4: Validate page

**Files:**
- Create: `web/src/components/ValidateView.tsx`, `web/src/components/ValidateView.test.tsx`, `web/src/app/validate/page.tsx`
- Create: `web/src/lib/horizons/recheck.ts`, `web/src/lib/horizons/recheck.test.ts`
- Modify: `web/src/components/AppFrame.tsx` (nav entry "Validate", ready)

**Interfaces:**
```ts
export async function recheckSite(site: { lat; lon }, body: 'SUN' | 'EARTH', epochsUtc: string[], eph: Ephemeris, fetchImpl = fetch): Promise<{ ok: true; worstEl: number; worstAzCosEl: number; n: number; ms: number } | { ok: false; message: string }>
```
`recheckSite` asks `/api/horizons` for one call spanning `start`..`stop` with `STEP_SIZE='7'` (Horizons treats a bare integer as the number of intervals, giving 8 epochs) and compares each row against `azElFromBodyVector` on `interpVectors(eph, utcToEt(row.utc))` (both exist in `engine/`).

- [ ] **Step 1: Failing tests** — `recheck.test.ts`: with a stub fetch returning rows equal to our own az/el (computed in the test from the ephemeris), `ok` with worst < 1e-6; with a stub that rejects, `{ ok: false, message }` and no throw (Review Focus 1). `ValidateView.test.tsx` (jsdom, loaders injected): renders the three tables with headings "Do we point where JPL points?", "Do we light what LOLA lights?", "Did the landers die when the Sun set?", the verdict lines (worst Δ from the doc, worst Mazarico delta, backcast rows with `end_minus_sunset_h` formatted as "+5.4 h"), rows with `covered: false` show "not covered by the 85°S map", and the re-check button shows the fallback message when the injected recheck rejects.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — `ValidateView` loads `loadValidation(dataBase())` (props allow injection: `load`, `recheck`), renders three `<section>`s with `<table>`s (Horizons: one row per site×body with n rows, worst Δel, worst Δaz·cos el, a "JPL query" link; expandable rows optional — skip), Mazarico (site, ours %, map %, Δ points, or "not covered"), backcasts (mission, landed, predicted sunset, reported end, Δ h, skyline source). Verdict lines: `Worst difference over ${n} rows: ${worst.toExponential(1)}°` etc. Method and error budget paragraph at the bottom (ephemeris < 0.01°; mask 0.05–0.15°; timing ±15–60 min). Test badge: read `/validation/tests.json` if present (`{ web: { files, tests }, pipeline: { tests }, generated_utc }`) else omit; add `web/scripts/test-summary.mjs` that runs `vitest run --reporter=json` and `pytest --collect-only -q` counts and writes `web/public/validation/tests.json` (committed), and an npm script `validation:tests`.

- [ ] **Step 4: Run** tests → PASS; `tsc`, lint.

- [ ] **Step 5: Commit** `feat(web): Validate page with Horizons re-check, Mazarico agreement and CLPS backcasts`.

---

### Task 5: Export brief (`/brief`)

**Files:**
- Create: `web/src/components/BriefView.tsx`, `web/src/components/BriefView.test.tsx`, `web/src/app/brief/page.tsx`
- Modify: `web/src/app/globals.css` (print stylesheet: `@media print { .no-print { display: none } @page { size: A4 portrait; margin: 12mm } body { background: white; color: black } }` plus light tokens under `.brief`)
- Modify: `web/src/components/ExploreView.tsx` and `CompareView.tsx` ("Export brief" link)

- [ ] **Step 1: Failing test** — `BriefView` with an injected store in the ready state renders: the site name as `<h1>`, the window line, six KPI values, the verdict chip, the timeline and sky-dome SVGs (`role="group"` / `role="img"`), the method paragraph, the credits list, a "Print or save as PDF" button that calls `window.print` (spied); for a custom site (applyMask in the test) the provenance line says "computed in your browser" (Review Focus 4).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — `BriefView` uses the same store (`init` on mount); layout `max-w-[190mm]` with light `.brief` tokens; sections: header (Earthrise brief, site, coordinates, window), verdict + KPI grid (3×2), `Timeline` (width 700, no interaction needed) and `SkyDome` (size 260) side by side, planner settings line, "How this was computed" (two sentences + error budget), "Data" (LOLA LDEM, DE440, Horizons, LROC colour map, site sources), footer with the generation date and the repo URL. Print via a button (`onClick={() => window.print()}`), hidden in print.

- [ ] **Step 4: Run** tests → PASS. Playwright: open `/brief`, `page.pdf({ format: 'A4' })` to `.playwright-mcp/brief.pdf`, check it is one page (pdf page count via the file size and a quick `pdfinfo`-free check: render `page.emulateMedia({ media: 'print' })` and screenshot).

- [ ] **Step 5: Commit** `feat(web): printable one-page mission brief`.

---

### Task 6: Learn mode

**Files:**
- Modify: `web/src/lib/store/explore.ts` (`audience: 'planner' | 'learn'`, `setAudience`, localStorage persistence guarded by `typeof window`), `explore.test.ts`
- Create: `web/src/components/GuidedStory.tsx`, `web/src/components/GuidedStory.test.tsx`
- Modify: `web/src/components/AppFrame.tsx` (Planner/Learn toggle in the header, `audience` from the store), `SummaryTiles.tsx` (`audience` prop: hide three tiles, show help lines), `ExploreView.tsx` (story panel above the hero in Learn mode), `web/src/app/learn/page.tsx` (redirects to `/explore` after setting Learn; or a short landing with the five steps and a "Start" link — choose the landing page so the nav entry has content)

- [ ] **Step 1: Failing tests** — store: `setAudience('learn')` persists to localStorage (jsdom) and `createExploreStore` reads it back; `SummaryTiles` in learn mode renders four tiles with help lines and no "Both at once"; `GuidedStory` renders five ordered steps with the current step highlighted and Next/Back; `ExploreView` in learn mode renders the story; without WebGL the 3D step copy mentions WebGL (Review Focus 5).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — steps (copy): 1 "Pick a landing site" (site picker), 2 "Drag through time" (scrubber: shadows and the Sun track move), 3 "Read the skyline" (dome: the grey rim is the terrain; the Sun must clear it), 4 "Count the night" (longest night tile: batteries must last this long), 5 "Compare and choose" (Add to compare, best window). Help lines: Sun above the skyline "share of hours with any sunlight on the panels"; Longest night "the longest stretch without sunlight; the battery must last this long"; Earth in view "share of hours a radio can see Earth directly"; Longest Earth gap "the longest silence without direct contact".

- [ ] **Step 4: Run** tests → PASS; Playwright: Learn toggle on Explore at 1360×900 (screenshot).

- [ ] **Step 5: Commit** `feat(web): Learn mode with a five-step guided story and plain-language tiles`.

---

### Task 7: Docs, gates and closeout

- Update `docs/method.md` (validation section pointing at `/validate` and the JSON files; error budget), `README.md` (routes: Validate, Brief, Learn), `web/README.md` (`validation:tests` script, `/api/horizons`).
- Gates: `uv run pytest -q`, `cd web && npm test && npx tsc --noEmit && npm run lint && npm run build`; restore `data/fixtures/horizons/summary.json` if pytest rewrote it.
- Commit `docs: validation, brief and Learn routes`. Then review-package, fresh reviewer, fix pass, PR against `feat/week4-compare-power`.
