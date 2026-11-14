# lunar_pipeline

Offline pipeline that converts NASA data into the static artifacts used by the web app.

## Setup

The pipeline needs uv; install it as in the root README's step 1 (uv installs Python 3.12 itself,
the version `.python-version` pins). From the repository's root:

    cd pipeline
    uv sync

`uv sync` downloads Python 3.12 (about 30 MB, only when the computer has no 3.12) and the packages
`uv.lock` lists (65 to 85 MB, by system) into `pipeline/.venv`, about 250 MB on disk; it took 5
seconds on a 4-core Linux computer with a fast connection. The packages come prebuilt for Windows on
x64, macOS 14 or later on Apple silicon, macOS 15 or later on Intel and Linux with glibc 2.28 or
later, so nothing is compiled. Every command below runs from `pipeline/` and is the same in
PowerShell, Command Prompt, bash and zsh; run from elsewhere, Python says
`No module named 'lunar_pipeline'`.

## Commands (run from `pipeline/`)

    uv run python -m lunar_pipeline.cli fetch --group kernels --group lola --group illumination
    uv run python -m lunar_pipeline.cli ephemeris
    uv run python -m lunar_pipeline.cli tiles
    uv run python -m lunar_pipeline.cli sites-derive
    uv run python -m lunar_pipeline.cli masks
    uv run python -m lunar_pipeline.cli horizons-fetch
    uv run python -m lunar_pipeline.cli horizons-compare
    uv run python -m lunar_pipeline.cli report --site shackleton_center_rim_high
    uv run python -m lunar_pipeline.cli fetch --group globe
    uv run python -m lunar_pipeline.cli globe
    uv run python -m lunar_pipeline.cli sync-local --tiles
    uv run python -m lunar_pipeline.cli check-data
    uv run python -m lunar_pipeline.cli manifest

`fetch` downloads each group into `data_raw/<group>`; it skips files it already has and, run again
after a cut-off download, resumes from the `.part` file. `data_raw/` is gitignored.

| Group | Size | What | Read by |
|---|---|---|---|
| `kernels` | 44 MB | NAIF SPICE kernels: leap seconds, the Moon's orientation and frame, DE440s | `ephemeris`, `sky`, `horizons-compare`, `report`, `validate`, `home-assets`, `fixture-time`, `fixture-metrics`, `fixture-power`, `fixture-landing`, `fixture-sky` |
| `lola` | 335 MB | LOLA heights of the south pole at 20, 80 and 240 m, over HTTP from imbrium.mit.edu | `tiles`, `terrain`, `masks`, `sites-derive`, `home-assets` |
| `illumination` | 147 MB | the LOLA illumination maps (Mazarico) | `report`, `validate` |
| `textures` | 0.45 MB | the LROC colour map, for Explore's 3D globe | `terrain` (without it the globe is plain grey) |
| `sky` | not measured | the Yale Bright Star Catalogue and two Blue Marble maps of Earth, only to rebuild `data/sky` | `sky` |
| `globe` | 44 MB | the CGI Moon Kit colour map and heights | `globe` |

`fetch --group globe` downloads two files of NASA's CGI Moon Kit (Scientific Visualization Studio,
https://svs.gsfc.nasa.gov/4720) into `data_raw/globe`, 44 MB in all: `lroc_color_poles_4k.tif` (the LROC WAC
colour map with its poles filled, 4096 × 2048) and `ldem_16_uint.tif` (LOLA's heights at 16 pixels a degree).
`globe` resamples them into `data_out/globe` for the home page's arrival, about 5.3 MB: colour and normal maps
at 1K and 4K, heights at 4 pixels a degree (`moon_heights_1440.u16` and its `.json`) and `manifest.json` (the
files, their layout, the albedo scale that matches the south cap to the stand view's ground, and the credit).
`sync-local --tiles` copies the set into `web/public/data/globe`, and `publish-r2` uploads it with the rest of
`web/public/data`.

## Syncing data for local development

`sync-local --tiles` copies existing artifacts into `web/public/data`; it does not
generate tiles. The downloaded sources in `data_raw/` and generated tiles in
`data_out/tiles` are gitignored, so a fresh checkout must download and build them
before syncing. Run these commands from `pipeline/`, in order:

```powershell
uv run python -m lunar_pipeline.cli fetch --group lola
uv run python -m lunar_pipeline.cli tiles
uv run python -m lunar_pipeline.cli sync-local --tiles
```

If syncing reports `data_out/tiles missing; run the tiles command first`, use the
sequence above. If the LOLA sources are already downloaded, start with `tiles`.
The `--tiles` option also copies terrain and globe assets when they have been
built with the `terrain` and `globe` commands.

## The asset manifest and the check

`data/manifest.json` lists every data file the app reads, as `web/public/data` lays them out: 839
files in seven groups (the site catalogue, the hourly table and the masks; the sky; the Accuracy
page's tables; the LOLA tiles; the terrain; the globe; the test fixtures), each file with its size
and SHA-256, each group with whether the app needs it, where it comes from, the commands that make
it and what the app does without it, and a data version (the date and the first eight digits of a
hash over every file, `2026-11-14-a120b7a9` for the data of 14 November). `sync-local` copies it
into `web/public/data`, so the published data and the release zip carry it.

- `check-data` compares a folder (`web/public/data`, or `--root <folder>`) with it and says, group by
  group, what is complete, missing, incomplete or different, what the app does without each group
  and the commands that get it. It exits with 1 only when a required file (the catalogue, the
  table, the masks, the sky or the Accuracy tables) is missing or differs; `--json` prints the
  report with the downloads the tests below read. `npm run data:check` in `web/` runs it too.
- `manifest` rewrites the list: the committed groups from `data/`, the generated ones as
  `web/public/data` holds them (`data_out/` where the mirror has none), and a group not built on
  the computer kept from the manifest before. Rewritten with nothing changed it keeps its version,
  byte for byte. A test fails when the committed groups no longer match `data/`: after a change to
  `data/`, run `manifest` and commit `data/manifest.json`. Generated files rebuilt on another
  computer can differ in their bytes (compression, rounding); `check-data` then says "differs" for
  that optional group and still exits with 0.

To copy only the committed data without generated tiles, run:

```powershell
uv run python -m lunar_pipeline.cli sync-local
```

These lines are the same in Command Prompt, bash and zsh. The app's full data adds the terrain
(the shadow map, the 3D view, the stand view's ground) and the globe (the home page's arrival) to
the tiles:

```
uv run python -m lunar_pipeline.cli fetch --group lola --group textures --group globe
uv run python -m lunar_pipeline.cli tiles
uv run python -m lunar_pipeline.cli terrain
uv run python -m lunar_pipeline.cli globe
uv run python -m lunar_pipeline.cli sync-local --tiles
```

On a 4-core Linux computer with a fast connection, the downloads (380 MB) took 11 seconds, `tiles`
12 seconds (238 MB in `data_out/tiles`), `terrain` 2 seconds (29 MB, 0.5 GB of memory), `globe` 3
seconds (5.3 MB, 1.1 GB of memory) and `sync-local --tiles` under a second (276 MB in
`web/public/data`). The root README's step 3 says what each one adds to the app and what works
without it.

## Tests

    uv run pytest -q

The synthetic tests always run; the data tests skip until the files they need are fetched. On 14
November, with nothing downloaded, 121 of the 147 tests passed and 26 skipped (8 seconds, with other
jobs running); with `fetch --group kernels --group lola --group illumination` (525 MB) all 147
passed (20 to 32 seconds). Every partial download was run too (lola alone, kernels alone, kernels
and lola): each test whose files are missing skips, and none fails. The tests write only to
temporary folders (the Horizons summary and the app's catalogue included), so a run leaves the
tree as it was, and they pass in a clone of any name (a GitHub ZIP unpacks to `Trinity-main`).
`npm run validation:tests` in `web/` runs them with the app's and records the counts.

## Week 1 results (2026-09-28)

- `uv run pytest -q` → 52 passed (synthetic + data tests; data downloaded via `fetch`).
- JPL Horizons cross-check: 300 rows, max |Δel| 2.7e-5°, max |Δaz·cos el| 2.6e-6°.
- `report --site shackleton_center_rim_high` (2025-01-01, 730 days): any-part-of-Sun-visible 90.7 % of hours (`illum_fraction`), time-averaged visible disk fraction 86.2 % (`mean_sun_fraction`), longest dark 63 h, Earth visible 50.0 %, longest Earth gap 334 h. Mazarico 2011 map (`AVGVISIB`, 2009–2013, 60 m DEM): 0.796 sunlit, 0.533 Earth. Differences expected: our point is the 20 m argmax peak with a 2 m mast over a different 2-year span.
- `report --site shackleton_center`: 0 % sunlit, 0 % Earth (permanently shadowed floor), matching the Mazarico maps.
- Committed data size: `data/` ≈ 2.8 MB (limit 30 MB). Generated tiles in `data_out/tiles`: 706 tiles, 238 MB (gitignored).
