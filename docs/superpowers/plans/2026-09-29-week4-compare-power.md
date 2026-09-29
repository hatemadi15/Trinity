# Week 4 — Compare, Best Window, Power Budget and Comms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Explore's numbers into decisions: a planner parameter panel (solar panel model, battery, load, minimum Earth elevation, mast height) with a "Survive the night" verdict, a best-window finder that snaps the date window to the best 14/30/90-day span in the next year, a Compare page for up to four sites over the same window and parameters, and a site catalogue that includes the nine Artemis III candidate landing regions with precomputed skylines.

**Architecture:** The Python pipeline gains a `power` module (reference implementation) and writes golden fixtures; the TypeScript engine gains `power.ts` (irradiance from the Sun distance and disk fraction, four panel geometries, hourly battery simulation) and comms helpers in `metrics.ts` (Earth visibility above a minimum elevation, contact windows, `sunAu` in the series). The single Zustand store owns planner parameters, the compare set and the best-window action so Explore and Compare stay in sync; masks for compare sites come from the existing mask cache or the loaders. The Compare page renders one column per site with a sparkline (the timeline's bins at small size), six KPIs and a verdict chip.

**Tech Stack:** unchanged (Next.js 16, React 19, zustand 5, vitest 5; Python 3.12 with numpy). No new dependencies, no downloads.

**Spec:** `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md` (sections 2 hero moment, 3 MVP "Compare 2–4 sites" and "Best-window finder", 3 differentiators "Power budget" and "Comms mask", 4 Compare screen, 5.3 metrics/power, 8 Week 4).

## Design plan (frontend-design)

Compare is a decision table, not a dashboard: one column per site, the same rows in every column, the verdict chip is the only coloured element besides the sparkline's Sun/Earth marks. Columns are `min-w-[260px]` panels in a horizontal scroll row (four fit at 1360 px). The verdict chip uses the existing status tokens (`--good`, `--bad`) with an icon glyph and text, never colour alone ("● Survives the window" / "▲ Battery empties after 5 d 3 h"). The planner panel is a collapsible aside on Explore and a sheet on Compare with plain labels and units in the label ("Panel area (m²)", "Battery (Wh)", "Load (W)"), no tooltips. The best-window control is a single button next to the window radios: "Best 30-day window from here"; after it runs, the start date input updates and the button's caption reads the score summary ("100 % sun, 91 % Earth, longest gap 21 h"). Copy: "Add to compare", "Compared sites (2)", "Remove", "Open in Explore".

## Global Constraints

- Solar constant 1361 W/m² at 1 AU; irradiance = 1361 / au² × sunFraction (the disk fraction already includes terrain occlusion and partial disk).
- Panel cosine factor (n·s, clamped at 0): `horizontal` → sin(el); `vertical` with fixed azimuth φ → cos(el) · cos(az − φ); `vertical_tracking` (turns to face the Sun's azimuth) → cos(el); `full_tracking` → 1. Power W = efficiency × area m² × irradiance × cosine.
- Battery: E0 = initialSocFraction × batteryWh; each hour E' = E + (P − loadW) × 1 h; if E' < 0 the hour is a brownout and E' = 0; E = min(E', batteryWh). `socMin` = min(E / batteryWh) after the update, `brownoutHours` = count, `firstBrownoutHour` = first index or null, `survives` = brownoutHours === 0, `meanPowerW`.
- Defaults (illustrative small lander): `vertical_tracking`, panelAzimuthDeg 0, 4 m², efficiency 0.30, load 200 W, battery 2000 Wh, initial SOC 1.0; minimum Earth elevation 0°, mast 2 m. Ranges in the panel: area 0.5–50, efficiency 0.05–0.45, load 10–2000, battery 100–50 000, SOC 0–1, min Earth elevation 0–10 (step 0.5), mast 0–10.
- Comms: Earth in view when `earthEl − mask(earthAz) > minEarthElDeg`; contact windows are maximal runs of visible hours as half-open `[start, end)` hour indexes.
- Best window: the existing `bestWindow` score (weights 1/1/1, step 6 h) over a scan of 365 days from the current start date, clamped so the scan and the window fit inside the ephemeris table; only sunlit start hours are candidates (fallback: all).
- Compare holds at most 4 site ids; the selected Explore site is always addable; custom sites are addable once computed (their masks live in the store cache).
- Mast height applies to the selected site only and recomputes its skyline through the worker (`computeMask(lat, lon, { mastM })`); compare columns use each site's cached mask.
- Featured masks stay at 720 azimuths; the Artemis III catalogue centres marked `approximate: true` say so in the Explore subtitle.
- Python stays the reference: every TypeScript number in `power.ts` and the comms helpers is pinned by a fixture written by the pipeline.
- Tests: `npm test` and `uv run pytest -q` stay green; visual checks via Playwright at 1360×900 for Explore (panel open) and Compare (4 columns).

## Review Focus

1. **Battery never charges (panel 0 m² or load above peak power)**: the verdict must say the battery empties at the first hour, `socMin` 0, no NaN, no infinite loop. Pinned by Task 3 `simulateBattery reports a brownout from the first hour when the load always exceeds the power`.
2. **Window longer than the scan remainder near the table end (start 2036-11-01, 90 days)**: `findBestWindow` clamps the scan and never throws `RangeError`; if no full window fits it returns null and the UI says so. Pinned by Task 4 `findBestWindow near the end of the ephemeris table returns null instead of throwing`.
3. **Compare with a custom site whose mask exists only in the cache**: the column renders from the cached mask without a fetch. Pinned by Task 4 `addToCompare accepts a computed custom site without a mask file`.
4. **Fifth site**: `addToCompare` ignores it and the UI disables the control at four. Pinned by Task 4 `addToCompare keeps at most four sites`.
5. **Minimum Earth elevation 10° at a rim site**: Earth visibility drops, longest gap grows, joint fraction never exceeds the smaller of the two fractions. Pinned by Task 2 `withCommsThreshold lowers Earth visibility monotonically`.

---

### Task 1: Site catalogue — Artemis III regions, masks and fixtures

**Files:**
- Modify: `data/sites.json`
- Modify: `pipeline/tests/test_sites.py`
- Modify: `pipeline/lunar_pipeline/sites.py` (dataclass gains `approximate: bool = False`)
- Modify: `web/src/lib/data/loaders.ts:4-12` (`Site` gains `approximate?: boolean; landed_utc?: string`)
- Modify: `web/src/components/SiteSelect.tsx:6-11` (group for `artemis3`)
- Modify: `web/src/components/ExploreView.tsx` (subtitle note for approximate centres)
- Create: `data/masks/<id>.json` for the 11 new polar sites (generated), `data/fixtures/metrics/nobile_rim_2_2025-01-01_730d.json` (generated)
- Modify: `docs/data-credits.md` (sources for the region centres)

**Interfaces:**
- Produces: site ids `peak_near_cabeus_b`, `haworth`, `malapert_massif`, `mons_mouton_plateau`, `mons_mouton`, `nobile_rim_1`, `nobile_rim_2`, `de_gerlache_rim_2`, `slater_plain` (category `artemis3`), `connecting_ridge`, `peak_near_shackleton` (category `classic`); `Site.approximate`.

- [ ] **Step 1: Write the failing catalogue test**

Append to `pipeline/tests/test_sites.py`:

```python
ARTEMIS_2024 = {
    "peak_near_cabeus_b", "haworth", "malapert_massif", "mons_mouton_plateau", "mons_mouton",
    "nobile_rim_1", "nobile_rim_2", "de_gerlache_rim_2", "slater_plain",
}


def test_artemis_iii_regions_are_catalogued():
    sites = {s.id: s for s in load_sites()}
    assert ARTEMIS_2024 <= set(sites)
    for sid in ARTEMIS_2024:
        s = sites[sid]
        assert s.category == "artemis3" and s.polar
        assert -89.0 <= s.lat <= -83.0
    assert sites["nobile_rim_2"].lat == pytest.approx(-84.20156) and sites["nobile_rim_2"].lon == pytest.approx(60.69989)
    assert sites["malapert_massif"].approximate is False
    assert sites["haworth"].approximate is True
    assert {"connecting_ridge", "peak_near_shackleton"} <= set(sites)
    assert sites["peak_near_shackleton"].lat == pytest.approx(-89.01701)
```

- [ ] **Step 2: Run it to see it fail**

Run: `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest -q tests/test_sites.py -k artemis`
Expected: FAIL with `AssertionError` (ids missing) or `TypeError: __init__() got an unexpected keyword argument 'approximate'`.

- [ ] **Step 3: Add `approximate` to the dataclass and the eleven sites**

In `pipeline/lunar_pipeline/sites.py` add `approximate: bool = False` after `derive_rim`. Replace the `sites` array in `data/sites.json` with the six existing entries plus:

```json
    {"id": "peak_near_cabeus_b", "name": "Peak near Cabeus B (Artemis III region)", "lat": -83.78, "lon": -68.72,
     "category": "artemis3", "polar": true, "approximate": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km"},
    {"id": "haworth", "name": "Haworth (Artemis III region)", "lat": -86.84, "lon": -22.59,
     "category": "artemis3", "polar": true, "approximate": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km"},
    {"id": "malapert_massif", "name": "Malapert Massif (Artemis III region)", "lat": -86.0, "lon": 0.0,
     "category": "artemis3", "polar": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; LROC featured image 1294 (86°S, 0°E)"},
    {"id": "mons_mouton_plateau", "name": "Mons Mouton Plateau (Artemis III region)", "lat": -84.46, "lon": 30.66,
     "category": "artemis3", "polar": true, "approximate": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km"},
    {"id": "mons_mouton", "name": "Mons Mouton (Artemis III region)", "lat": -85.53, "lon": 31.77,
     "category": "artemis3", "polar": true, "approximate": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km"},
    {"id": "nobile_rim_1", "name": "Nobile Rim 1 (Artemis III region)", "lat": -85.54, "lon": 37.39,
     "category": "artemis3", "polar": true, "approximate": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km"},
    {"id": "nobile_rim_2", "name": "Nobile Rim 2 (Artemis III region)", "lat": -84.20156, "lon": 60.69989,
     "category": "artemis3", "polar": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; optimal site DM2 from Sánchez-Lozano et al., LPSC 2025 abstract 1149"},
    {"id": "de_gerlache_rim_2", "name": "de Gerlache Rim 2 (Artemis III region)", "lat": -88.28, "lon": -64.31,
     "category": "artemis3", "polar": true, "approximate": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km"},
    {"id": "slater_plain", "name": "Slater Plain (Artemis III region)", "lat": -87.23, "lon": 125.37,
     "category": "artemis3", "polar": true, "approximate": true,
     "source": "NASA Artemis III candidate landing regions, 28 Oct 2024; centre digitised from NASA's region map, about ±5 km"},
    {"id": "connecting_ridge", "name": "Connecting Ridge (Shackleton–de Gerlache ridge)", "lat": -89.53432, "lon": -150.05233,
     "category": "classic", "polar": true,
     "source": "Gracy & Lee, LPSC 2024 abstract 1695 (candidate site 89.53432°S, 209.94767°E); Artemis III 2022 candidate region"},
    {"id": "peak_near_shackleton", "name": "Peak near Shackleton", "lat": -89.01701, "lon": 126.27302,
     "category": "classic", "polar": true,
     "source": "Gracy & Lee, LPSC 2024 abstract 1695 (candidate site 89.01701°S, 126.27302°E); Artemis III 2022 candidate region"}
```

(`sites.json` is committed; keep `"version": 1`.) The digitised centres come from NASA's October 2024 landing-region map, scaled with the two published points (Nobile Rim 2 and Malapert Massif); their boxes are 15–20 km wide, so ±5 km is within the region.

- [ ] **Step 4: Run the catalogue tests to see them pass**

Run: `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest -q tests/test_sites.py`
Expected: PASS (the validity test still accepts the categories; `polar == (lat <= -80)` holds).

- [ ] **Step 5: Generate the masks, the metrics fixture and sync**

Run (inside `pipeline/`):
```bash
uv run python -m lunar_pipeline.cli masks --site peak_near_cabeus_b --site haworth --site malapert_massif --site mons_mouton_plateau --site mons_mouton --site nobile_rim_1 --site nobile_rim_2 --site de_gerlache_rim_2 --site slater_plain --site connecting_ridge --site peak_near_shackleton
uv run python -m lunar_pipeline.cli fixture-metrics --site nobile_rim_2 --start 2025-01-01T00:00:00 --days 730
uv run python -m lunar_pipeline.cli sync-local
```
Expected: 11 files under `data/masks/`, each with 720 `elevation_deg` values and a `site_height_m`; the fixture file under `data/fixtures/metrics/`; `web/public/data/sites.json` and masks updated. Spot check: `python -c "import json;d=json.load(open('../data/masks/nobile_rim_2.json'));print(d['site_height_m'], max(d['elevation_deg']), min(d['elevation_deg']))"` → height around 0 to 1000 m, max elevation under 15°, min above −5°.

- [ ] **Step 6: Web catalogue types and picker group**

`web/src/lib/data/loaders.ts` `Site`:
```ts
export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
  polar: boolean;
  source: string;
  /** True when the coordinate is a digitised region centre, not a surveyed point. */
  approximate?: boolean;
  landed_utc?: string;
}
```
`SiteSelect.tsx` `GROUPS`:
```ts
const GROUPS: [string, string][] = [
  ['artemis3', 'Artemis III candidate regions (2024)'],
  ['classic', 'Classic south-pole sites'],
  ['clps_landed', 'CLPS landings'],
  ['reference', 'Reference'],
  ['custom', 'Custom'],
];
```
`ExploreView.tsx` subtitle: after the site height, append `{s.site.approximate ? '; region centre digitised from NASA\'s map (about ±5 km)' : ''}`.

Add to `web/src/lib/engine/metrics.test.ts` parity list: `'nobile_rim_2_2025-01-01_730d.json'`.

- [ ] **Step 7: Run the web suite**

Run: `cd web && npx vitest run src/lib/engine/metrics.test.ts src/components`
Expected: PASS, including the new parity file.

- [ ] **Step 8: Data credits and commit**

Append to `docs/data-credits.md` a "Site catalogue" section listing: NASA release "NASA Provides Update on Artemis III Moon Landing Regions" (28 Oct 2024); Sánchez-Lozano, Peña-Asensio, Neira-Acosta, LPSC 2025 abstract 1149 (Nobile Rim 2 optimal site); Gracy & Lee, LPSC 2024 abstract 1695 (Connecting Ridge and Peak near Shackleton sites); LROC featured image 1294 (Malapert Massif); the digitising note.

```bash
git add data/sites.json data/masks data/fixtures/metrics pipeline web/src docs/data-credits.md
git commit -m "feat(data): Artemis III candidate regions and classic ridge sites with precomputed skylines"
```

---

### Task 2: Engine — Sun distance in the series, comms threshold, contact windows (TS + Python)

**Files:**
- Modify: `web/src/lib/engine/metrics.ts` (`Series.sunAu`, `withCommsThreshold`, `contactWindows`)
- Modify: `web/src/lib/engine/metrics.test.ts`
- Modify: `pipeline/lunar_pipeline/illumination.py` (`sun_au`, `min_el_deg`, `contact_windows`)
- Modify: `pipeline/lunar_pipeline/fixtures.py` (`sun_au` samples), `pipeline/lunar_pipeline/config.py` (`AU_KM` if absent)
- Modify: `pipeline/tests/test_illumination.py`
- Regenerate: `data/fixtures/metrics/*.json` (three files)

**Interfaces:**
- Produces:
```ts
export interface Series { i0; hours; sunAz; sunEl; earthAz; earthEl; sunFraction; earthVisible; sunAu: Float64Array }
export function withCommsThreshold(series: Series, mask: ArrayLike<number>, minElDeg: number): Series
export interface ContactWindow { start: number; end: number }  // [start, end) hours
export function contactWindows(series: Series): ContactWindow[]
```
- Consumes: nothing new.

- [ ] **Step 1: Failing TS tests**

Add to `metrics.test.ts` (inside `describe('metrics primitives')`):

```ts
  it('withCommsThreshold lowers Earth visibility monotonically and keeps the rest of the series', () => {
    const hours = 200;
    const mask = new Float64Array(720).fill(2); // flat 2° skyline
    const earthEl = new Float64Array(hours);
    for (let h = 0; h < hours; h++) earthEl[h] = -3 + (h / hours) * 16; // −3° → +13°
    const base: Series = {
      i0: 0, hours, sunAz: new Float64Array(hours), sunEl: new Float64Array(hours), earthAz: new Float64Array(hours), earthEl,
      sunFraction: new Float64Array(hours).fill(1), earthVisible: new Uint8Array(hours), sunAu: new Float64Array(hours).fill(1),
    };
    const at0 = withCommsThreshold(base, mask, 0);
    const at5 = withCommsThreshold(base, mask, 5);
    const at10 = withCommsThreshold(base, mask, 10);
    const vis = (s: Series) => s.earthVisible.reduce((a, b) => a + b, 0);
    expect(vis(at0)).toBeGreaterThan(vis(at5));
    expect(vis(at5)).toBeGreaterThan(vis(at10));
    // el − 2 > 0 from h where el > 2: (2 + 3) / 16 × 200 = 62.5 → 63 hours excluded
    expect(vis(at0)).toBe(hours - 63);
    expect(at5.sunFraction).toBe(base.sunFraction); // untouched arrays are shared
    expect(summarize(at10).jointFraction).toBeLessThanOrEqual(Math.min(summarize(at10).illumFraction, summarize(at10).earthVisFraction));
  });
  it('contactWindows lists half-open runs of visible hours', () => {
    const s = { ...emptySeries(10), earthVisible: Uint8Array.from([0, 1, 1, 0, 0, 1, 0, 1, 1, 1]) };
    expect(contactWindows(s)).toEqual([{ start: 1, end: 3 }, { start: 5, end: 6 }, { start: 7, end: 10 }]);
    expect(contactWindows({ ...emptySeries(3), earthVisible: new Uint8Array(3) })).toEqual([]);
  });
```
with a helper at the top of the file:
```ts
function emptySeries(hours: number): Series {
  return {
    i0: 0, hours, sunAz: new Float64Array(hours), sunEl: new Float64Array(hours), earthAz: new Float64Array(hours), earthEl: new Float64Array(hours),
    sunFraction: new Float64Array(hours), earthVisible: new Uint8Array(hours), sunAu: new Float64Array(hours).fill(1),
  };
}
```
Update the existing synthetic `summarize` test's series literal to include `sunAu: new Float64Array(100).fill(1)`. Extend the `Fixture` type with `samples: Record<'sun_az' | 'sun_el' | 'earth_az' | 'earth_el' | 'sun_fraction' | 'sun_au', number[]>` and add `expect(series.sunAu[i]).toBeCloseTo(fx.samples.sun_au[k], 9);` in the parity loop.

- [ ] **Step 2: Run to see them fail**

Run: `cd web && npx vitest run src/lib/engine/metrics.test.ts`
Expected: FAIL — `withCommsThreshold is not a function`, type errors on `sunAu`.

- [ ] **Step 3: Implement in `metrics.ts`**

```ts
export interface Series {
  i0: number;
  hours: number;
  sunAz: Float64Array;
  sunEl: Float64Array;
  earthAz: Float64Array;
  earthEl: Float64Array;
  sunFraction: Float64Array;
  earthVisible: Uint8Array;
  /** Sun distance in AU per hour (irradiance scales with 1/au²). */
  sunAu: Float64Array;
}
```
In `hourlySeries` allocate `const sunAu = new Float64Array(hours);`, set `sunAu[h] = dist / AU_KM;` (import `AU_KM` from `./constants`) and return it.

```ts
/** Same series with Earth visibility re-evaluated against a minimum elevation above the skyline (comms mask). */
export function withCommsThreshold(series: Series, mask: ArrayLike<number>, minElDeg: number): Series {
  const earthVisible = new Uint8Array(series.hours);
  for (let h = 0; h < series.hours; h++) {
    earthVisible[h] = series.earthEl[h] - maskAtAzimuth(mask, series.earthAz[h]) > minElDeg ? 1 : 0;
  }
  return { ...series, earthVisible };
}

export interface ContactWindow {
  start: number;
  end: number;
}

/** Maximal runs of Earth-visible hours as half-open [start, end) hour indexes. */
export function contactWindows(series: Series): ContactWindow[] {
  const out: ContactWindow[] = [];
  let start = -1;
  for (let h = 0; h < series.hours; h++) {
    const v = series.earthVisible[h] === 1;
    if (v && start < 0) start = h;
    if (!v && start >= 0) {
      out.push({ start, end: h });
      start = -1;
    }
  }
  if (start >= 0) out.push({ start, end: series.hours });
  return out;
}
```

- [ ] **Step 4: Python mirror and fixture regeneration**

`config.py` already has `AU_KM`. `illumination.py`:
```python
def hourly_series(site, mask, table, header, start_utc, hours, min_el_deg: float = 0.0) -> dict:
    ...
    sun_dist = np.linalg.norm(rows[:, 0, :], axis=1)
    sun_fraction = disk_fraction(sun_el - mask_at_azimuth(mask, sun_az), sun_radius_deg(sun_dist))
    earth_visible = (earth_el - mask_at_azimuth(mask, earth_az)) > min_el_deg
    return {
        "utc_index": np.arange(hours) + i0,
        "sun_az": sun_az, "sun_el": sun_el, "earth_az": earth_az, "earth_el": earth_el,
        "sun_fraction": sun_fraction, "earth_visible": earth_visible, "sun_au": sun_dist / config.AU_KM,
    }


def contact_windows(earth_visible) -> list[tuple[int, int]]:
    flags = np.asarray(earth_visible, dtype=bool)
    out, start = [], -1
    for h, v in enumerate(flags):
        if v and start < 0:
            start = h
        if not v and start >= 0:
            out.append((start, h))
            start = -1
    if start >= 0:
        out.append((start, int(flags.size)))
    return out
```
`fixtures.py` `metrics_fixture`: sample keys become `("sun_az", "sun_el", "earth_az", "earth_el", "sun_fraction", "sun_au")`.

Tests in `test_illumination.py`:
```python
def test_contact_windows_half_open_runs():
    assert il.contact_windows([0, 1, 1, 0, 0, 1, 0, 1, 1, 1]) == [(1, 3), (5, 6), (7, 10)]
    assert il.contact_windows(np.zeros(3, dtype=bool)) == []


@pytest.mark.data
@needs_kernels
def test_min_el_threshold_reduces_visibility_and_sun_au_is_near_one():
    table, header = il.load_table()
    site = next(s for s in il.all_sites() if s.id == "shackleton_center_rim_high")
    mask = il.load_mask(site.id)
    base = il.hourly_series(site, mask, table, header, "2025-01-01T00:00:00", 24 * 60)
    strict = il.hourly_series(site, mask, table, header, "2025-01-01T00:00:00", 24 * 60, min_el_deg=5.0)
    assert strict["earth_visible"].sum() < base["earth_visible"].sum()
    assert 0.98 < base["sun_au"].min() < base["sun_au"].max() < 1.02
```
Run inside `pipeline/`:
```bash
uv run pytest -q tests/test_illumination.py
uv run python -m lunar_pipeline.cli fixture-metrics --site shackleton_center_rim_high --start 2025-01-01T00:00:00 --days 730
uv run python -m lunar_pipeline.cli fixture-metrics --site im1_odysseus --start 2025-01-01T00:00:00 --days 730
uv run python -m lunar_pipeline.cli fixture-metrics --site nobile_rim_2 --start 2025-01-01T00:00:00 --days 730
uv run python -m lunar_pipeline.cli sync-local
```
Expected: pytest PASS; three fixtures now carry `sun_au` samples.

- [ ] **Step 5: Run the TS tests to see them pass**

Run: `cd web && npx vitest run src/lib/engine`
Expected: PASS (parity within 1e-9 on `sun_au`).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/engine pipeline data/fixtures/metrics
git commit -m "feat(engine): Sun distance in the series, comms elevation threshold and contact windows with Python parity"
```

---

### Task 3: Engine — power budget and battery (TS + Python reference + fixtures)

**Files:**
- Create: `web/src/lib/engine/power.ts`, `web/src/lib/engine/power.test.ts`
- Create: `pipeline/lunar_pipeline/power.py`, `pipeline/tests/test_power.py`
- Modify: `pipeline/lunar_pipeline/fixtures.py` (`write_power_fixture`), `pipeline/lunar_pipeline/cli.py` (`fixture-power`)
- Create: `data/fixtures/power/*.json` (generated)
- Modify: `web/src/lib/engine/index.ts` (`export * from './power'`)

**Interfaces:**
- Produces:
```ts
export type PanelModel = 'horizontal' | 'vertical' | 'vertical_tracking' | 'full_tracking';
export interface PowerConfig { panel: PanelModel; panelAzimuthDeg: number; areaM2: number; efficiency: number; loadW: number; batteryWh: number; initialSocFraction: number }
export const DEFAULT_POWER: PowerConfig
export const SOLAR_CONSTANT_WM2 = 1361
export function panelCosine(panel: PanelModel, panelAzimuthDeg: number, sunAzDeg: number, sunElDeg: number): number
export function irradianceWm2(sunAu: number, sunFraction: number): number
export function powerSeries(series: Series, cfg: PowerConfig): Float64Array
export interface PowerResult { powerW: Float64Array; energyWh: Float64Array; socMin: number; brownoutHours: number; firstBrownoutHour: number | null; survives: boolean; meanPowerW: number }
export function simulateBattery(powerW: Float64Array, cfg: PowerConfig, dtH?: number): PowerResult
export function powerBudget(series: Series, cfg: PowerConfig): PowerResult
```

- [ ] **Step 1: Failing TS tests (`power.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from './ephemeris';
import { hourlySeries, type Series } from './metrics';
import { DEFAULT_POWER, irradianceWm2, panelCosine, powerBudget, powerSeries, simulateBattery, SOLAR_CONSTANT_WM2, type PowerConfig } from './power';
import { utcToEt } from './time';
import { readBytes, readJson } from './__tests__/helpers';

const D2R = Math.PI / 180;

function series(hours: number, sunAz: number, sunEl: number, sunFraction = 1): Series {
  return {
    i0: 0, hours, sunAz: new Float64Array(hours).fill(sunAz), sunEl: new Float64Array(hours).fill(sunEl),
    earthAz: new Float64Array(hours), earthEl: new Float64Array(hours), sunFraction: new Float64Array(hours).fill(sunFraction),
    earthVisible: new Uint8Array(hours), sunAu: new Float64Array(hours).fill(1),
  };
}

describe('panel geometry and irradiance', () => {
  it('cosine factors for the four panel models', () => {
    expect(panelCosine('horizontal', 0, 90, 30)).toBeCloseTo(Math.sin(30 * D2R), 12);
    expect(panelCosine('vertical', 45, 45, 10)).toBeCloseTo(Math.cos(10 * D2R), 12);
    expect(panelCosine('vertical', 45, 135, 10)).toBeCloseTo(0, 12); // 90° off the panel normal
    expect(panelCosine('vertical', 0, 180, 10)).toBe(0); // facing away, clamped
    expect(panelCosine('vertical_tracking', 0, 200, 10)).toBeCloseTo(Math.cos(10 * D2R), 12);
    expect(panelCosine('full_tracking', 0, 200, 10)).toBe(1);
    expect(panelCosine('horizontal', 0, 0, -1)).toBe(0); // below the horizon, clamped
  });
  it('irradiance scales with the disk fraction and 1/au²', () => {
    expect(irradianceWm2(1, 1)).toBe(SOLAR_CONSTANT_WM2);
    expect(irradianceWm2(1, 0.5)).toBeCloseTo(680.5, 9);
    expect(irradianceWm2(2, 1)).toBeCloseTo(340.25, 9);
    expect(irradianceWm2(1, 0)).toBe(0);
  });
  it('powerSeries multiplies efficiency, area, irradiance and cosine', () => {
    const cfg: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 2, efficiency: 0.25 };
    const p = powerSeries(series(3, 0, 5), cfg);
    expect(Array.from(p)).toEqual([680.5, 680.5, 680.5]);
  });
});

describe('simulateBattery', () => {
  const cfg: PowerConfig = { ...DEFAULT_POWER, loadW: 100, batteryWh: 1000, initialSocFraction: 1 };
  it('discharges through the night and reports the minimum state of charge', () => {
    const p = new Float64Array(20); // 20 h of darkness at 100 W load → 1000 Wh → empty after 10 h
    p.fill(0);
    const r = simulateBattery(p, cfg);
    expect(r.energyWh[0]).toBe(900);
    expect(r.energyWh[9]).toBe(0);
    expect(r.socMin).toBe(0);
    expect(r.firstBrownoutHour).toBe(10);
    expect(r.brownoutHours).toBe(10);
    expect(r.survives).toBe(false);
  });
  it('clamps charging at the capacity and survives when generation covers the load', () => {
    const p = new Float64Array(5).fill(500);
    const r = simulateBattery(p, { ...cfg, initialSocFraction: 0.5 });
    expect(Array.from(r.energyWh)).toEqual([900, 1000, 1000, 1000, 1000]);
    expect(r.socMin).toBeCloseTo(0.9, 12);
    expect(r.brownoutHours).toBe(0);
    expect(r.firstBrownoutHour).toBeNull();
    expect(r.survives).toBe(true);
    expect(r.meanPowerW).toBe(500);
  });
  it('reports a brownout from the first hour when the load always exceeds the power', () => {
    const r = simulateBattery(new Float64Array(3).fill(10), { ...cfg, areaM2: 0, batteryWh: 50, initialSocFraction: 0 });
    expect(r.firstBrownoutHour).toBe(0);
    expect(r.brownoutHours).toBe(3);
    expect(r.socMin).toBe(0);
    expect(Number.isFinite(r.meanPowerW)).toBe(true);
  });
  it('handles a zero-capacity battery without dividing by zero', () => {
    const r = simulateBattery(new Float64Array(2).fill(500), { ...cfg, batteryWh: 0 });
    expect(r.socMin).toBe(0);
    expect(r.survives).toBe(true);
  });
});

interface PowerFixture {
  site_id: string; lat: number; lon: number; start_utc: string; days: number;
  config: { panel: PowerConfig['panel']; panel_azimuth_deg: number; area_m2: number; efficiency: number; load_w: number; battery_wh: number; initial_soc_fraction: number };
  summary: { soc_min: number; brownout_hours: number; first_brownout_hour: number | null; survives: boolean; mean_power_w: number };
  sample_indexes: number[]; samples: { power_w: number[]; energy_wh: number[] };
}

describe('parity with the Python power model', () => {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  for (const name of [
    'shackleton_center_rim_high_2025-01-01_60d_vertical_tracking.json',
    'shackleton_center_rim_high_2025-01-01_60d_horizontal.json',
    'shackleton_center_rim_high_2025-01-01_60d_vertical.json',
    'im1_odysseus_2025-01-01_60d_full_tracking.json',
  ]) {
    it(`matches ${name}`, () => {
      const fx = readJson<PowerFixture>('data', 'fixtures', 'power', name);
      const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', `${fx.site_id}.json`).elevation_deg;
      const s = hourlySeries({ lat: fx.lat, lon: fx.lon }, mask, eph, utcToEt(fx.start_utc), fx.days * 24);
      const cfg: PowerConfig = {
        panel: fx.config.panel, panelAzimuthDeg: fx.config.panel_azimuth_deg, areaM2: fx.config.area_m2, efficiency: fx.config.efficiency,
        loadW: fx.config.load_w, batteryWh: fx.config.battery_wh, initialSocFraction: fx.config.initial_soc_fraction,
      };
      const r = powerBudget(s, cfg);
      fx.sample_indexes.forEach((i, k) => {
        expect(r.powerW[i]).toBeCloseTo(fx.samples.power_w[k], 6);
        expect(r.energyWh[i]).toBeCloseTo(fx.samples.energy_wh[k], 6);
      });
      expect(r.socMin).toBeCloseTo(fx.summary.soc_min, 9);
      expect(r.brownoutHours).toBe(fx.summary.brownout_hours);
      expect(r.firstBrownoutHour).toBe(fx.summary.first_brownout_hour);
      expect(r.survives).toBe(fx.summary.survives);
      expect(r.meanPowerW).toBeCloseTo(fx.summary.mean_power_w, 6);
    });
  }
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd web && npx vitest run src/lib/engine/power.test.ts`
Expected: FAIL with `Cannot find module './power'`.

- [ ] **Step 3: Implement `power.ts`**

```ts
import type { Series } from './metrics';

export type PanelModel = 'horizontal' | 'vertical' | 'vertical_tracking' | 'full_tracking';

export interface PowerConfig {
  panel: PanelModel;
  /** Azimuth the panel normal faces for the fixed vertical model (degrees clockwise from north). */
  panelAzimuthDeg: number;
  areaM2: number;
  /** Cell efficiency as a fraction (0.30 = 30 %). */
  efficiency: number;
  loadW: number;
  batteryWh: number;
  initialSocFraction: number;
}

export const SOLAR_CONSTANT_WM2 = 1361;

export const DEFAULT_POWER: PowerConfig = {
  panel: 'vertical_tracking',
  panelAzimuthDeg: 0,
  areaM2: 4,
  efficiency: 0.3,
  loadW: 200,
  batteryWh: 2000,
  initialSocFraction: 1,
};

export const PANEL_LABELS: Record<PanelModel, string> = {
  horizontal: 'Horizontal (flat deck)',
  vertical: 'Vertical, fixed azimuth',
  vertical_tracking: 'Vertical, turns to the Sun',
  full_tracking: 'Two-axis tracking',
};

const D2R = Math.PI / 180;

/** Cosine of the angle between the panel normal and the Sun, clamped at 0 (Sun behind the panel or below the horizon). */
export function panelCosine(panel: PanelModel, panelAzimuthDeg: number, sunAzDeg: number, sunElDeg: number): number {
  if (sunElDeg <= 0) return 0;
  const el = sunElDeg * D2R;
  let c: number;
  switch (panel) {
    case 'horizontal':
      c = Math.sin(el);
      break;
    case 'vertical':
      c = Math.cos(el) * Math.cos((sunAzDeg - panelAzimuthDeg) * D2R);
      break;
    case 'vertical_tracking':
      c = Math.cos(el);
      break;
    case 'full_tracking':
      c = 1;
      break;
  }
  return c > 0 ? c : 0;
}

/** Irradiance on a Sun-facing surface: the solar constant scaled by 1/au² and the visible disk fraction. */
export function irradianceWm2(sunAu: number, sunFraction: number): number {
  return (SOLAR_CONSTANT_WM2 / (sunAu * sunAu)) * sunFraction;
}

export function powerSeries(series: Series, cfg: PowerConfig): Float64Array {
  const out = new Float64Array(series.hours);
  const k = cfg.efficiency * cfg.areaM2;
  for (let h = 0; h < series.hours; h++) {
    out[h] = k * irradianceWm2(series.sunAu[h], series.sunFraction[h]) * panelCosine(cfg.panel, cfg.panelAzimuthDeg, series.sunAz[h], series.sunEl[h]);
  }
  return out;
}

export interface PowerResult {
  powerW: Float64Array;
  /** Battery energy after each hour (Wh). */
  energyWh: Float64Array;
  socMin: number;
  brownoutHours: number;
  firstBrownoutHour: number | null;
  survives: boolean;
  meanPowerW: number;
}

/** Hourly battery walk: charge with the surplus, discharge for the deficit, brownout when the deficit exceeds the stored energy. */
export function simulateBattery(powerW: Float64Array, cfg: PowerConfig, dtH = 1): PowerResult {
  const n = powerW.length;
  const cap = Math.max(0, cfg.batteryWh);
  const energyWh = new Float64Array(n);
  let e = Math.min(cap, Math.max(0, cfg.initialSocFraction) * cap);
  let socMin = cap > 0 ? e / cap : 0;
  let brownoutHours = 0;
  let firstBrownoutHour: number | null = null;
  let sum = 0;
  for (let h = 0; h < n; h++) {
    sum += powerW[h];
    let next = e + (powerW[h] - cfg.loadW) * dtH;
    if (next < 0) {
      brownoutHours++;
      if (firstBrownoutHour === null) firstBrownoutHour = h;
      next = 0;
    }
    e = Math.min(cap, next);
    energyWh[h] = e;
    const soc = cap > 0 ? e / cap : 0;
    if (soc < socMin) socMin = soc;
  }
  return { powerW, energyWh, socMin, brownoutHours, firstBrownoutHour, survives: brownoutHours === 0, meanPowerW: n ? sum / n : 0 };
}

export function powerBudget(series: Series, cfg: PowerConfig): PowerResult {
  return simulateBattery(powerSeries(series, cfg), cfg);
}
```
Add `export * from './power';` to `index.ts`.

- [ ] **Step 4: Python reference `power.py` and its tests**

```python
"""Solar power and battery reference model (mirrors web/src/lib/engine/power.ts)."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

SOLAR_CONSTANT_WM2 = 1361.0
PANELS = ("horizontal", "vertical", "vertical_tracking", "full_tracking")


@dataclass(frozen=True)
class PowerConfig:
    panel: str = "vertical_tracking"
    panel_azimuth_deg: float = 0.0
    area_m2: float = 4.0
    efficiency: float = 0.3
    load_w: float = 200.0
    battery_wh: float = 2000.0
    initial_soc_fraction: float = 1.0


def panel_cosine(panel: str, panel_azimuth_deg: float, sun_az_deg, sun_el_deg) -> np.ndarray:
    az = np.asarray(sun_az_deg, dtype=np.float64)
    el = np.radians(np.asarray(sun_el_deg, dtype=np.float64))
    if panel == "horizontal":
        c = np.sin(el)
    elif panel == "vertical":
        c = np.cos(el) * np.cos(np.radians(az - panel_azimuth_deg))
    elif panel == "vertical_tracking":
        c = np.cos(el)
    elif panel == "full_tracking":
        c = np.ones_like(el)
    else:
        raise ValueError(f"unknown panel model {panel!r}; expected one of {PANELS}")
    c = np.where(el > 0.0, c, 0.0)
    return np.clip(c, 0.0, None)


def irradiance_wm2(sun_au, sun_fraction) -> np.ndarray:
    au = np.asarray(sun_au, dtype=np.float64)
    return SOLAR_CONSTANT_WM2 / (au * au) * np.asarray(sun_fraction, dtype=np.float64)


def power_series(series: dict, cfg: PowerConfig) -> np.ndarray:
    return (
        cfg.efficiency
        * cfg.area_m2
        * irradiance_wm2(series["sun_au"], series["sun_fraction"])
        * panel_cosine(cfg.panel, cfg.panel_azimuth_deg, series["sun_az"], series["sun_el"])
    )


def simulate_battery(power_w: np.ndarray, cfg: PowerConfig, dt_h: float = 1.0) -> dict:
    cap = max(0.0, cfg.battery_wh)
    e = min(cap, max(0.0, cfg.initial_soc_fraction) * cap)
    energy = np.zeros(power_w.size)
    soc_min = e / cap if cap > 0 else 0.0
    brownout = 0
    first = None
    for h, p in enumerate(np.asarray(power_w, dtype=np.float64)):
        nxt = e + (p - cfg.load_w) * dt_h
        if nxt < 0.0:
            brownout += 1
            if first is None:
                first = h
            nxt = 0.0
        e = min(cap, nxt)
        energy[h] = e
        soc = e / cap if cap > 0 else 0.0
        soc_min = min(soc_min, soc)
    return {
        "power_w": np.asarray(power_w, dtype=np.float64),
        "energy_wh": energy,
        "soc_min": float(soc_min),
        "brownout_hours": int(brownout),
        "first_brownout_hour": first,
        "survives": brownout == 0,
        "mean_power_w": float(np.mean(power_w)) if power_w.size else 0.0,
    }


def power_budget(series: dict, cfg: PowerConfig) -> dict:
    return simulate_battery(power_series(series, cfg), cfg)


def config_dict(cfg: PowerConfig) -> dict:
    return asdict(cfg)
```

`pipeline/tests/test_power.py`:
```python
import numpy as np
import pytest

from lunar_pipeline import power as pw


def test_panel_cosines():
    assert pw.panel_cosine("horizontal", 0, 90, 30)[()] == pytest.approx(np.sin(np.radians(30)))
    assert pw.panel_cosine("vertical", 45, 45, 10)[()] == pytest.approx(np.cos(np.radians(10)))
    assert pw.panel_cosine("vertical", 45, 135, 10)[()] == pytest.approx(0.0, abs=1e-12)
    assert pw.panel_cosine("vertical", 0, 180, 10)[()] == 0.0
    assert pw.panel_cosine("vertical_tracking", 0, 200, 10)[()] == pytest.approx(np.cos(np.radians(10)))
    assert pw.panel_cosine("full_tracking", 0, 200, 10)[()] == 1.0
    assert pw.panel_cosine("horizontal", 0, 0, -1)[()] == 0.0
    with pytest.raises(ValueError):
        pw.panel_cosine("sail", 0, 0, 10)


def test_irradiance():
    assert pw.irradiance_wm2(1.0, 1.0)[()] == 1361.0
    assert pw.irradiance_wm2(2.0, 1.0)[()] == pytest.approx(340.25)
    assert pw.irradiance_wm2(1.0, 0.0)[()] == 0.0


def test_battery_discharge_and_brownout():
    cfg = pw.PowerConfig(load_w=100.0, battery_wh=1000.0, initial_soc_fraction=1.0)
    r = pw.simulate_battery(np.zeros(20), cfg)
    assert r["energy_wh"][0] == 900.0 and r["energy_wh"][9] == 0.0
    assert r["soc_min"] == 0.0 and r["first_brownout_hour"] == 10 and r["brownout_hours"] == 10
    assert r["survives"] is False


def test_battery_clamps_at_capacity():
    cfg = pw.PowerConfig(load_w=100.0, battery_wh=1000.0, initial_soc_fraction=0.5)
    r = pw.simulate_battery(np.full(5, 500.0), cfg)
    assert list(r["energy_wh"]) == [900.0, 1000.0, 1000.0, 1000.0, 1000.0]
    assert r["soc_min"] == pytest.approx(0.9) and r["survives"] is True and r["mean_power_w"] == 500.0


def test_zero_capacity_battery():
    r = pw.simulate_battery(np.full(2, 500.0), pw.PowerConfig(battery_wh=0.0))
    assert r["soc_min"] == 0.0 and r["survives"] is True
```
Run: `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest -q tests/test_power.py` → Expected: PASS.

- [ ] **Step 5: Fixture writer and CLI**

`fixtures.py`:
```python
from .power import PowerConfig, config_dict, power_budget

POWER_SAMPLE_INDEXES = [0, 1, 5, 23, 24, 100, 240, 500, 720, 1000, 1439]


def power_fixture(site_id: str, start_utc: str, days: int, cfg: PowerConfig) -> dict:
    site = next(s for s in all_sites() if s.id == site_id)
    table, header = load_table()
    mask = load_mask(site_id)
    series = hourly_series(site, mask, table, header, start_utc, days * 24)
    r = power_budget(series, cfg)
    idx = [i for i in POWER_SAMPLE_INDEXES if i < days * 24]
    return {
        "site_id": site_id, "lat": site.lat, "lon": site.lon, "start_utc": start_utc, "days": days,
        "config": config_dict(cfg),
        "summary": {k: r[k] for k in ("soc_min", "brownout_hours", "first_brownout_hour", "survives", "mean_power_w")},
        "sample_indexes": idx,
        "samples": {"power_w": [float(r["power_w"][i]) for i in idx], "energy_wh": [float(r["energy_wh"][i]) for i in idx]},
    }


def write_power_fixture(site_id: str, start_utc: str, days: int, panel: str, out_dir: Path = config.DATA_DIR / "fixtures" / "power") -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = PowerConfig(panel=panel, panel_azimuth_deg=90.0 if panel == "vertical" else 0.0)
    doc = power_fixture(site_id, start_utc, days, cfg)
    path = out_dir / f"{site_id}_{start_utc[:10]}_{days}d_{panel}.json"
    path.write_text(json.dumps(doc, indent=1) + "\n")
    return path
```
`cli.py`: parser `fp = sub.add_parser("fixture-power", help="write a power-budget golden fixture")` with `--site` (required), `--start` (default `2025-01-01T00:00:00`), `--days` (int, default 60), `--panel` (choices PANELS, default `vertical_tracking`); dispatch `from .fixtures import write_power_fixture; print(write_power_fixture(args.site, args.start, args.days, args.panel))`. In `test_cli.py` add `"fixture-power"` to the subcommand list (it needs `--site x` like `fixture-metrics`).

Run inside `pipeline/`:
```bash
uv run python -m lunar_pipeline.cli fixture-power --site shackleton_center_rim_high --days 60 --panel vertical_tracking
uv run python -m lunar_pipeline.cli fixture-power --site shackleton_center_rim_high --days 60 --panel horizontal
uv run python -m lunar_pipeline.cli fixture-power --site shackleton_center_rim_high --days 60 --panel vertical
uv run python -m lunar_pipeline.cli fixture-power --site im1_odysseus --days 60 --panel full_tracking
uv run pytest -q
```
Expected: four files under `data/fixtures/power/`; pytest PASS. Sanity: the rim site with `vertical_tracking` survives (100 % Sun); `horizontal` at 1.5° Sun elevation gives mean power near 4 × 0.3 × 1361 × sin(1.5°) ≈ 43 W → brownouts.

- [ ] **Step 6: Run the TS tests to see them pass**

Run: `cd web && npx vitest run src/lib/engine/power.test.ts`
Expected: PASS (parity 1e-6 W / Wh).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/engine pipeline data/fixtures/power
git commit -m "feat(engine): solar power and battery model with Python reference and golden fixtures"
```

---

### Task 4: Store — planner parameters, custom-site compute, compare set, best window

**Files:**
- Modify: `web/src/lib/store/explore.ts`
- Modify: `web/src/lib/store/explore.test.ts`
- Modify: `web/src/components/ExploreView.tsx` (custom compute moves into the store; `busy` comes from `s.maskBusy`)
- Modify: `web/src/lib/engine-client.ts` (no change expected; confirm `computeMask(lat, lon, { mastM })` signature)

**Interfaces:**
- Produces (additions to `ExploreState`):
```ts
export interface PlannerParams { power: PowerConfig; minEarthElDeg: number; mastM: number }
export const DEFAULT_PARAMS: PlannerParams
export interface SiteResult { site: Site; series: Series; summary: Summary; power: PowerResult; contacts: ContactWindow[] }
export const COMPARE_MAX = 4
// state
params: PlannerParams; power: PowerResult | null; contacts: ContactWindow[];
compareIds: string[]; compare: SiteResult[]; maskBusy: boolean; bestWindowNote: string | null;
// actions
setParams(patch: Partial<PlannerParams>): void
setPower(patch: Partial<PowerConfig>): void
selectCustom(lat: number, lon: number): Promise<void>
addToCompare(id: string): Promise<void>
removeFromCompare(id: string): void
findBestWindow(days: WindowDays): Promise<{ startUtc: string; summary: Summary } | null>
```
- `Loaders.computeMask?: (lat: number, lon: number, mastM: number) => Promise<{ mask: Float64Array; siteHeightM: number; failedTiles: number }>`; the default loaders wire `EngineClient` lazily (module singleton, `dataBase()`).
- Consumes: Task 2 `withCommsThreshold`, `contactWindows`; Task 3 `powerBudget`, `DEFAULT_POWER`.

- [ ] **Step 1: Failing store tests**

Append to `explore.test.ts` (uses `fileLoaders`, `custom`, `eph`, `sites` from the file):

```ts
describe('planner parameters, compare and best window', () => {
  const fakeCompute = async (lat: number, lon: number, mastM: number) => ({
    mask: new Float64Array(720).fill(mastM > 2 ? 0.5 : 1.5),
    siteHeightM: 100,
    failedTiles: 0,
  });

  it('recomputes the summary and power when parameters change', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const before = store.getState();
    expect(before.power?.powerW.length).toBe(30 * 24);
    expect(before.params).toEqual(DEFAULT_PARAMS);
    store.getState().setParams({ minEarthElDeg: 10 });
    const after = store.getState();
    expect(after.summary!.earthVisFraction).toBeLessThanOrEqual(before.summary!.earthVisFraction);
    expect(after.contacts.every((w) => w.end > w.start)).toBe(true);
    store.getState().setPower({ areaM2: 0 });
    expect(store.getState().power?.survives).toBe(false);
    expect(store.getState().power?.firstBrownoutHour).toBe(Math.floor(2000 / 200)); // full battery, 200 W load
  });

  it('selectCustom computes the mask through the loader and applies the site', async () => {
    const store = createExploreStore({ ...fileLoaders(), computeMask: fakeCompute });
    await store.getState().init();
    await store.getState().selectCustom(-89.5, 200);
    const s = store.getState();
    expect(s.site?.category).toBe('custom');
    expect(s.site?.lon).toBe(-160);
    expect(s.maskMeta?.source).toBe('computed');
    expect(s.maskBusy).toBe(false);
  });

  it('mast height recomputes the selected site skyline', async () => {
    const store = createExploreStore({ ...fileLoaders(), computeMask: fakeCompute });
    await store.getState().init();
    const featured = store.getState().mask!;
    store.getState().setParams({ mastM: 6 });
    await new Promise((r) => setTimeout(r, 0));
    await store.getState().waitForMask();
    expect(store.getState().mask).not.toBe(featured);
    expect(store.getState().mask![0]).toBe(0.5);
    expect(store.getState().maskMeta?.mastM).toBe(6);
  });

  it('addToCompare keeps at most four sites and removeFromCompare drops one', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    for (const id of ['shackleton_center', 'de_gerlache_center', 'im1_odysseus', 'im2_athena', 'south_pole']) {
      await store.getState().addToCompare(id);
    }
    expect(store.getState().compareIds).toEqual(['shackleton_center', 'de_gerlache_center', 'im1_odysseus', 'im2_athena']);
    expect(store.getState().compare.map((c) => c.site.id)).toEqual(store.getState().compareIds);
    expect(store.getState().compare[0].power.powerW.length).toBe(30 * 24);
    store.getState().removeFromCompare('im1_odysseus');
    expect(store.getState().compareIds).toEqual(['shackleton_center', 'de_gerlache_center', 'im2_athena']);
    await store.getState().addToCompare('de_gerlache_center'); // duplicate ignored
    expect(store.getState().compareIds.length).toBe(3);
  });

  it('addToCompare accepts a computed custom site without a mask file', async () => {
    const store = createExploreStore({ ...fileLoaders(), computeMask: fakeCompute });
    await store.getState().init();
    await store.getState().selectCustom(-89.5, 10);
    const id = store.getState().siteId!;
    await store.getState().addToCompare(id);
    expect(store.getState().compare.map((c) => c.site.id)).toContain(id);
  });

  it('compare results follow the window and the parameters', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().addToCompare('shackleton_center');
    const h30 = store.getState().compare[0].series.hours;
    store.getState().setWindow('2027-03-01T00:00:00', 14);
    expect(store.getState().compare[0].series.hours).toBe(14 * 24);
    expect(h30).toBe(30 * 24);
    const sunBefore = store.getState().compare[0].power.meanPowerW;
    store.getState().setPower({ areaM2: 8 });
    expect(store.getState().compare[0].power.meanPowerW).toBeCloseTo(sunBefore * 2, 6);
  });

  it('findBestWindow moves the start date to the best-scoring span and reports it', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().selectSite('shackleton_center'); // crater floor: long nights, so the window matters
    const result = await store.getState().findBestWindow(14);
    expect(result).not.toBeNull();
    expect(store.getState().startUtc).toBe(result!.startUtc);
    expect(store.getState().days).toBe(14);
    expect(store.getState().summary!.illumFraction).toBeCloseTo(result!.summary.illumFraction, 9);
    expect(store.getState().bestWindowNote).toMatch(/% sun/);
  });

  it('findBestWindow near the end of the ephemeris table returns null instead of throwing', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().setWindow('2036-12-20T00:00:00', 90);
    await expect(store.getState().findBestWindow(90)).resolves.toBeNull();
    expect(store.getState().bestWindowNote).toMatch(/does not fit/);
  });
});
```
Add `DEFAULT_PARAMS` to the import from `./explore`.

- [ ] **Step 2: Run to see them fail**

Run: `cd web && npx vitest run src/lib/store/explore.test.ts`
Expected: FAIL — `DEFAULT_PARAMS` undefined, `setParams is not a function`.

- [ ] **Step 3: Implement the store additions**

In `explore.ts`:

```ts
import { contactWindows, hourlySeries, summarize, withCommsThreshold, type ContactWindow, type Series, type Summary } from '../engine/metrics';
import { SeriesIndex, bestWindow } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig, type PowerResult } from '../engine/power';
import { etToIso, utcToEt } from '../engine/time';
import { normalizeLon } from '../engine/geometry';

export interface PlannerParams {
  power: PowerConfig;
  minEarthElDeg: number;
  mastM: number;
}
export const DEFAULT_PARAMS: PlannerParams = { power: DEFAULT_POWER, minEarthElDeg: 0, mastM: 2 };
export const COMPARE_MAX = 4;
export const BEST_WINDOW_SCAN_DAYS = 365;

export interface MaskMeta {
  siteHeightM: number;
  source: 'featured' | 'computed';
  failedTiles: number;
  /** Mast height the skyline was computed with; absent means the featured 2 m. */
  mastM?: number;
}

export interface SiteResult {
  site: Site;
  series: Series;
  summary: Summary;
  power: PowerResult;
  contacts: ContactWindow[];
}

export interface Loaders {
  ...existing...
  /** Optional: worker-backed skyline for custom sites and mast changes. */
  computeMask?: (lat: number, lon: number, mastM: number) => Promise<{ mask: Float64Array; siteHeightM: number; failedTiles: number }>;
}
```
State additions: `params: DEFAULT_PARAMS, power: null, contacts: [], compareIds: [], compare: [], maskBusy: false, bestWindowNote: null` and `waitForMask: () => Promise<void>`.

`recompute` becomes:
```ts
export function recompute(eph: Ephemeris, site: Site, mask: Float64Array, startUtc: string, days: number, params: PlannerParams = DEFAULT_PARAMS): SiteResult {
  const raw = hourlySeries(site, mask, eph, utcToEt(startUtc), days * 24);
  const series = params.minEarthElDeg > 0 ? withCommsThreshold(raw, mask, params.minEarthElDeg) : raw;
  return { site, series, summary: summarize(series), power: powerBudget(series, params.power), contacts: contactWindows(series) };
}
```
Every existing call site that sets `series`/`summary` also sets `power`/`contacts` (write a private `applyResult(r: SiteResult)` helper: `set({ series: r.series, summary: r.summary, power: r.power, contacts: r.contacts, cursorHour: Math.min(get().cursorHour, r.series.hours - 1) })`).

Compare recomputation (private): `function recomputeCompare()` maps `compareIds` to `SiteResult` using `masks.get(id)!.mask` and the current window/params; called from `setWindow`, `setParams`, `setPower`, `addToCompare`, `removeFromCompare`.

Actions:
```ts
    setParams(patch) {
      const params = { ...get().params, ...patch };
      set({ params });
      const { eph, site, mask, startUtc, days } = get();
      if (eph && site && mask) applyResult(recompute(eph, site, mask, startUtc, days, params));
      recomputeCompare();
      if (patch.mastM !== undefined && site && get().maskMeta && (get().maskMeta!.mastM ?? 2) !== params.mastM) void recomputeMask();
    },
    setPower(patch) {
      get().setParams({ power: { ...get().params.power, ...patch } });
    },
    async selectCustom(lat, lon) {
      if (!loaders.computeMask) {
        set({ customError: 'custom sites need the skyline worker' });
        return;
      }
      const lonN = normalizeLon(lon);
      set({ maskBusy: true, customError: null });
      try {
        const res = await loaders.computeMask(lat, lonN, get().params.mastM);
        get().applyMask(
          { id: `custom_${lat.toFixed(4)}_${lonN.toFixed(4)}`, name: `Custom site ${lat.toFixed(3)}°, ${lonN.toFixed(3)}°`, lat, lon: lonN, category: 'custom', polar: true, source: 'user' },
          res.mask,
          { siteHeightM: res.siteHeightM, source: 'computed', failedTiles: res.failedTiles, mastM: get().params.mastM },
        );
      } catch (err) {
        set({ customError: message(err) });
      } finally {
        set({ maskBusy: false });
      }
    },
    async addToCompare(id) {
      const { compareIds, sites } = get();
      if (compareIds.includes(id) || compareIds.length >= COMPARE_MAX) return;
      const site = sites.find((s) => s.id === id) ?? get().compare.find((c) => c.site.id === id)?.site ?? (get().site?.id === id ? get().site : null);
      if (!site) return;
      if (!masks.has(id)) {
        const doc = await loaders.loadMask(id);
        masks.set(id, { mask: Float64Array.from(doc.elevation_deg), meta: { siteHeightM: doc.site_height_m, source: 'featured', failedTiles: 0, mastM: doc.mast_m } });
      }
      compareSites.set(id, site);
      set({ compareIds: [...get().compareIds, id] });
      recomputeCompare();
    },
    removeFromCompare(id) {
      set({ compareIds: get().compareIds.filter((x) => x !== id) });
      recomputeCompare();
    },
    async findBestWindow(days) {
      const { eph, site, mask, startUtc, params } = get();
      if (!eph || !site || !mask) return null;
      const windowHours = days * 24;
      const startEt = utcToEt(startUtc);
      const lastEt = eph.t0Et + (eph.n - 1) * eph.stepS;
      const available = Math.floor((lastEt - startEt) / 3600) - 3; // Catmull-Rom guard rows
      const scanHours = Math.min(BEST_WINDOW_SCAN_DAYS * 24 + windowHours, available);
      if (scanHours < windowHours) {
        set({ bestWindowNote: `A ${days}-day window does not fit between this start date and the end of the ephemeris table (2036-12-31).` });
        return null;
      }
      const raw = hourlySeries(site, mask, eph, startEt, scanHours);
      const series = params.minEarthElDeg > 0 ? withCommsThreshold(raw, mask, params.minEarthElDeg) : raw;
      const best = bestWindow(new SeriesIndex(series), windowHours, 6);
      const newStart = etToIso(startEt + best.start * 3600).slice(0, 13) + ':00:00';
      get().setWindow(newStart, days);
      const s = best.summary;
      set({ bestWindowNote: `${Math.round(s.illumFraction * 100)} % sun, ${Math.round(s.earthVisFraction * 100)} % Earth, longest gap ${s.longestEarthGapH} h` });
      return { startUtc: newStart, summary: s };
    },
```
(`etToIso(et)` in `time.ts` returns an ISO string; `Ephemeris` exposes `t0Et`, `stepS`, `n`.)

`recomputeMask` (private):
```ts
  let maskPromise: Promise<void> = Promise.resolve();
  function recomputeMask(): Promise<void> {
    maskPromise = (async () => {
      const { site, params } = get();
      if (!site || !loaders.computeMask) return;
      const seq = ++selectSeq;
      set({ maskBusy: true });
      try {
        const res = await loaders.computeMask(site.lat, site.lon, params.mastM);
        if (seq !== selectSeq) return;
        get().applyMask(site, res.mask, { siteHeightM: res.siteHeightM, source: 'computed', failedTiles: res.failedTiles, mastM: params.mastM });
      } catch (err) {
        if (seq === selectSeq) set({ customError: message(err) });
      } finally {
        if (seq === selectSeq) set({ maskBusy: false });
      }
    })();
    return maskPromise;
  }
```
and `waitForMask: () => maskPromise`. `applyMask` keeps `masks.set(site.id, …)` and now also refreshes compare entries for that id (`compareSites.set` + `recomputeCompare()` when the id is in `compareIds`). `selectSite` on a featured site: if `params.mastM !== 2` the featured mask is applied first, then `void recomputeMask()`.

Default loaders: 
```ts
let client: EngineClient | null = null;
export const exploreStore = createExploreStore({
  ...existing,
  computeMask: async (lat, lon, mastM) => {
    client ??= new EngineClient(dataBase());
    const r = await client.computeMask(lat, lon, { mastM });
    return { mask: r.mask, siteHeightM: r.siteHeightM, failedTiles: r.failedTiles.length };
  },
});
```
(`EngineClient` import from `../engine-client` is client-only: it constructs a `Worker`; guard with `typeof Worker !== 'undefined'` inside the loader so SSR never touches it.)

`ExploreView.tsx`: delete the local `client`, `busy`, `onCustom`; `onCustom={(lat, lon) => void s.selectCustom(lat, lon)}`, `busy={s.maskBusy}`, `onPick` calls `s.selectCustom(r.lat, r.lon)`. Existing view tests keep passing (they never compute).

- [ ] **Step 4: Run the store and view tests to see them pass**

Run: `cd web && npx vitest run src/lib/store src/components/ExploreView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): planner parameters, custom-site compute and compare set in the store, best-window finder"
```

---

### Task 5: Compare page — columns, sparkline, verdict chip

**Files:**
- Create: `web/src/components/Sparkline.tsx`, `web/src/components/VerdictChip.tsx`, `web/src/components/CompareView.tsx`, `web/src/components/CompareView.test.tsx`, `web/src/app/compare/page.tsx`
- Modify: `web/src/components/AppFrame.tsx:4` (`compare` ready)
- Create: `web/src/lib/viz/verdict.ts`, `web/src/lib/viz/verdict.test.ts`

**Interfaces:**
- Produces:
```ts
export function verdictFor(power: PowerResult): { tone: 'good' | 'bad'; label: string; detail: string }
export function Sparkline({ series, width = 240, height = 40 }: { series: Series; width?: number; height?: number })
export function VerdictChip({ power }: { power: PowerResult })
export function CompareView({ store = exploreStore }: { store?: StoreApi<ExploreState> })
```
- Consumes: Task 4 store (`compare`, `compareIds`, `addToCompare`, `removeFromCompare`, `findBestWindow`, `params`, `setWindow`), `binSeries`, `pct`, `hoursLabel`.

- [ ] **Step 1: Failing verdict test (`verdict.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { verdictFor } from './verdict';

const base = { powerW: new Float64Array(0), energyWh: new Float64Array(0), meanPowerW: 100 };

describe('verdictFor', () => {
  it('good when the battery never empties', () => {
    const v = verdictFor({ ...base, socMin: 0.63, brownoutHours: 0, firstBrownoutHour: null, survives: true });
    expect(v.tone).toBe('good');
    expect(v.label).toBe('Survives the window');
    expect(v.detail).toBe('battery never below 63 %');
  });
  it('bad with the first empty hour and the brownout total', () => {
    const v = verdictFor({ ...base, socMin: 0, brownoutHours: 37, firstBrownoutHour: 118, survives: false });
    expect(v.tone).toBe('bad');
    expect(v.label).toBe('Battery empties after 4 d 22 h');
    expect(v.detail).toBe('37 h without full power');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd web && npx vitest run src/lib/viz/verdict.test.ts` → Expected: FAIL `Cannot find module './verdict'`.

- [ ] **Step 3: Implement `verdict.ts`, `VerdictChip`, `Sparkline`**

`verdict.ts`:
```ts
import type { PowerResult } from '../engine/power';
import { hoursLabel } from './format';

export function verdictFor(power: PowerResult): { tone: 'good' | 'bad'; label: string; detail: string } {
  if (power.survives) {
    return { tone: 'good', label: 'Survives the window', detail: `battery never below ${Math.round(power.socMin * 100)} %` };
  }
  return {
    tone: 'bad',
    label: `Battery empties after ${hoursLabel(power.firstBrownoutHour ?? 0)}`,
    detail: `${power.brownoutHours} h without full power`,
  };
}
```
`VerdictChip.tsx`:
```tsx
import type { PowerResult } from '@/lib/engine/power';
import { verdictFor } from '@/lib/viz/verdict';

export function VerdictChip({ power }: { power: PowerResult }) {
  const v = verdictFor(power);
  const tone = v.tone === 'good' ? 'border-good text-good' : 'border-bad text-bad';
  return (
    <p className={`inline-flex flex-col rounded-md border px-3 py-1 text-sm ${tone}`} data-tone={v.tone}>
      <span className="font-medium">
        <span aria-hidden="true">{v.tone === 'good' ? '● ' : '▲ '}</span>
        {v.label}
      </span>
      <span className="text-xs text-ink-2">{v.detail}</span>
    </p>
  );
}
```
`Sparkline.tsx` (pure SVG, no interaction):
```tsx
import { useMemo } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { binSeries } from '@/lib/viz/timeline';

export function Sparkline({ series, width = 240, height = 40 }: { series: Series; width?: number; height?: number }) {
  const bins = Math.min(series.hours, Math.max(24, Math.floor(width / 2)));
  const b = useMemo(() => binSeries(series, bins), [series, bins]);
  const sunH = height - 8;
  const w = width / bins;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Sunlit hours (bars) and Earth visibility (strip)" className="block">
      <rect x={0} y={0} width={width} height={sunH} fill="var(--night)" />
      {Array.from(b.sunMax, (v, i) =>
        v > 0 ? <rect key={i} x={i * w} y={sunH * (1 - v)} width={Math.max(1, w - 0.3)} height={sunH * v} fill={v >= 0.999 ? 'var(--sun-bright)' : 'var(--sun)'} /> : null,
      )}
      <rect x={0} y={sunH + 2} width={width} height={6} fill="var(--night)" />
      {Array.from(b.earthFrac, (v, i) =>
        v > 0 ? <rect key={i} x={i * w} y={sunH + 2} width={Math.max(1, w - 0.3)} height={6} fill="var(--earth)" opacity={0.35 + 0.65 * v} /> : null,
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Failing CompareView test**

`CompareView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { CompareView } from './CompareView';

function storeWithFiles() {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
  return createExploreStore({
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id) => {
      const m = readJson<{ elevation_deg: number[]; site_height_m: number; mast_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: m.mast_m, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  });
}

describe('CompareView', () => {
  it('shows the empty state, then one column per compared site with KPIs and a verdict', async () => {
    const store = storeWithFiles();
    render(<CompareView store={store} />);
    await waitFor(() => expect(screen.getByText(/Add up to four sites/)).toBeTruthy());
    await store.getState().addToCompare('shackleton_center_rim_high');
    await store.getState().addToCompare('shackleton_center');
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));
    const cols = screen.getAllByRole('article');
    expect(cols[0].textContent).toMatch(/Shackleton crater rim/);
    expect(cols[0].textContent).toMatch(/Sun above the skyline/);
    expect(cols[0].querySelector('[data-tone]')).toBeTruthy();
    expect(cols[1].textContent).toMatch(/Shackleton crater centre/);
    fireEvent.click(within(cols[1]).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(1));
  });
  it('disables adding at four sites', async () => {
    const store = storeWithFiles();
    render(<CompareView store={store} />);
    await waitFor(() => expect(screen.getByText(/Add up to four sites/)).toBeTruthy());
    for (const id of ['shackleton_center', 'de_gerlache_center', 'im1_odysseus', 'im2_athena']) await store.getState().addToCompare(id);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(4));
    expect((screen.getByRole('combobox', { name: 'Add site' }) as HTMLSelectElement).disabled).toBe(true);
  });
});
```
(`within` from `@testing-library/react`.)

- [ ] **Step 5: Run to see it fail** → `Cannot find module './CompareView'`.

- [ ] **Step 6: Implement `CompareView.tsx` and the route**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import Link from 'next/link';
import { AppFrame } from './AppFrame';
import { PlannerParamsPanel } from './PlannerParamsPanel';
import { Sparkline } from './Sparkline';
import { VerdictChip } from './VerdictChip';
import { WindowControls } from './WindowControls';
import { COMPARE_MAX, exploreStore, type ExploreState, type SiteResult } from '@/lib/store/explore';
import { hoursLabel, pct, utcLabel } from '@/lib/viz/format';

export function CompareView({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const [adding, setAdding] = useState('');
  useEffect(() => {
    void store.getState().init();
  }, [store]);
  if (s.status !== 'ready' || !s.site) {
    return (
      <AppFrame>
        <p className="px-6 py-10 text-ink-2">{s.status === 'error' ? s.error : 'Loading NASA data…'}</p>
      </AppFrame>
    );
  }
  const candidates = [s.site, ...s.sites.filter((x) => x.polar && x.id !== s.site!.id)].filter((x) => !s.compareIds.includes(x.id));
  const full = s.compareIds.length >= COMPARE_MAX;
  return (
    <AppFrame>
      <main className="flex flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              Add site
              <select
                aria-label="Add site"
                value={adding}
                disabled={full}
                onChange={(e) => {
                  setAdding('');
                  if (e.target.value) void s.addToCompare(e.target.value);
                }}
                className="min-w-[280px] rounded-md border border-line bg-panel px-2 py-1 text-ink disabled:opacity-50"
              >
                <option value="">{full ? 'Four sites compared (maximum)' : 'Choose a site…'}</option>
                {candidates.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </label>
            <span className="text-sm text-ink-3">Compared sites ({s.compareIds.length})</span>
          </div>
          <WindowControls startUtc={s.startUtc} days={s.days} onWindow={s.setWindow} bestWindowNote={s.bestWindowNote} onBestWindow={(d) => void s.findBestWindow(d)} />
        </div>
        <PlannerParamsPanel params={s.params} onParams={s.setParams} onPower={s.setPower} busy={s.maskBusy} />
        {s.compare.length === 0 ? (
          <p className="rounded-md bg-panel p-6 text-ink-2">
            Add up to four sites to compare them over the same window and planner settings. Explore a site and press “Add to compare”, or pick one above.
          </p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {s.compare.map((c) => (
              <CompareColumn key={c.site.id} result={c} startUtc={s.startUtc} days={s.days} onRemove={() => s.removeFromCompare(c.site.id)} onOpen={() => void s.selectSite(c.site.id)} />
            ))}
          </div>
        )}
      </main>
    </AppFrame>
  );
}

function CompareColumn({ result, startUtc, days, onRemove, onOpen }: { result: SiteResult; startUtc: string; days: number; onRemove: () => void; onOpen: () => void }) {
  const { site, series, summary, power, contacts } = result;
  const rows: [string, string][] = [
    ['Sun above the skyline', pct(summary.illumFraction)],
    ['Longest night', hoursLabel(summary.longestDarkH)],
    ['Earth in view', pct(summary.earthVisFraction)],
    ['Longest Earth gap', hoursLabel(summary.longestEarthGapH)],
    ['Lowest battery', pct(power.socMin)],
    ['Hours without full power', hoursLabel(power.brownoutHours)],
  ];
  return (
    <article aria-label={site.name} className="flex min-w-[260px] max-w-[320px] flex-1 flex-col gap-3 rounded-md bg-panel p-4">
      <div>
        <h2 className="font-display text-lg font-semibold leading-tight">{site.name}</h2>
        <p className="text-xs text-ink-3">{site.lat.toFixed(3)}°, {site.lon.toFixed(3)}°</p>
      </div>
      <Sparkline series={series} />
      <p className="text-xs text-ink-3">{utcLabel(startUtc, 0)} + {days} days; {contacts.length} Earth contact {contacts.length === 1 ? 'window' : 'windows'}</p>
      <VerdictChip power={power} />
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex gap-2">
        <Link href="/explore" onClick={onOpen} className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink">Open in Explore</Link>
        <button type="button" onClick={onRemove} className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink">Remove</button>
      </div>
    </article>
  );
}
```
`web/src/app/compare/page.tsx`: `import { CompareView } from '@/components/CompareView'; export default function ComparePage() { return <CompareView />; }`. `AppFrame.tsx`: `{ href: '/compare', label: 'Compare', ready: true }`. `WindowControls` gains optional `bestWindowNote` and `onBestWindow` props (implemented in Task 6 Step 3; for this task pass them through — add the props to `WindowControls` now with a button that is rendered only when `onBestWindow` is given).

- [ ] **Step 7: Run the tests** → `cd web && npx vitest run src/components src/lib/viz` Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src
git commit -m "feat(web): Compare page with per-site columns, sparklines, KPIs and survive-the-night verdicts"
```

---

### Task 6: Explore — planner panel, power tiles, best-window button, add to compare; visual critique

**Files:**
- Create: `web/src/components/PlannerParamsPanel.tsx`, `web/src/components/PlannerParamsPanel.test.tsx`
- Modify: `web/src/components/WindowControls.tsx` (best-window button + note), `web/src/components/SummaryTiles.tsx` (power rows + chip), `web/src/components/ExploreView.tsx` (panel, add to compare, subtitle), `web/src/components/ExploreView.test.tsx`

**Interfaces:**
- `PlannerParamsPanel({ params, onParams, onPower, busy }: { params: PlannerParams; onParams: (p: Partial<PlannerParams>) => void; onPower: (p: Partial<PowerConfig>) => void; busy: boolean })`
- `SummaryTiles({ summary, power }: { summary: Summary; power?: PowerResult | null })`
- `WindowControls({ startUtc, days, onWindow, onBestWindow?, bestWindowNote? })`

- [ ] **Step 1: Failing panel test**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { PlannerParamsPanel } from './PlannerParamsPanel';

describe('PlannerParamsPanel', () => {
  it('is collapsed by default and reports edits through the callbacks', () => {
    const onParams = vi.fn();
    const onPower = vi.fn();
    render(<PlannerParamsPanel params={DEFAULT_PARAMS} onParams={onParams} onPower={onPower} busy={false} />);
    const toggle = screen.getByRole('button', { name: /Planner settings/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('Load (W)'), { target: { value: '350' } });
    expect(onPower).toHaveBeenCalledWith({ loadW: 350 });
    fireEvent.change(screen.getByLabelText('Minimum Earth elevation (°)'), { target: { value: '5' } });
    expect(onParams).toHaveBeenCalledWith({ minEarthElDeg: 5 });
    fireEvent.click(screen.getByLabelText('Two-axis tracking'));
    expect(onPower).toHaveBeenCalledWith({ panel: 'full_tracking' });
    fireEvent.change(screen.getByLabelText('Mast height (m)'), { target: { value: '6' } });
    expect(onParams).toHaveBeenCalledWith({ mastM: 6 });
  });
  it('ignores out-of-range or non-numeric input', () => {
    const onPower = vi.fn();
    render(<PlannerParamsPanel params={DEFAULT_PARAMS} onParams={vi.fn()} onPower={onPower} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Planner settings/ }));
    fireEvent.change(screen.getByLabelText('Battery (Wh)'), { target: { value: '-5' } });
    fireEvent.change(screen.getByLabelText('Battery (Wh)'), { target: { value: 'abc' } });
    expect(onPower).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see it fail** → `Cannot find module './PlannerParamsPanel'`.

- [ ] **Step 3: Implement the panel, window button, tiles and Explore wiring**

`PlannerParamsPanel.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { PANEL_LABELS, type PanelModel, type PowerConfig } from '@/lib/engine/power';
import type { PlannerParams } from '@/lib/store/explore';

type NumField = { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void };

function NumberInput({ label, value, min, max, step, onChange }: NumField) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-2">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-28 rounded-md border border-line bg-panel px-2 py-1 text-ink"
      />
    </label>
  );
}

export function PlannerParamsPanel({ params, onParams, onPower, busy }: { params: PlannerParams; onParams: (p: Partial<PlannerParams>) => void; onPower: (p: Partial<PowerConfig>) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const p = params.power;
  return (
    <section aria-label="Planner settings" className="rounded-md bg-panel px-4 py-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between py-1 text-left text-sm text-ink">
        <span>Planner settings: {PANEL_LABELS[p.panel]}, {p.areaM2} m², {p.loadW} W load, {p.batteryWh} Wh battery, Earth above {params.minEarthElDeg}°, mast {params.mastM} m</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-x-6 gap-y-3 py-3">
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1 text-ink-2">Solar panel</legend>
            {(Object.keys(PANEL_LABELS) as PanelModel[]).map((m) => (
              <label key={m} className="flex items-center gap-2 text-ink">
                <input type="radio" name="panel" checked={p.panel === m} onChange={() => onPower({ panel: m })} aria-label={PANEL_LABELS[m]} />
                {PANEL_LABELS[m]}
              </label>
            ))}
          </fieldset>
          {p.panel === 'vertical' && <NumberInput label="Panel faces azimuth (°)" value={p.panelAzimuthDeg} min={0} max={360} step={5} onChange={(v) => onPower({ panelAzimuthDeg: v })} />}
          <NumberInput label="Panel area (m²)" value={p.areaM2} min={0.5} max={50} step={0.5} onChange={(v) => onPower({ areaM2: v })} />
          <NumberInput label="Cell efficiency (%)" value={Math.round(p.efficiency * 100)} min={5} max={45} step={1} onChange={(v) => onPower({ efficiency: v / 100 })} />
          <NumberInput label="Load (W)" value={p.loadW} min={10} max={2000} step={10} onChange={(v) => onPower({ loadW: v })} />
          <NumberInput label="Battery (Wh)" value={p.batteryWh} min={100} max={50000} step={100} onChange={(v) => onPower({ batteryWh: v })} />
          <NumberInput label="Battery at start (%)" value={Math.round(p.initialSocFraction * 100)} min={0} max={100} step={5} onChange={(v) => onPower({ initialSocFraction: v / 100 })} />
          <NumberInput label="Minimum Earth elevation (°)" value={params.minEarthElDeg} min={0} max={10} step={0.5} onChange={(v) => onParams({ minEarthElDeg: v })} />
          <NumberInput label="Mast height (m)" value={params.mastM} min={0} max={10} step={1} onChange={(v) => onParams({ mastM: v })} />
          <p className="basis-full text-xs text-ink-3">
            Power = efficiency × area × 1361 W/m² ÷ AU² × visible Sun fraction × panel cosine; the battery charges with the surplus and empties on the deficit. Mast height recomputes the selected site’s skyline{busy ? ' (computing…)' : ''}.
          </p>
        </div>
      )}
    </section>
  );
}
```
`WindowControls.tsx`: add props `onBestWindow?: (days: WindowDays) => void; bestWindowNote?: string | null;` and after the fieldset:
```tsx
      {onBestWindow && (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => onBestWindow(days)} className="rounded-md border border-sun px-3 py-1 text-sm text-ink hover:bg-panel">
            Best {days}-day window from here
          </button>
          {bestWindowNote && <span className="text-xs text-ink-3">{bestWindowNote}</span>}
        </div>
      )}
```
`SummaryTiles.tsx`: accept `power?: PowerResult | null`; when present add rows `['Lowest battery', pct(power.socMin), 'lowest state of charge in the window']` and `['Hours without full power', hoursLabel(power.brownoutHours), 'battery empty and load not met']` and render `<VerdictChip power={power} />` above the grid. `ExploreView.tsx`: render `<PlannerParamsPanel …/>` under the controls row, pass `onBestWindow={(d) => void s.findBestWindow(d)}` and `bestWindowNote={s.bestWindowNote}` to `WindowControls`, pass `power={s.power}` to `SummaryTiles`, and add next to the mode controls:
```tsx
<button type="button" disabled={s.compareIds.includes(s.site.id) || s.compareIds.length >= COMPARE_MAX} onClick={() => void s.addToCompare(s.site!.id)} className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink disabled:opacity-50">
  {s.compareIds.includes(s.site.id) ? 'In compare' : 'Add to compare'}
</button>
<Link href="/compare" className="text-sm text-ink-2 underline-offset-4 hover:underline">Compared sites ({s.compareIds.length})</Link>
```
`ExploreView.test.tsx` ready-state test: add `expect(screen.getByRole('button', { name: /Planner settings/ })).toBeTruthy(); expect(screen.getByRole('button', { name: /Best 30-day window/ })).toBeTruthy(); expect(screen.getByText('Survives the window')).toBeTruthy();` (the rim site at 4 m² vertical tracking survives) and a click on "Add to compare" followed by `await waitFor(() => expect(screen.getByText('Compared sites (1)')).toBeTruthy())`.

- [ ] **Step 4: Run the component tests** → `cd web && npx vitest run src/components` Expected: PASS.

- [ ] **Step 5: Gates and visual critique**

Run: `cd web && npm test && npx tsc --noEmit && npm run lint && npm run build`. Then `npm run dev -- --port 3000` and with Playwright at 1360×900: Explore with the panel open (screenshot), press "Best 30-day window from here" on Shackleton crater centre and confirm the start date changes and the note appears; Compare with four sites (screenshot); check no console errors. Fix layout issues found (column widths, panel wrapping) before committing.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): planner settings panel, survive-the-night tiles, best-window button and add-to-compare on Explore"
```

---

### Task 7: Docs and closeout

**Files:**
- Modify: `docs/method.md` (sections "Power budget" and "Direct-to-Earth contact"), `web/README.md` (engine list, Compare route), `README.md` (feature list), `docs/data-credits.md` (already in Task 1)

- [ ] **Step 1: Write the method sections**

`docs/method.md` append:
```markdown
## Power budget (Week 4)

Irradiance on a Sun-facing surface is 1361 W/m² · (1 AU / d)² · f, where d is the Sun distance from the DE440 table and f the visible fraction of the solar disk above the terrain skyline (Section "Terrain horizon"). Panel output is P = η · A · irradiance · max(0, n · s) with the panel normal n for four geometries: horizontal (n = up), vertical fixed at azimuth φ (n · s = cos el · cos(az − φ)), vertical turning to the Sun's azimuth (cos el) and two-axis tracking (1). The battery walk uses one-hour steps: E_{t+1} = min(C, E_t + (P − L) · 1 h); an hour whose deficit exceeds the stored energy is a brownout and leaves the battery empty. Reported: minimum state of charge, brownout hours, first brownout hour. Reference implementation: `pipeline/lunar_pipeline/power.py`; golden fixtures under `data/fixtures/power/` pin `web/src/lib/engine/power.ts` to 1e-6 W.

## Direct-to-Earth contact (Week 4)

Earth is in view when its elevation exceeds the skyline at its azimuth by the minimum elevation the planner sets (0–10°). Contact windows are maximal runs of visible hours. Mast height changes the skyline itself (recomputed by the browser worker for the selected site); featured skylines are computed with a 2 m mast.
```
`web/README.md`: add `power.ts` to the engine list and a "Routes" list (`/explore`, `/compare`). `README.md`: bullet "Compare up to four sites over the same window and planner settings; best-window finder; survive-the-night verdict".

- [ ] **Step 2: Full gates**

Run: `uv run --directory C:/Users/user/Documents/GitHub/Trinity/pipeline pytest -q` and `cd web && npm test && npx tsc --noEmit && npm run lint && npm run build`.
Expected: all green. Restore `data/fixtures/horizons/summary.json` if pytest rewrote it (`git checkout -- data/fixtures/horizons/summary.json`).

- [ ] **Step 3: Commit**

```bash
git add docs README.md web/README.md
git commit -m "docs: power budget and Earth-contact method, Compare route"
```

Then: review-package, fresh reviewer, fix pass, PR against `feat/week3-3d`.
