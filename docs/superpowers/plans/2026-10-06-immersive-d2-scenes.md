# Part D2: The Scenes, Sharper and More Solid, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec section 17: the next step in view on wide screens; the descent's middle sharp, with a 240 m flight level, and no square round the site; rocks as stones; a finer lander; the night ground with shape.

**Architecture:** The pipeline cuts one more level for the arrival's site (`pipeline/lunar_pipeline/terrain3d.py`), the web loads it beside the window and context (`web/src/lib/data/terrain.ts`, `web/src/lib/sky/terrainField.ts`, `web/src/components/home/ArrivalCanvas.tsx`), and the measured ground's meshes move from `standRenderer.ts` into their own module (`web/src/lib/sky/groundLevels.ts`), which gives each mesh its own height slots, the flight level, and round cuts whose light and shadows fade into the next level (`shaders.ts`, `shadowRule.ts`). Rocks are cut by more planes (`boulders.ts`). The lander moves into its own module (`web/src/lib/sky/landerMesh.ts`) and gains parts, its shadow shape kept in step (`landerShape.ts`). The night light becomes the sky's (`shaders.ts`, the renderer's lights). The page gains the next-step row (`web/src/components/stand/StandView.tsx`). No computed number changes (spec 11).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, vitest with jsdom and Testing Library, three.js 0.186; Python 3.12 with uv, numpy and pytest for the pipeline; Playwright MCP for the frames and the measurements.

**Spec:** `docs/superpowers/specs/2026-10-02-immersive-space-design.md`, section 17 (part D2), with sections 7 to 9 (performance, accessibility, testing), 13.2 (the gate), 15.1 and 16.6 (the measurements). The mockup was published to the user on 6 October 2026 with D2's go ("continue and run"); its sources are in the job folder `.claude/jobs/a9458886/tmp/mock_d2/` (`ui/make.py`, `descent/`, `proto/` with `proto/NOTES.md`, `page/index.html`).

## Scope

This plan covers D2 (spec 16.1 and 17). Of what read D1 left (16.7):

- **Built here:** the next step out of More (wide screens), the smeared descent, the square patch round the site, the box rock, the plain lander and its glowing strip, the flat grey night ground.
- **Left as they are:** the words pass ("above the horizon" at night) and the deferred list of 16.7 and the D1 ledger. The phone keeps the next step under More (17.1).

## Global Constraints

- Gates from `web/`: `npx vitest run --maxWorkers=2` (8 GB laptop), `npx tsc --noEmit`, `npm run lint`, `npm run build`. Pipeline from `pipeline/`: `uv run pytest -q`.
- Spec 2: "One gold action per screen; gold is the Sun, blue is Earth, green and red are the power verdict." The row's gold action is the card's on wide screens (17.1).
- Spec 2: "No text under 14 px, controls at least 40 px tall, standalone links underlined, reduced motion respected."
- Spec 8: "Keyboard: arrows look, `+`/`-` zoom, space plays, the look buttons are buttons; focus is always visible."
- Spec 11: no change to a computed number. The shadow rule's CPU twin (`shadowRule.sunFraction`) and its agreement with the engine (712 of 720 hours at de Gerlache Rim 2) stay as they are: the flight level never enters `TerrainField.levels`.
- Spec 16.5 and 17.6: no sideways scroll, no text under 13 px, no text under 4.5:1; the phone's scene band at least 55 % of the screen's height; the blind read's gate of 13.2.
- The ground shader's compile already runs short of memory on this laptop: no loop may be unrolled (every loop bound multiplies `uOne`), and no function with a loop gains a second call site.
- Screens are checked on a fresh loopback host (`127.0.0.52:3000` and up; never `localhost` or `127.0.0.1`), on the production build. Stop the server with TaskStop, then kill the port's owner (PowerShell `Get-NetTCPConnection -LocalPort 3000`).
- Disk: C: has about 300 MB free. Delete `web/.next/cache` after each build; never download anything over 100 MB; keep screenshots under `.playwright-mcp/` and delete a pass's frames once read.
- Data: `web/public/data/` is not in git (the pipeline writes it; R2 serves it in production). The new flight file goes to R2 only with the user's go to deploy; until then the arrival must draw as before without it.
- Secrets: never read, print or copy `web/.env.local`; no calls to OpenRouter or any paid API in tests, reads or reviews.
- Subagents work in this checkout on their own files only, run only their own test files (`npx vitest run <files> --maxWorkers=1`, or `uv run pytest <file> -q`), and commit with `git add <their files>`. If `git commit` reports `index.lock`, wait two seconds and try again.
- Commits end with the attribution lines given in the session; one pull request for D2, merged after GitGuardian passes (`gh pr merge N --merge`).

## Review Focus

1. **A data mirror without the flight file** (R2 before the next upload, or an old offline copy): the arrival loads, flies and lands as in D1, with round, faded edges and no error on the page. Test in Task 2.
2. **A view from the ground across a level's ring** (the stand view facing hills 4 to 5 km or 16 to 20 km away): no line, step or seam where one level's light or shadow fades into the next. Frames in Task 10; the uniforms tested in Task 5.
3. **A rock seen from any side, by day and at night:** no face pair parallel, no outline a rectangle, never floating. Tests in Task 6.
4. **The lander zoomed in, backlit:** no part brighter than the bloom threshold but the lit power light, and its shadow on the ground the shape that is drawn. Tests in Task 7.
5. **The next-step row at 768 to 1279 px** (where the Turn to row sits above the time bar): the row wraps inside the plate and never covers More or the scene's labels. Measured in Task 10; classes tested in Task 9.

## File map

| File | Task | What changes |
|---|---|---|
| `pipeline/lunar_pipeline/terrain3d.py`, `pipeline/tests/test_terrain3d.py` | 1 | `FLIGHT_PX`, `FLIGHT_SITES`, `write_site_flight`, manifest version 3 with `flight` |
| `web/src/lib/data/terrain.ts`, `terrain.test.ts` | 2 | `flight` in the manifest entry, `flightFileFor`, `kind: 'flight'` |
| `web/src/lib/sky/terrainField.ts`, `terrainField.test.ts` | 2 | `TerrainField.flight`, built by `terrainField(levels, lonDeg, siteHeightM, flight)` |
| `web/src/components/home/ArrivalCanvas.tsx`, `ArrivalCanvas.test.tsx` | 2 | the loader fetches the flight level; `arrivalScene` passes it |
| `web/src/lib/sky/groundLevels.ts` (new), `groundLevels.test.ts` (new) | 3, 4, 5 | the measured ground's meshes and materials, moved from `buildScene`; per-mesh slots; the flight level; round cuts and rings |
| `web/src/lib/sky/landerMesh.ts` (new) | 3, 7 | `buildLander` and its textures, moved from `standRenderer.ts`; then its new parts |
| `web/src/lib/sky/standRenderer.ts`, `standRenderer.test.ts` | 3, 4, 8 | uses the two modules; the night lights |
| `web/src/lib/sky/shadowRule.ts`, `shaders.ts`, `shaders.test.ts` | 4, 5, 8 | heights read from a slot on; per-pixel slopes; the ring's two marches in one loop; the sky's night light |
| `web/src/lib/sky/boulders.ts`, `boulders.test.ts` | 6 | stones cut by planes in random directions, rounded, bedded deeper |
| `web/src/lib/sky/landerShape.ts`, `landerShape.test.ts` | 7 | the new parts' shadow shapes |
| `web/src/lib/viz/stand.ts`, `stand.test.ts` | 9 | `betterLabel`'s short form |
| `web/src/components/stand/StandView.tsx`, `StandView.test.tsx` | 9 | the next-step row; the card's gold and forecast link from 768 px hidden |
| `docs/superpowers/specs/2026-10-02-immersive-space-design.md`, `web/README.md`, `web/public/validation/tests.json` | 11 | spec 17 as built, the README, the badge |

## Waves

- **Wave 1, in parallel:** Task 1 (subagent, pipeline) and Task 9 (subagent, the page); Task 2 then Task 3 in the main session.
- **Wave 2, in parallel:** Task 6 (subagent, `boulders.ts`) and Task 7 (subagent, `landerMesh.ts` and `landerShape.ts`, after Task 3 has moved the lander); Tasks 4, 5 and 8 in the main session, in that order.
- **Then:** Task 10 (checks and the blind read) and Task 11 (docs, final review, pull request).

---

### Task 1: The pipeline cuts the flight level (subagent)

**Files:**
- Modify: `pipeline/lunar_pipeline/terrain3d.py`
- Test: `pipeline/tests/test_terrain3d.py`

**Interfaces:**
- Consumes: `window_heights(grid, row0, col0, size, fill)`, `_write_raster(path, heights, meta)`, `GRID_FILES`, `home_assets.HERO_SITE` (`"de_gerlache_rim_2"`).
- Produces: `FLIGHT_PX = 1024`, `FLIGHT_SITES = ("de_gerlache_rim_2",)`, `write_site_flight(site, grids, out_dir) -> Path` writing `<site>.flight.u16` and `<site>.flight.json` (kind `"flight"`, level `"L2"`, `cell_m` 240); the manifest's version 3, whose window entry for a flight site carries `"flight": {"file", "meta", "cell_m", "width", "height"}` (Task 2 reads it).

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_terrain3d.py`:

```python
def test_write_site_flight_cuts_240_m_round_the_site(synthetic_grid_factory, tmp_path):
    from lunar_pipeline.terrain3d import FLIGHT_PX, write_site_flight

    grids = {"L0": synthetic_grid_factory(256, 20.0), "L1": synthetic_grid_factory(256, 80.0), "L2": synthetic_grid_factory(2048, 240.0, fill_dn=300)}
    site = Site(id="hero", name="Hero", lat=-88.28, lon=-64.31, category="test", polar=True, source="test")
    path = write_site_flight(site, grids, tmp_path)
    assert path.name == "hero.flight.u16"
    meta = json.loads(path.with_suffix(".json").read_text())
    assert meta["kind"] == "flight" and meta["level"] == "L2" and meta["cell_m"] == 240.0
    assert meta["width"] == meta["height"] == FLIGHT_PX
    assert abs(meta["site_col_px"] - FLIGHT_PX // 2) <= 1 and abs(meta["site_row_px"] - FLIGHT_PX // 2) <= 1
    heights = np.frombuffer(zlib.decompress(path.read_bytes()), dtype="<u2")
    assert heights.size == FLIGHT_PX * FLIGHT_PX
    # 300 DN at 0.5 m a unit: the whole cut lies inside the synthetic grid, so every cell is measured.
    assert meta["fill_px"] == 0
    assert meta["min_m"] == pytest.approx(150.0) and meta["max_m"] == pytest.approx(150.0)


def test_flight_sites_are_the_arrivals():
    from lunar_pipeline.home_assets import HERO_SITE
    from lunar_pipeline.terrain3d import FLIGHT_SITES

    assert FLIGHT_SITES == (HERO_SITE,)


@pytest.mark.data
@needs_lola
def test_write_all_names_the_flight_level_of_the_arrivals_site(tmp_path):
    manifest = json.loads(write_all(tmp_path).read_text())
    assert manifest["version"] == 3
    hero = next(w for w in manifest["windows"] if w["site_id"] == "de_gerlache_rim_2")
    assert hero["flight"]["file"] == "de_gerlache_rim_2.flight.u16"
    assert hero["flight"]["cell_m"] == 240.0
    assert all("flight" not in w for w in manifest["windows"] if w["site_id"] != "de_gerlache_rim_2")
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pipeline && uv run pytest tests/test_terrain3d.py -q -k "flight"`
Expected: FAIL on `ImportError: cannot import name 'FLIGHT_PX'` (the data test is skipped without the LOLA files, or fails the same way with them).

- [ ] **Step 3: Write the flight level**

In `pipeline/lunar_pipeline/terrain3d.py`, after `CONTEXT_PX`:

```python
FLIGHT_PX = 1024  # 245.76 km at 240 m round the arrival's site: from 900 to 90 km up the measured ground stays sharp
FLIGHT_SITES = ("de_gerlache_rim_2",)  # the home page's arrival (home_assets.HERO_SITE)
```

After `write_site_context`:

```python
def write_site_flight(site: Site, grids: dict[str, LolaGrid], out_dir: Path) -> Path:
    """The 240 m flight level centred on a site, at the grid's full resolution (the cap takes it by 4).

    The home page's arrival flies over it from 900 to 90 km up, where the 960 m cap reads soft.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    grid = grids["L2"]
    col, row = grid.pixel_from_latlon(site.lat, site.lon)
    row0 = round(float(row)) - FLIGHT_PX // 2
    col0 = round(float(col)) - FLIGHT_PX // 2
    heights, n_fill = window_heights(grid, row0, col0, FLIGHT_PX)
    meta = {
        "site_id": site.id,
        "lat": site.lat,
        "lon": site.lon,
        "kind": "flight",
        "source": f"{GRID_FILES['L2']}.img",
        "level": "L2",
        "cell_m": grid.label.map_scale_m,
        "row0": row0,
        "col0": col0,
        "line_offset_px": grid.label.line_offset_px,
        "sample_offset_px": grid.label.sample_offset_px,
        "site_row_px": float(row) - row0,
        "site_col_px": float(col) - col0,
        "site_height_m": float(grid.value_at(site.lat, site.lon)),
        "fill_source": None,
        "fill_px": n_fill,
    }
    return _write_raster(out_dir / f"{site.id}.flight.u16", heights, meta)
```

In `write_all`, after the `context` block inside the loop:

```python
        if site.id in FLIGHT_SITES:
            flight = write_site_flight(site, grids, out_dir)
            fmeta = json.loads(flight.with_suffix(".json").read_text())
            entry["flight"] = {
                "file": flight.name,
                "meta": flight.with_suffix(".json").name,
                "cell_m": fmeta["cell_m"],
                "width": fmeta["width"],
                "height": fmeta["height"],
            }
```

and set `"version": 3` in the manifest.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd pipeline && uv run pytest tests/test_terrain3d.py -q`
Expected: PASS (the data tests run when `data_raw/lola` holds the LOLA files, as on this laptop).

- [ ] **Step 5: Write the data and check it**

Run: `cd pipeline && uv run python -m lunar_pipeline.cli terrain` (writes every window, the cap and the new flight file into `data_out/terrain`, about 30 MB). Then copy the terrain folder alone into the web's data (not `sync-local --tiles`, which would copy 238 MB of tiles):
Run: `python -c "import shutil; shutil.copytree('data_out/terrain', 'web/public/data/terrain', dirs_exist_ok=True)"` from the repo root.
Run: `python -c "import json; m=json.load(open('web/public/data/terrain/manifest.json')); w=[x for x in m['windows'] if x['site_id']=='de_gerlache_rim_2'][0]; print(m['version'], w['flight'])"`
Expected: `3 {'file': 'de_gerlache_rim_2.flight.u16', 'meta': 'de_gerlache_rim_2.flight.json', 'cell_m': 240.0, 'width': 1024, 'height': 1024}`, and the `.u16` under 3 MB. `data_out` and `web/public/data` are not in git: nothing to commit from them.

- [ ] **Step 6: Commit**

Run: `cd pipeline && uv run pytest -q` (the whole pipeline suite; `git checkout -- data/fixtures/horizons/summary.json` afterwards if pytest rewrote it with CRLF).

```bash
git add pipeline/lunar_pipeline/terrain3d.py pipeline/tests/test_terrain3d.py
git commit -m "feat(pipeline): a 240 m flight level round the arrival's site, named in the terrain manifest (version 3)"
```

---

### Task 2: The web loads the flight level beside the ground (main session)

**Files:**
- Modify: `web/src/lib/data/terrain.ts`, `web/src/lib/sky/terrainField.ts`, `web/src/components/home/ArrivalCanvas.tsx`
- Test: `web/src/lib/data/terrain.test.ts`, `web/src/lib/sky/terrainField.test.ts`, `web/src/components/home/ArrivalCanvas.test.tsx`

**Interfaces:**
- Consumes: Task 1's manifest entry `flight: { file, meta, cell_m, width, height }` and sidecar `kind: "flight"`.
- Produces:
  - `flightFileFor(manifest: TerrainManifest, siteId: string): { file: string; meta: string } | null`;
  - `loadFlight(base: string, manifest: TerrainManifest, siteId: string): Promise<Heightmap | null>` (null without an entry or when the file fails to load);
  - `flightLevel(flight: Heightmap | null): Level | null`;
  - `TerrainField.flight?: FieldLevel`, from `terrainField(levels: Level[], lonDeg: number, siteHeightM: number, flight: Level | null = null)`; `heightAt`, `meshHeightAt` and `cellAt` never read it;
  - `ArrivalLoaders.terrain` resolving `{ cap, window, context, flight }` (`flight: Heightmap | null`), and `arrivalScene(h, sky, globe, levels, flight: Level | null = null)`.

- [ ] **Step 1: Write the failing tests**

In `web/src/lib/data/terrain.test.ts`, add `flightFileFor`, `flightLevel` and `loadFlight` to the import from `./terrain`, then add after the `contextFileFor` block:

```ts
describe('flightFileFor', () => {
  const manifest = {
    version: 3,
    windows: [
      { site_id: 'hero', lat: -88.28, lon: -64.31, file: 'hero.u16', meta: 'hero.json', level: 'L0', cell_m: 20, width: 4, height: 4, bytes: 1, flight: { file: 'hero.flight.u16', meta: 'hero.flight.json', cell_m: 240, width: 4, height: 4 } },
      { site_id: 'deep', lat: -89.5, lon: 0, file: 'deep.u16', meta: 'deep.json', level: 'L0', cell_m: 20, width: 4, height: 4, bytes: 1 },
    ],
    cap: { file: 'south_cap.u16', meta: 'south_cap.json' },
    globe_texture: 'lroc_color_2k.jpg',
  } satisfies TerrainManifest;
  it('names the flight level of the arrival’s site, and nothing for any other site', () => {
    expect(flightFileFor(manifest, 'hero')).toEqual({ file: 'hero.flight.u16', meta: 'hero.flight.json' });
    expect(flightFileFor(manifest, 'deep')).toBeNull();
    expect(flightFileFor(manifest, 'nowhere')).toBeNull();
  });
  it('turns a loaded flight level into a shadow level with its own site pixel, and nothing into nothing', () => {
    const hm: Heightmap = {
      meta: { site_id: 'hero', lat: -88.28, lon: -64.31, kind: 'flight', source: 's', level: 'L2', cell_m: 240, width: 4, height: 4, row0: 0, col0: 0, min_m: 0, max_m: 0, scale_m_per_unit: 1, site_height_m: 0, line_offset_px: 0, sample_offset_px: 0, site_row_px: 1.5, site_col_px: 2.25 },
      heightsM: new Float32Array(16).fill(7),
    };
    expect(flightLevel(hm)).toMatchObject({ width: 4, height: 4, pxM: 240, siteCol: 2.25, siteRow: 1.5 });
    expect(flightLevel(null)).toBeNull();
  });
});
```

In the `'terrain loaders over HTTP'` block, add:

```ts
  it('loads the arrival’s flight level when the data has it, and gives null for a mirror without the file', async () => {
    const manifest = await loadTerrainManifest(base);
    const hero = manifest.windows.find((w) => w.site_id === 'de_gerlache_rim_2');
    if (hero?.flight) {
      const hm = await loadFlight(base, manifest, 'de_gerlache_rim_2');
      expect(hm?.meta.kind).toBe('flight');
      expect(hm?.meta.cell_m).toBe(240);
      const { lat, lon } = pixelToLatLon(hm!.meta, hm!.meta.site_col_px, hm!.meta.site_row_px);
      expect(Math.abs(lat - hm!.meta.lat)).toBeLessThan(1e-3);
      expect(Math.abs(lon - hm!.meta.lon)).toBeLessThan(1e-3);
    }
    const missing = { ...manifest, windows: manifest.windows.map((w) => (w.site_id === 'de_gerlache_rim_2' ? { ...w, flight: { file: 'gone.u16', meta: 'gone.json', cell_m: 240, width: 1, height: 1 } } : w)) };
    await expect(loadFlight(base, missing, 'de_gerlache_rim_2')).resolves.toBeNull();
    await expect(loadFlight(base, manifest, 'shackleton_center')).resolves.toBeNull();
  });
```

In `web/src/lib/sky/terrainField.test.ts`, add:

```ts
  it('keeps the flight level apart: it is converted like the levels, and no height is read from it', () => {
    const coarse = level(41, 41, 100, () => 500);
    const fine = level(21, 21, 20, () => 510);
    const flight = level(31, 31, 240, () => 900);
    const f = terrainField([coarse, fine], 0, 500, flight);
    expect(f.flight).toMatchObject({ cols: 31, rows: 31, cell: 240 });
    expect(f.flight!.heights[15 * 31 + 15]).toBeCloseTo(400, 3); // 900 m less the site's 500, at the site
    expect(heightAt(f, 1500, 0)).toBeCloseTo(0 - 1500 ** 2 / (2 * 1737400), 3); // still the coarse level
    expect(terrainField([coarse, fine], 0, 500).flight).toBeUndefined();
  });
```

In `web/src/components/home/ArrivalCanvas.test.tsx`, add inside `describe('the arrival’s live stage', …)`:

```ts
  it('hands the renderer the flight level with the ground when the data has one, and the ground alone when not', async () => {
    const flight = () => ({ meta: { width: 64, height: 64, cell_m: 240, site_col_px: 31.5, site_row_px: 31.5, site_height_m: 0, row0: 0, col0: 0, line_offset_px: 31.5, sample_offset_px: 31.5, min_m: 0, scale_m_per_unit: 1 }, heightsM: new Float32Array(64 * 64) });
    for (const withFlight of [true, false]) {
      const { r, scenes } = stub();
      const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: async () => ({ cap: cap() as never, window: null, context: null, flight: withFlight ? (flight() as never) : null }) };
      const { unmount } = render(<ArrivalCanvas progress={{ current: 0 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      await waitFor(() => expect(scenes).toHaveLength(1));
      expect(scenes[0].ground).toBe(true);
      if (withFlight) expect(scenes[0].field.flight).toMatchObject({ cols: 64, rows: 64, cell: 240 });
      else expect(scenes[0].field.flight).toBeUndefined();
      unmount();
    }
  });
```

Also change line 68's `landTerrain({ cap: cap() as never, window: null, context: null });` to `landTerrain({ cap: cap() as never, window: null, context: null, flight: null });`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/data/terrain.test.ts src/lib/sky/terrainField.test.ts src/components/home/ArrivalCanvas.test.tsx --maxWorkers=2`
Expected: FAIL: `flightFileFor is not a function` (and the others for `flight` being undefined).

- [ ] **Step 3: Write the code**

`web/src/lib/data/terrain.ts`:
- `kind: 'window' | 'cap' | 'context' | 'flight';` in `HeightmapMeta`.
- In `TerrainWindowEntry`, after `context?`:

```ts
  /** For the home page's arrival site: the 240 m flight level round it (manifest version 3), sharp from 900 to 90 km up. */
  flight?: { file: string; meta: string; cell_m: number; width: number; height: number };
```

- After `contextFileFor`:

```ts
/** Raster and sidecar file names of the 240 m flight level round a site, or null when there is none (all but the arrival's site). */
export function flightFileFor(manifest: TerrainManifest, siteId: string): { file: string; meta: string } | null {
  const flight = manifest.windows.find((w) => w.site_id === siteId)?.flight;
  return flight ? { file: flight.file, meta: flight.meta } : null;
}

/** The flight level, or null without one or when it fails to load: a mirror without the file draws the arrival as before. */
export async function loadFlight(base: string, manifest: TerrainManifest, siteId: string): Promise<Heightmap | null> {
  const f = flightFileFor(manifest, siteId);
  return f ? loadHeightmap(base, f.file, f.meta).catch(() => null) : null;
}

/** A loaded flight level as a shadow level with its own site pixel, or null. */
export const flightLevel = (flight: Heightmap | null): Level | null => (flight ? toLevel(flight) : null);
```

(`toLevel` is defined above `shadowLevels`; move `flightLevel` below it.)

`web/src/lib/sky/terrainField.ts`:

```ts
/** The ground around the site, finest level first; `lonDeg` turns the polar grid into the site's compass. `flight`: a finer far level for views from above (the arrival), drawn but never read for a height. */
export interface TerrainField { levels: FieldLevel[]; lonDeg: number; flight?: FieldLevel }
```

and `terrainField` becomes:

```ts
/** The shadow levels (coarse to fine, as `shadowLevels` returns them) as site-frame heights, finest first; `flight` converted alike, kept apart. */
export function terrainField(levels: Level[], lonDeg: number, siteHeightM: number, flight: Level | null = null): TerrainField {
  const toField = (l: Level): FieldLevel => {
    const heights = new Float32Array(l.width * l.height);
    for (let r = 0; r < l.height; r++) {
      for (let c = 0; c < l.width; c++) {
        const mx = (c - l.siteCol) * l.pxM, my = -(r - l.siteRow) * l.pxM, z = Number(l.heights[r * l.width + c]);
        heights[r * l.width + c] = Number.isFinite(z) ? z - siteHeightM - (mx * mx + my * my) / (2 * R_MOON_M) : OUTSIDE;
      }
    }
    return { cols: l.width, rows: l.height, cell: l.pxM, siteCol: l.siteCol, siteRow: l.siteRow, heights };
  };
  const out: TerrainField = { levels: levels.map(toField).reverse(), lonDeg };
  if (flight) out.flight = toField(flight);
  return out;
}
```

`web/src/components/home/ArrivalCanvas.tsx`:
- import `flightLevel, loadFlight` from `@/lib/data/terrain`.
- `terrain: () => Promise<{ cap: Heightmap; window: Heightmap | null; context: Heightmap | null; flight: Heightmap | null }>;`
- In `browserArrivalLoaders`, the terrain loader:

```ts
    terrain: async () => {
      const m = await loadTerrainManifest(base), w = windowFileFor(m, siteId), c = contextFileFor(m, siteId);
      const [cap, window, context, flight] = await Promise.all([
        loadHeightmap(base, m.cap.file, m.cap.meta),
        w ? loadHeightmap(base, w.file, w.meta) : Promise.resolve(null),
        c ? loadHeightmap(base, c.file, c.meta).catch(() => null) : Promise.resolve(null),
        loadFlight(base, m, siteId),
      ]);
      return { cap, window, context, flight };
    },
```

- `export function arrivalScene(h: Hero, sky: SkyAssets, globe: GlobeAssets, levels: Level[] | null, flight: Level | null = null): StandScene` with `field: ground ? terrainField(levels!, h.site.lon, h.siteHeightM, flight) : flatField(h.site.lon),`.
- The component keeps the flight level beside the levels: `const [ground, setGround] = useState<{ levels: Level[]; flight: Level | null } | null>(null);` replaces the `levels` state; the terrain effect sets `setGround({ levels: shadowLevels(h.site, t.window, t.context, t.cap, ARRIVAL_CAP_HALF_PX), flight: flightLevel(t.flight) })`, and the scene memo calls `arrivalScene(h, sky, globe, ground?.levels ?? null, ground?.flight ?? null)` with `ground` in its dependencies. Rename every other use of `levels` in the component accordingly (search the file for `levels`).

- [ ] **Step 4: Run them to see them pass**

Run: `cd web && npx vitest run src/lib/data/terrain.test.ts src/lib/sky/terrainField.test.ts src/components/home --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/data/terrain.ts web/src/lib/data/terrain.test.ts web/src/lib/sky/terrainField.ts web/src/lib/sky/terrainField.test.ts web/src/components/home/ArrivalCanvas.tsx web/src/components/home/ArrivalCanvas.test.tsx
git commit -m "feat(web): the arrival loads the 240 m flight level beside its ground, and flies as before without it"
```

---

### Task 3: The measured ground and the lander get modules of their own (main session)

A move with no change in behaviour, so Tasks 4, 5 and 8 (the ground) and Task 7 (the lander, a subagent) touch different files. `standRenderer.ts` is 1542 lines.

**Files:**
- Create: `web/src/lib/sky/groundLevels.ts`, `web/src/lib/sky/groundLevels.test.ts`, `web/src/lib/sky/landerMesh.ts`, `web/src/lib/sky/landerMesh.test.ts`
- Modify: `web/src/lib/sky/standRenderer.ts`

**Interfaces:**
- Consumes: `GROUND_VERT`, `GROUND_FRAG` (`shaders.ts`); `SHADOW`, `SHADOW_FAST` (`shadowRule.ts`); `BOULDERS` (`boulders.ts`); `worldOf`, `meshHeightAt`, `FieldLevel`, `TerrainField` (`terrainField.ts`); `LANDER`, `LEG_ENDS` (`landerShape.ts`); `dirAzEl`, `Vec3` (`frames.ts`).
- Produces:
  - `groundLevels.ts`: `export function buildGround(field: TerrainField, o: { fast: boolean; flight: boolean; halfFloat: boolean; viewerY: number }): { meshes: THREE.Mesh[]; cap: THREE.Mesh | null; capRing: THREE.Mesh | null }` (finest mesh first, the cap's ring last in flight), plus `toTextureHeights` and `meshReachM`, moved with it (`standRenderer.ts` re-exports `toTextureHeights` so its test's import stands);
  - `landerMesh.ts`: `export function buildLander(azDeg: number, distM: number, faceAzDeg: number, earthAzDeg: number, earthElDeg: number): { group: THREE.Group; lamp: THREE.MeshBasicMaterial; panel: THREE.Mesh; dish: THREE.Group; lampPos: THREE.Vector3 }`, with `foilTexture`, `panelBackTexture` and `cellsTexture`. It no longer sets the draw order: `buildScene` gives every mesh in the group `ORDER.LANDER`, as before.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/sky/groundLevels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGround } from './groundLevels';
import { flatField, terrainField } from './terrainField';

/** Three square levels of constant height, coarse to fine, as `shadowLevels` returns them. */
function levels() {
  const level = (n: number, cell: number, h: number) => ({ heights: new Float32Array(n * n).fill(h), width: n, height: n, pxM: cell, siteCol: (n - 1) / 2, siteRow: (n - 1) / 2 });
  return [level(481, 960, 100), level(512, 80, 100), level(1024, 20, 100)];
}
const u = (m: THREE.Mesh) => (m.material as THREE.ShaderMaterial).uniforms;

describe('the measured ground', () => {
  it('builds one mesh a level, finest first, the cap last, with the near detail on the finest alone', () => {
    const g = buildGround(terrainField(levels(), -64.31, 100), { fast: false, flight: false, halfFloat: false, viewerY: 2 });
    expect(g.meshes).toHaveLength(3);
    expect(g.cap).toBe(g.meshes[2]);
    expect(g.capRing).toBeNull();
    expect(g.meshes.map((m) => u(m).uDetail.value)).toEqual([1, 0, 0]);
    expect(u(g.meshes[0]).uViewer.value.y).toBe(2);
  });

  it('adds the cap’s coarser ring in flight, and flat ground on the curved Moon without levels', () => {
    const fly = buildGround(terrainField(levels(), 0, 100), { fast: false, flight: true, halfFloat: false, viewerY: 2 });
    expect(fly.meshes).toHaveLength(4);
    expect(fly.capRing).toBe(fly.meshes[3]);
    const flat = buildGround(flatField(0), { fast: false, flight: false, halfFloat: false, viewerY: 2 });
    expect(flat.meshes).toHaveLength(1);
    expect(flat.cap).toBeNull();
  });
});
```

`web/src/lib/sky/landerMesh.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLander } from './landerMesh';

describe('the lander’s mesh', () => {
  it('stands distM from the eye towards its azimuth, turned so its +x face looks towards faceAzDeg, with a lamp and a dish', () => {
    const l = buildLander(90, 16, 0, 70, 4);
    expect(l.group.position.x).toBeCloseTo(16, 6);
    expect(l.group.position.z).toBeCloseTo(0, 6);
    expect(l.group.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    expect(l.lamp).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(l.group.children).toContain(l.dish);
    expect(l.group.getObjectByName('bell')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky/groundLevels.test.ts src/lib/sky/landerMesh.test.ts --maxWorkers=2`
Expected: FAIL: `Failed to resolve import "./groundLevels"` and `"./landerMesh"`.

- [ ] **Step 3: Move the code**

- `groundLevels.ts`: move from `standRenderer.ts`, unchanged: `HALF_OUTSIDE`, `toTextureHeights`, `heightTexture`, `groundMesh`, `STAND_REACH_M`, `FLIGHT_REACH_M`, `RING_REACH_M` and `meshReachM` (export the reaches `standRenderer.ts` still reads: `STAND_REACH_M`), and the body of `buildScene` from `// The measured ground: up to three levels …` to `ground.forEach((g) => root.add(g));` exclusive, as `buildGround`. Its inputs replace `scene.field` with `field`, `fast` with `o.fast`, `flight` with `o.flight`, `opts.halfFloat` with `o.halfFloat`, and `meshHeightAt(scene.field, 0, 0)` in `uViewer` with `o.viewerY`. It returns `{ meshes: ground, cap, capRing }`.
- `standRenderer.ts`: `const { meshes: ground, cap, capRing } = buildGround(scene.field, { fast, flight, halfFloat: opts.halfFloat ?? false, viewerY: meshHeightAt(scene.field, 0, 0) });` where the moved block was; `export { toTextureHeights } from './groundLevels';`; import `STAND_REACH_M` from it.
- `landerMesh.ts`: move `surface`, `foilTexture`, `panelBackTexture`, `cellsTexture` and `buildLander` unchanged, but for the last `group.traverse(…renderOrder…)`, which `buildScene` now runs on `lander.group` right after `buildLander` returns.
- Remove the moved imports from `standRenderer.ts` that it no longer uses (`npx tsc --noEmit` and `npm run lint` say which).

- [ ] **Step 4: Run them to see them pass, and the scene's tests with them**

Run: `cd web && npx vitest run src/lib/sky src/components/stand src/components/home --maxWorkers=2`
Expected: PASS, the same count as before plus 3.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/groundLevels.ts web/src/lib/sky/groundLevels.test.ts web/src/lib/sky/landerMesh.ts web/src/lib/sky/landerMesh.test.ts web/src/lib/sky/standRenderer.ts
git commit -m "refactor(web): the measured ground and the lander move out of the stand renderer into modules of their own"
```

---

### Task 4: Each mesh reads its own height slots, and the flight level draws in flight (main session)

Today every mesh's material holds the same three textures (window, context, cap) and skips the finer ones by `uMinLevel`. A fourth level would need a fourth texture in every material. Instead each mesh gets its own three slots: its own level first, then the next one, and the cap last, so far hills always shade it. The window keeps (window, context, cap), the context gets (context, flight, cap) in flight, the flight level (flight, cap), the cap (cap). The shader keeps three slots, and `heightAt` reads from a slot on.

**Files:**
- Modify: `web/src/lib/sky/groundLevels.ts`, `web/src/lib/sky/shadowRule.ts`, `web/src/lib/sky/shaders.ts`
- Test: `web/src/lib/sky/groundLevels.test.ts`, `web/src/lib/sky/shaders.test.ts`, `web/src/lib/sky/standRenderer.test.ts`

**Interfaces:**
- Consumes: `TerrainField.flight` (Task 2), `buildGround` (Task 3).
- Produces:
  - GLSL in `SHADOW_GLSL`: `float heightAt(vec2 xz, int from)`, `float cellAt(vec2 xz, int from)` (the first slot at `from` or later that holds the point), `vec3 slopeNormal(sampler2D t, vec3 L, vec2 S, vec2 m, float k)` (the ground's normal from one slot's heights, its slope taken across `k` cells either way); `uMinLevel` is gone;
  - a ground material's uniforms gain `uPixel` (1: the light's normal from the slot-0 heights, per pixel);
  - `buildGround` in flight with `field.flight` returns the meshes window, context, flight, cap, then the cap's ring.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/lib/sky/groundLevels.test.ts` (inside the describe):

```ts
  /** The cell sizes in a mesh's three slots, by its uniforms, for as many slots as it has. */
  const slots = (m: THREE.Mesh) => [u(m).uL0.value.z, u(m).uL1.value.z, u(m).uL2.value.z].slice(0, u(m).uLevels.value);
  const flightLevel = () => ({ heights: new Float32Array(1024 * 1024).fill(100), width: 1024, height: 1024, pxM: 240, siteCol: 511.5, siteRow: 511.5 });

  it('gives each mesh its own height slots: its level, the next, and the cap last, so far hills always shade it', () => {
    const g = buildGround(terrainField(levels(), 0, 100), { fast: false, flight: false, halfFloat: false, viewerY: 2 });
    expect(g.meshes.map(slots)).toEqual([[20, 80, 960], [80, 960], [960]]);
    expect(g.meshes.map((m) => u(m).uPixel.value)).toEqual([0, 0, 0]);
    // One texture for each level, shared by every mesh that reads it.
    expect(u(g.meshes[0]).uH2.value).toBe(u(g.meshes[2]).uH0.value);
  });

  it('draws the flight level in flight between the context and the cap, at every other cell, its light from per-pixel slopes', () => {
    const field = terrainField(levels(), 0, 100, flightLevel());
    const g = buildGround(field, { fast: false, flight: true, halfFloat: false, viewerY: 2 });
    expect(g.meshes).toHaveLength(5);
    expect(g.meshes.slice(0, 4).map(slots)).toEqual([[20, 80, 960], [80, 240, 960], [240, 960], [960]]);
    expect(g.cap).toBe(g.meshes[3]);
    expect(g.capRing).toBe(g.meshes[4]);
    expect(g.meshes.map((m) => u(m).uPixel.value)).toEqual([0, 0, 1, 0, 0]);
    const p = g.meshes[2].geometry.getAttribute('position');
    let reach = 0;
    for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.abs(p.getX(i)), Math.abs(p.getZ(i)));
    expect(reach).toBeGreaterThan(115000);
    expect(Math.hypot(p.getX(1) - p.getX(0), p.getZ(1) - p.getZ(0))).toBeCloseTo(480, 3);
    // Standing (the stand view), the flight level is never drawn.
    expect(buildGround(field, { fast: false, flight: false, halfFloat: false, viewerY: 2 }).meshes).toHaveLength(3);
  });
```

Append to `web/src/lib/sky/shaders.test.ts` (inside `describe('the ground shader', …)`; add `SHADOW_GLSL` to the import from `./shadowRule`):

```ts
  it('reads heights from a slot on, each mesh from its own, and takes the flight level’s light from per-pixel slopes of its heights', () => {
    expect(SHADOW_GLSL).toMatch(/float heightAt\(vec2 xz, int from\)/);
    expect(SHADOW_GLSL).toMatch(/float cellAt\(vec2 xz, int from\)/);
    expect(SHADOW_GLSL).toMatch(/vec3 slopeNormal\(sampler2D t, vec3 L, vec2 S, vec2 m, float k\)/);
    expect(SHADOW_GLSL).not.toContain('uMinLevel');
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(main).toContain('if (uPixel > 0.5) N0 = slopeNormal(uH0, uL0, uS0, m, 1.0);');
  });
```

In `web/src/lib/sky/standRenderer.test.ts`, delete the test `'traces each mesh’s shadows in its own level or coarser ones, so the coarse ground never meets the fine heights it does not show'`: its rule is now the slots test above.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky/groundLevels.test.ts src/lib/sky/shaders.test.ts --maxWorkers=2`
Expected: FAIL: `uPixel` undefined, the slots `[20, 80, 960]` for every mesh, and the shader patterns missing.

- [ ] **Step 3: Write the code**

`web/src/lib/sky/shadowRule.ts`, in `SHADOW_GLSL`: drop `uMinLevel` from the `uniform int` line, and replace `heightAt` and `cellAt` with:

```glsl
// The first of the mesh's slots, from \`from\` on, that holds the point: slot 0 is the mesh's own level, then the next,
// then the cap, so a coarse mesh never meets fine heights it does not show.
float heightAt(vec2 xz, int from) {
  vec2 m = toMap(xz); bool ins; float h;
  if (uLevels == 0) return -dot(m, m) / (2.0 * 1737400.0);
  if (from <= 0) { h = lev(uH0, uL0, uS0, m, ins); if (ins) return h; }
  if (uLevels > 1 && from <= 1) { h = lev(uH1, uL1, uS1, m, ins); if (ins) return h; }
  if (uLevels > 2) { h = lev(uH2, uL2, uS2, m, ins); if (ins) return h; }
  return -1.0e6;
}
float cellAt(vec2 xz, int from) {
  vec2 m = toMap(xz); bool ins;
  if (uLevels == 0) return 20.0;
  if (from <= 0) { lev(uH0, uL0, uS0, m, ins); if (ins) return uL0.z; }
  if (uLevels > 1 && from <= 1) { lev(uH1, uL1, uS1, m, ins); if (ins) return uL1.z; }
  return uLevels > 2 ? uL2.z : (uLevels > 1 ? uL1.z : uL0.z);
}
// The ground's normal in the world from one slot's heights (map metres m), its slope taken across k cells either way.
vec3 slopeNormal(sampler2D t, vec3 L, vec2 S, vec2 m, float k) {
  bool ins; float c = L.z * k;
  float gx = (lev(t, L, S, m + vec2(c, 0.0), ins) - lev(t, L, S, m - vec2(c, 0.0), ins)) / (2.0 * c);
  float gy = (lev(t, L, S, m + vec2(0.0, c), ins) - lev(t, L, S, m - vec2(0.0, c), ins)) / (2.0 * c);
  // The map's slope turned into the world as worldOf turns map metres: x = mx cos - my sin, z = -(mx sin + my cos).
  vec2 g = vec2(gx * uCS.x - gy * uCS.y, -(gx * uCS.y + gy * uCS.x));
  return normalize(vec3(-g.x, 1.0, -g.y));
}
```

(The template literal is in a `.ts` file: write the backtick in the comment as a plain word, `from on`, not as escaped backticks.) In `sunMargin`, call `cellAt(p.xz, 0)` and `heightAt(p.xz + dir * t, 0)`. Update the doc comment above `SHADOW_GLSL`: "`uMinLevel` is the level of the mesh being drawn …" becomes "Each mesh's three slots start at its own level (groundLevels.ts), so its rays read that level and coarser ones only."

`web/src/lib/sky/shaders.ts`, in `GROUND_FRAG`: add `uPixel` to the `uniform float` list on the second uniform line, and right after `vec3 N0 = normalize(vNormal), Nn = N0;` put:

```glsl
  // The flight level's light from its own heights, per pixel: its mesh, at every other cell, would soften the relief.
  if (uPixel > 0.5) N0 = slopeNormal(uH0, uL0, uS0, m, 1.0);
  Nn = N0;
```

`web/src/lib/sky/groundLevels.ts`:
- One texture a level, cached: `const textures = new Map<FieldLevel, THREE.DataTexture>(); const texOf = (l: FieldLevel) => textures.get(l) ?? (textures.set(l, heightTexture(l, o.halfFloat)), textures.get(l)!);` and one 1-by-1 stand-in, `const none = heightTexture(undefined, false);`.
- `material(detail: boolean, hole: number, order: number, slots: FieldLevel[], pixel = false)`: the uniforms `uH0`…`uH2` are `texOf(slots[i])` or `none`; `uL0`…`uL2` are `new THREE.Vector3(slots[i]?.siteCol ?? 0, slots[i]?.siteRow ?? 0, slots[i]?.cell ?? 1)`; `uS0`…`uS2` `new THREE.Vector2(slots[i]?.cols ?? 1, slots[i]?.rows ?? 1)`; `uLevels: slots.length`; `uPixel: { value: pixel ? 1 : 0 }`; no `uMinLevel`. `polygonOffset: order > 0, polygonOffsetFactor: order, polygonOffsetUnits: order * 4`, as before with the order in place of the level.
- The drawn list, finest first: `const drawn = field.levels.slice(0, 3); const flightLevel = o.flight ? field.flight : undefined; const list = flightLevel ? [...drawn.slice(0, -1), flightLevel, drawn[drawn.length - 1]] : drawn;` and each entry's slots: `const slotsOf = (k: number) => [...new Set([list[k], list[k + 1], list[list.length - 1]].filter((l): l is FieldLevel => !!l))];`.
- Each entry k draws as before (`groundMesh(l, field.lonDeg, meshReachM(l.cell, k === list.length - 1, o.flight), material(k === 0, hole, k, slotsOf(k)))`), but for the flight level, which draws at every other cell (as the cap's ring does) with per-pixel light: `groundMesh(half(l), field.lonDeg, 125000, material(false, hole, k, slotsOf(k), true))`, where `half(l)` takes every other cell: `{ cols: Math.floor((l.cols - 1) / 2) + 1, rows: Math.floor((l.rows - 1) / 2) + 1, cell: 2 * l.cell, siteCol: l.siteCol / 2, siteRow: l.siteRow / 2, heights }` with `heights[r * cols + c] = l.heights[2 * r * l.cols + 2 * c]` (the cap's ring already builds one this way: make `half` a function and use it there too). The next `hole` follows from each mesh's reach as before (`reachM - 2 * cell`, with the mesh's own cell: 480 m for the flight level).
- The cap's ring: `material(false, hole, list.length - 1, [list[list.length - 1]])` with the polygon offset one step further, as before.

- [ ] **Step 4: Run them to see them pass**

Run: `cd web && npx vitest run src/lib/sky src/components/home src/components/stand --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/groundLevels.ts web/src/lib/sky/groundLevels.test.ts web/src/lib/sky/shadowRule.ts web/src/lib/sky/shaders.ts web/src/lib/sky/shaders.test.ts web/src/lib/sky/standRenderer.test.ts
git commit -m "feat(web): each ground mesh reads its own height slots, and the 240 m flight level draws in flight with per-pixel light"
```

---

### Task 5: Round edges whose light and shadows fade into the next level (main session)

**Files:**
- Modify: `web/src/lib/sky/groundLevels.ts`, `web/src/lib/sky/shadowRule.ts`, `web/src/lib/sky/shaders.ts`
- Test: `web/src/lib/sky/groundLevels.test.ts`, `web/src/lib/sky/shaders.test.ts`, `web/src/lib/sky/standRenderer.test.ts`

**Interfaces:**
- Consumes: Task 4's slots (slot 1 is the next level) and `slopeNormal`.
- Produces:
  - `export function edgeOf(reachM: number, cellM: number): { ringIn: number; ringOut: number; cut: number }` in `groundLevels.ts`: `cut = reachM - 2 * cellM`, `ringOut = cut - cellM`, `ringIn = 0.75 * cut`;
  - a ground material's uniforms: `uHoleR` (float; the round hole where the finer level draws, replacing the square `uHole`), `uEdge` (`THREE.Vector3(ringIn, ringOut, cut)`; `(1e9, 1e9, 1e9)` for the last level and the cap's ring), `uNextStep` (the next level's slope across 2 cells, as its mesh's normals soften it, or 1 for the flight level, whose light is per pixel);
  - GLSL: `vec2 sunMargins(vec3 p, vec3 sun, bool both)`, the margins over slot 0 on (x) and, with `both`, over slot 1 on (y), in one loop; `sunMargin` and the unused GLSL `sunFraction` are gone.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/lib/sky/groundLevels.test.ts` (and add `edgeOf` to its import):

```ts
  it('cuts every level round two cells inside its nearest side, fading over the ring inside the cut into the next level, whose round hole opens a cell inside the cut', () => {
    expect(edgeOf(5000, 20)).toEqual({ ringIn: 3720, ringOut: 4940, cut: 4960 });
    const field = terrainField(levels(), 0, 100, flightLevel());
    for (const flight of [false, true]) {
      const g = buildGround(field, { fast: false, flight, halfFloat: false, viewerY: 2 });
      const n = flight ? 4 : 3;
      expect(u(g.meshes[0]).uHoleR.value).toBe(0);
      for (let k = 0; k < n - 1; k++) {
        const e = u(g.meshes[k]).uEdge.value as THREE.Vector3;
        expect(e.x).toBeLessThan(e.y);
        expect(e.y).toBeLessThan(e.z);
        expect(u(g.meshes[k + 1]).uHoleR.value).toBeCloseTo(e.y, 6);
      }
      // The cap has nothing beyond it to fade into (its far edge is uFarCut's), nor has its ring.
      expect((u(g.meshes[n - 1]).uEdge.value as THREE.Vector3).x).toBeGreaterThan(1e8);
      if (flight) expect((u(g.meshes[4]).uEdge.value as THREE.Vector3).x).toBeGreaterThan(1e8);
      // The next level's slope: across 2 cells where its mesh softens it, across 1 for the flight level's per-pixel light.
      expect(g.meshes.slice(0, n - 1).map((m) => u(m).uNextStep.value)).toEqual(flight ? [2, 1, 2] : [2, 2]);
    }
  });
```

Append to `web/src/lib/sky/shaders.test.ts`:

```ts
  it('cuts each level round and fades its edge into the next level’s light and shadows, the two shadows in one march', () => {
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(main).toMatch(/if \(rr < uHoleR \|\| rr > uEdge\.z\) discard;/);
    expect(main).toContain('float edge = smoothstep(uEdge.x, uEdge.y, rr);');
    expect(main).toContain('if (edge > 0.0) N0 = normalize(mix(N0, slopeNormal(uH1, uL1, uS1, m, uNextStep), edge));');
    expect(main.match(/sunMargins\(/g)).toHaveLength(1);
    expect(main).toContain('mTerrain = mix(mt.x, mt.y, edge);');
    expect(GROUND_FRAG).not.toMatch(/uHole\b/);
    expect(SHADOW_GLSL).toMatch(/vec2 sunMargins\(vec3 p, vec3 sun, bool both\)/);
    expect(SHADOW_GLSL).not.toMatch(/float sunMargin\(|float sunFraction\(/);
    expect(SHADOW_GLSL.match(/for \(int /g)).toHaveLength(1);
  });
```

In `web/src/lib/sky/standRenderer.test.ts`, test `'draws each level as a ring around the finer one, with no gap between them'`: read the hole as `(g.material as THREE.ShaderMaterial).uniforms.uHoleR.value as number` in place of `uHole.value.x`; the assertions stay.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky/groundLevels.test.ts src/lib/sky/shaders.test.ts src/lib/sky/standRenderer.test.ts --maxWorkers=2`
Expected: FAIL: `edgeOf is not a function`, `uHoleR` undefined, the shader patterns missing.

- [ ] **Step 3: Write the code**

`web/src/lib/sky/shadowRule.ts`, in `SHADOW_GLSL`, replace `sunMargin` and the GLSL `sunFraction` with:

```glsl
// The angles (radians) by which the Sun's centre clears the steepest rise of the ground towards it: over the mesh's
// own slots (x) and, with both, over the next level's on (y), as the next level's mesh would see it from its own
// ground under the point. A level's edge fades its shadows into the next level's (groundLevels.ts edgeOf). One march
// for both, so the loop is written once: wherever slot 0 holds a point, the coarser slots do too.
vec2 sunMargins(vec3 p, vec3 sun, bool both) {
  float horiz = length(sun.xz); float elSun = atan(sun.y, horiz); vec2 dir = sun.xz / horiz;
  float maxA = -10.0, maxB = -10.0; float t = max(${SHADOW.T0_MIN_M.toFixed(1)}, ${SHADOW.T0_CELLS} * cellAt(p.xz, 0));
  float yB = p.y, tB = 1.0e9;
  if (both) { yB = heightAt(p.xz, 1) + (p.y - heightAt(p.xz, 0)); tB = max(${SHADOW.T0_MIN_M.toFixed(1)}, ${SHADOW.T0_CELLS} * cellAt(p.xz, 1)); }
  for (int i = 0; i < ${SHADOW.STEPS} * uOne; i++) {
    if (i >= uSteps) break;
    vec2 q = p.xz + dir * t;
    float h = heightAt(q, 0); if (h < ${SHADOW.OUTSIDE_BELOW_M.toFixed(1)}) break;
    maxA = max(maxA, (h - p.y - ${SHADOW.TOL_M}) / t);
    if (t >= tB) maxB = max(maxB, (heightAt(q, 1) - yB - ${SHADOW.TOL_M}) / t);
    t *= uGrowth; if (t > ${SHADOW.MAX_M.toFixed(1)}) break;
  }
  return vec2(elSun - atan(maxA), elSun - atan(maxB));
}
```

`web/src/lib/sky/shaders.ts`, `GROUND_FRAG`:
- the uniform line `uniform float uEarthshine, uDetail, uFarDetail, uSunPower; uniform vec2 uHole;` becomes `uniform float uEarthshine, uDetail, uFarDetail, uSunPower, uHoleR, uNextStep; uniform vec3 uEdge;`
- in `main()`, the square hole's discard becomes:

```glsl
  // Round: a finer level draws inside the hole, the next level beyond the cut (groundLevels.ts edgeOf).
  float rr = length(m);
  if (rr < uHoleR || rr > uEdge.z) discard;
```

- after the per-pixel line of Task 4:

```glsl
  // Over the ring inside the cut the light fades into the next level's, slope by slope, so no edge shows from the air.
  float edge = smoothstep(uEdge.x, uEdge.y, rr);
  if (edge > 0.0) N0 = normalize(mix(N0, slopeNormal(uH1, uL1, uS1, m, uNextStep), edge));
  Nn = N0;
```

- `mTerrain = sunMargin(vWorld + N0 * 0.4, uSun);` becomes:

```glsl
    // The shadows fade the same way: the next level's from its own ground, mixed in over the ring.
    vec2 mt = sunMargins(vWorld + N0 * 0.4, uSun, edge > 0.0);
    mTerrain = mix(mt.x, mt.y, edge);
```

`web/src/lib/sky/groundLevels.ts`:
- export `edgeOf` as in Interfaces, with its doc comment ("A mesh's round edge: its own ground to ringIn, the next level's light and shadows from ringOut, cut round at cut, two cells inside its nearest side; the next level's round hole opens at ringOut, so the two overlap by a cell.").
- `material(…)` takes `holeR: number` (in place of the square `hole`), and sets `uHoleR: { value: holeR }`, `uEdge: { value: new THREE.Vector3(1e9, 1e9, 1e9) }`, `uNextStep: { value: 2 }`.
- After each entry k but the last is built: `const e = edgeOf(reachM, meshCell)` (`meshCell` is 480 for the flight level, else the level's cell); `uEdge.value.set(e.ringIn, e.ringOut, e.cut)`; `uNextStep.value = list[k + 1] === flightLevel ? 1 : 2`; and the next entry's `holeR` is `e.ringOut`.
- The cap's ring keeps `holeR = capReach - 2 * cap.cell`, as the square hole had, and no edge.
- The flat ground (no levels): `holeR` 0, no edge.

- [ ] **Step 4: Run them to see them pass**

Run: `cd web && npx vitest run src/lib/sky src/components/home src/components/stand --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/groundLevels.ts web/src/lib/sky/groundLevels.test.ts web/src/lib/sky/shadowRule.ts web/src/lib/sky/shaders.ts web/src/lib/sky/shaders.test.ts web/src/lib/sky/standRenderer.test.ts
git commit -m "feat(web): every ground level is cut round and fades its light and shadows into the next over a ring, so no square shows from the air"
```

---

### Tasks 6, 7 and 8: stones, the lander's parts, the night light

Written from the prototype (`.claude/jobs/a9458886/tmp/mock_d2/proto/NOTES.md`) before Wave 2 starts, in this plan's step style, each with its failing tests first. Wave 1 does not touch their files (`boulders.ts`, `landerMesh.ts` after Task 3's move, `landerShape.ts`, the night term in `shaders.ts`, the night lights in `standRenderer.ts`).

---

### Task 9: The next step stays in view from 768 px (subagent)

**Files:**
- Modify: `web/src/lib/viz/stand.ts`, `web/src/components/stand/StandView.tsx`
- Test: `web/src/lib/viz/stand.test.ts`, `web/src/components/stand/StandView.test.tsx`

**Interfaces:**
- Consumes: `betterLabel`, `exploreHref`, `standHref`, `COMPARE_MAX`, the store's `compareIds` and `addToCompare`, `useNavigate` (`@/lib/hooks/useNavigate`, null-safe without a router).
- Produces: `betterLabel(dayLong: string, poweredHours: number, radioHours: number, short = false): string` (short: no radio part); in the page, the status plate's second row, `role="group"` named "Next step", classes `max-md:hidden`.

- [ ] **Step 1: Write the failing tests**

In `web/src/lib/viz/stand.test.ts`, next to the existing `betterLabel` test (search the file for `betterLabel(`), add:

```ts
  it('shortens the better day for the row under the status line: the power alone, the radio left to today’s card', () => {
    expect(betterLabel('20 January', 303, 77, true).replace(/ /g, ' ')).toBe('Try 20 January instead: power for 12 days 15 hours');
    expect(betterLabel('20 January', 303, 77).replace(/ /g, ' ')).toBe('Try 20 January instead: power for 12 days 15 hours, radio for 3 days 5 hours');
  });
```

(Write the test with the Write or Edit tool, not a shell heredoc: ` ` must stay an escape.)

In `web/src/components/stand/StandView.test.tsx`, add inside `describe('StandView', …)`:

```ts
  it('keeps the next step in view from 768 px: the better day in gold, then Change site, Change date and Compare sites, and the card leaves its own gold and way back to that row', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const row = screen.getByRole('group', { name: 'Next step' });
    // A phone keeps the row in today's card, under More: the scene keeps its 55 % (17.1).
    expect(row.className).toMatch(/\bmax-md:hidden\b/);
    // Inside the status's plate, under its line.
    expect(row.closest('[data-plate]')).toBe(screen.getByRole('button', { name: 'More' }).closest('[data-plate]'));
    const gold = within(row).getByRole('link', { name: /^Try 20 January instead: power for 12\sdays\s15\shours$/ });
    expect(gold.className).toContain('text-[#f6d48a]');
    expect(gold.getAttribute('href')).toMatch(/^\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-20/);
    expect(within(row).getByRole('link', { name: 'Change site' }).getAttribute('href')).toBe('/sites');
    expect(within(row).getByRole('link', { name: 'Change date' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(within(row).getByRole('button', { name: 'Compare sites' }).className).not.toContain('text-[#f6d48a]');
    // One gold action on the screen: from 768 px the card's own better day and way back are hidden.
    openCard();
    const card = document.getElementById('stand-card')!;
    expect(within(card).getByRole('link', { name: /radio for/ }).closest('div')!.className).toMatch(/\bmd:hidden\b/);
    expect(within(card).getByRole('link', { name: 'Back to the forecast' }).className).toMatch(/\bmd:hidden\b/);
  });

  it('makes Compare sites the gold action when no landing day is better, and adds the site to the comparison on the way there', async () => {
    // From 20 January, the better day of the January period, no later landing is better. If the answer still
    // names one, take a site and period the file's tests already use without a better day, and ledger a Ruling.
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-20&days=30&hour=10');
    const row = screen.getByRole('group', { name: 'Next step' });
    expect(within(row).queryByRole('link', { name: /^Try / })).toBeNull();
    const compare = within(row).getByRole('button', { name: 'Compare sites' });
    expect(compare.className).toContain('text-[#f6d48a]');
    fireEvent.click(compare);
    await waitFor(() => expect(store.getState().compareIds).toContain('de_gerlache_rim_2'), { timeout: 10_000 });
  });

  it('lands on the better day in place from the row too', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    fireEvent.click(within(screen.getByRole('group', { name: 'Next step' })).getByRole('link', { name: /^Try 20 January instead/ }));
    await waitFor(() => expect(store.getState().startUtc).toMatch(/^2027-01-20/), { timeout: 10_000 });
    expect(window.location.search).toMatch(/start=2027-01-20/);
  });
```

The existing tests that find the card's better day by `/^Try 20 January instead/` or `/^Try \d+ January instead/` now meet two links (the row's and the card's). Scope each to the card: write `within(document.getElementById('stand-card')!).getByRole(…)` / `findByRole(…)` in the tests named "keeps the links where they are when the reasons open…", "lands on the better day in place, keeping the lander…", "on a phone keeps the site’s name…" and "keeps the card open and the same whatever the view does".

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/components/stand/StandView.test.tsx --maxWorkers=1`
Expected: FAIL: the short label has the radio part, and `Unable to find role="group" and name "Next step"`.

- [ ] **Step 3: Write the code**

`web/src/lib/viz/stand.ts`:

```ts
export function betterLabel(dayLong: string, poweredHours: number, radioHours: number, short = false): string {
  const radio = Math.round(radioHours) <= 0 ? 'no radio contact' : `radio for ${spanWords(radioHours)}`;
  return unbrokenSpans(`Try ${dayLong} instead: power for ${spanWords(poweredHours)}${short ? '' : `, ${radio}`}`);
}
```

(with a line in its doc comment: "`short`: the power alone, for the row under the status line; today's card gives the radio too.")

`web/src/components/stand/StandView.tsx`:
- imports: `useNavigate` from `@/lib/hooks/useNavigate`; `COMPARE_MAX` from `@/lib/store/explore`.
- in the component, before the early returns: `const go = useNavigate();`.
- `better` gains `short: betterLabel(dateLong(s.startUtc, answer.better.hour), s.best.poweredHours, s.best.poweredHours * s.best.earthFraction, true)`.
- `const compare = () => { const st = store.getState(); if (!st.compareIds.includes(site.id) && st.compareIds.length < COMPARE_MAX) void st.addToCompare(site.id).then(() => go('/compare')); else go('/compare'); };`
- The status plate becomes a column: the existing `flex` row (dot, words, More) inside a `div` with `${PLATE} pointer-events-auto flex w-full max-w-[860px] flex-col md:w-fit` (the plate's classes, `ref={statusRef}` and `data-plate` move to it; the inner row keeps `flex items-start gap-3 px-3.5 py-1 md:px-4 md:py-1.5`). Under the row:

```tsx
              {/* The next step, always in view from 768 px (17.1); on a phone it waits in today's card. */}
              <div role="group" aria-label="Next step" className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-2.5 pl-[44px] pr-4 max-md:hidden">
                {better ? (
                  <a
                    href={better.href}
                    onClick={(e) => {
                      e.preventDefault();
                      land(better.startUtc, better.href);
                    }}
                    className={`${LOOK.replace('whitespace-nowrap ', '')} inline-flex items-center border-[#f6d48a]/55 text-[#f6d48a]`}
                  >
                    {better.short}
                  </a>
                ) : (
                  <button type="button" onClick={compare} className={`${LOOK} border-[#f6d48a]/55 text-[#f6d48a]`}>
                    Compare sites
                  </button>
                )}
                <Link href="/sites" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4">
                  Change site
                </Link>
                <Link href={exploreHref(site.id, s.startUtc, s.days)} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4">
                  Change date
                </Link>
                {better && (
                  <button type="button" onClick={compare} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4">
                    Compare sites
                  </button>
                )}
              </div>
```

- In today's card, the better day's wrapping `div` gets `className="md:hidden"`, and the "Back to the forecast" link's classes gain `md:hidden`.

- [ ] **Step 4: Run them to see them pass**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/components/stand --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/stand.ts web/src/lib/viz/stand.test.ts web/src/components/stand/StandView.tsx web/src/components/stand/StandView.test.tsx
git commit -m "feat(web): the next step stays in view under the status line from 768 px: the better day in gold, Change site, Change date and Compare sites"
```

---

### Task 10: Checks on the production build, and blind read D2 (main session)

**Files:**
- Frames and scripts: `.playwright-mcp/readD2/` (gitignored) and the job folder.

- [ ] **Step 1: The suites and the gates**

Run: `cd web && npx vitest run --maxWorkers=2 > "$CLAUDE_JOB_DIR/tmp/d2-suite.txt" 2>&1; tail -5 "$CLAUDE_JOB_DIR/tmp/d2-suite.txt"; npx tsc --noEmit && npm run lint`
Run: `cd pipeline && uv run pytest -q` (then `git checkout -- data/fixtures/horizons/summary.json` if pytest rewrote it).
Expected: all pass; no type or lint errors.

- [ ] **Step 2: The build, on a fresh host**

Delete `web/.next/cache` first. Run: `cd web && npm run build`, then in the background `npx next start --port 3000 --hostname 0.0.0.0`.
Expected: the build succeeds; the server answers on `http://127.0.0.52:3000/`.

- [ ] **Step 3: Frames**

With Playwright MCP (`browser_run_code_unsafe`), save to `.playwright-mcp/readD2/`:
- the arrival on `/` at 1440 × 900, at quarter screens 00 to 10 (as read D1 took them), and on a phone 390 × 844 at 03 to 08;
- the stand view on `/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=H`, waiting for the `role="status"` element ("Building the ground…") to go, then 8 s more:
  - wide 1440 × 900: hours 10, 70, 219, 300, 460 as they open; hour 10 with More open; hour 10 after "Turn to: Lander"; hour 70 after "Turn to: Lander" (the lander at night); hour 70 looking down at the nearest boulders (a view set through the page's arrow keys);
  - 1024 × 768 and 820 × 1180: hour 10 as it opens (the next-step row);
  - phone 390 × 844: hours 10 and 219 as they open; hour 10 with More open.

- [ ] **Step 4: Measurements and timings**

- In each stand-view frame: no sideways scroll; every visible text element's computed font size at least 13 px; text contrast against its plate at least 4.5:1 (the part C measure script); the phone's scene band `(row.top - section.bottom) / innerHeight >= 0.55`; at 768 to 1279 px wide the next-step row inside the status plate and clear of the Turn to row and of More (their boxes do not meet).
- The ground shader's build: five fresh loads of the stand view at hour 10 in a row, each timed from navigation to the `role="status"` element's removal. Gate: every load draws (no fallback chart, no lost context), each within 15 s. Ledger the times (D1 recorded none).
- The arrival's frame times: with the page's frame pacer, record `requestAnimationFrame` intervals while scrolling from quarter screen 2 to 8 at a steady pace; ledger the median and the 95th percentile. Gate (17.6): no frame over 50 ms at the median and the 95th percentile once the flight level has loaded.
- Review Focus 1: rename `web/public/data/terrain/de_gerlache_rim_2.flight.u16` to `.bak`, reload the arrival, check it flies and lands with no error in the console, then rename it back.

Expected: all pass. Ledger the numbers.

- [ ] **Step 5: Blind read D2**

Dispatch two subagents (most capable model), a hackathon judge and a secondary-school science teacher, each given only the frames and the brief used in read D1 (the product in one sentence; score purpose, next step, look, room, readability and immersion from 1 to 5; name what confused them; one change). They never see the code, the spec or this plan.
Gate (13.2): purpose, next step and look at 4 or more, room and readability at 3 or more, immersion at 4, from both.
- Pass: one bounded pass on what both readers name that is clear, small and in D2's scope, with no further read.
- Fail: one bounded pass on what both name, then a second read, D2-2; after it, rule.

Ledger each read's scores and named items.

- [ ] **Step 6: Stop the server**

TaskStop the server, then free port 3000 (`Get-NetTCPConnection -LocalPort 3000 | % { Stop-Process -Id $_.OwningProcess -Force }`), and delete `web/.next/cache`.

---

### Task 11: The spec as built, the README, the badge, the final review, and the pull request (main session)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-immersive-space-design.md` (17.7 as built, 17.8 the reads), `web/README.md`, `web/public/validation/tests.json`
- Create: `docs/superpowers/plans/2026-10-06-immersive-d2-scenes.ledger.md` (copy of the workspace ledger)

- [ ] **Step 1: The spec as built and the README**

Add "17.7 D2 as built: where it differs from 17.1 to 17.5", with every ruling of the ledger in a line each, and "17.8 D2: the blind read", with the table of the read (or reads) in 13.2's form and the ruling. In `web/README.md`, under the stand view and the arrival, say what D2 added (the next-step row; the flight level and its data file, which the R2 mirror needs before the deployed arrival can use it; stones; the lander's parts; the night light).

- [ ] **Step 2: The badge**

From the suite's last run, write the web counts (files, tests) and the pipeline's count into `web/public/validation/tests.json`, with `generated_utc` now. Run: `cd web && npx vitest run src/components/ValidateView.test.tsx --maxWorkers=2`. Expected: PASS.

- [ ] **Step 3: The final review**

Run `review-package` for this plan from the branch's base (`git merge-base main HEAD`) to `HEAD`, and dispatch the reviewer on the most capable model with the package, this plan's path, the spec's path, this plan's Review Focus section verbatim, and the ledger's `Ruling:` lines. Re-grade its findings by effect. Fix Critical and Important ones in one pass, each test RED then GREEN, then the whole suite. Ledger the minors as deferred.

- [ ] **Step 4: Commit, push and open the pull request**

```bash
git add docs/superpowers/specs/2026-10-02-immersive-space-design.md docs/superpowers/plans/2026-10-06-immersive-d2-scenes.ledger.md web/README.md web/public/validation/tests.json
git commit -m "docs: spec 17 as built for D2, with its blind read, the ledger, the README and the test badge"
git push -u origin feat/immersive-d2
gh pr create --base main --title "Part D2: the scenes, sharper and more solid" --body-file <body file>
```

The body lists what changed, the read's scores, the rulings and the deferred minors, says the flight file must reach R2 before the deployed arrival uses it, and ends with the session's attribution lines.

- [ ] **Step 5: Merge on green**

Poll the check runs until "GitGuardian Security Checks" completes with success. Then run `gh pr merge N --merge`, `git checkout main` and `git pull`. Delete the plan's workspace directory. Update the project memory (D2 merged; the flight file awaits the R2 upload with the user's go to deploy).
