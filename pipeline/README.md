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
    uv run python -m lunar_pipeline.cli sync-local --tiles
    uv run python -m lunar_pipeline.cli pgda90-fetch
    uv run python -m lunar_pipeline.cli uncertainty
    uv run python -m lunar_pipeline.cli check-data
    uv run python -m lunar_pipeline.cli manifest

`pgda90-fetch` downloads four files of PGDA product 90 (Barker et al. 2023, https://pgda.gsfc.nasa.gov/products/90)
into `data_raw/pgda90`, 890 MB in all: the adjusted LOLA models at 80 m and 240 m and their height-error maps.
`uncertainty` (about 12 minutes; needs the kernels, the LOLA grids and those files) finds every event at one-minute
SPICE steps for 730 days from 2025-01-01, traces each polar site's skyline through the adjusted models, reads small
windows of the 20 m and 50 m products around each site over HTTP (cached in `data_raw/pgda90/windows`), and writes
`data/uncertainty/budget.json` and `data/uncertainty/skylines/`; `sync-local` copies them into the app. The method,
the results and every download are in `docs/method.md`, "Uncertainty budget".

`fetch` downloads each group into `data_raw/<group>`; it skips files it already has and, run again
after a cut-off download, resumes from the `.part` file. `data_raw/` is gitignored.

| Group | Size | What | Read by |
|---|---|---|---|
| `kernels` | 44 MB | NAIF SPICE kernels: leap seconds, the Moon's orientation and frame, DE440s | `ephemeris`, `sky`, `horizons-compare`, `report`, `validate`, `home-assets`, `fixture-time`, `fixture-metrics`, `fixture-power`, `fixture-landing`, `fixture-sky` |
| `lola` | 335 MB | LOLA heights of the south pole at 20, 80 and 240 m, over HTTP from imbrium.mit.edu | `tiles`, `terrain`, `masks`, `sites-derive`, `home-assets` |
| `illumination` | 147 MB | the LOLA illumination maps (Mazarico) | `report`, `validate` |
| `textures` | 0.45 MB | the LROC colour map, for Explore's 3D globe | `terrain` (without it the globe is plain grey) |
| `sky` | not measured | the Yale Bright Star Catalogue and two Blue Marble maps of Earth, only to rebuild `data/sky` | `sky` |

The `globe` command and `fetch --group globe` went on 14 November with the globe they made for the home page's
arrival (two files of NASA's CGI Moon Kit, resampled into `data_out/globe`), and so did the 240 m flight level
that `terrain` cut round the arrival's site (`de_gerlache_rim_2.flight.u16` and `.json`). Nothing reads them now:
an older copy's `data_raw/globe`, `data_out/globe`, `web/public/data/globe` and the two flight files in
`data_out/terrain` and `web/public/data/terrain` can be deleted.

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
The `--tiles` option also copies the terrain assets when they have been
built with the `terrain` command.

## The asset manifest and the check

`data/manifest.json` lists every data file the app reads, as `web/public/data` lays them out: 840
files in six groups (the site catalogue, the hourly table and the masks; the sky; the Accuracy
page's tables; the LOLA tiles; the terrain; the test fixtures), each file with its size
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
(the shadow map, the 3D view, the stand view's ground) to the tiles:

```
uv run python -m lunar_pipeline.cli fetch --group lola --group textures
uv run python -m lunar_pipeline.cli tiles
uv run python -m lunar_pipeline.cli terrain
uv run python -m lunar_pipeline.cli sync-local --tiles
```

On a 4-core Linux computer with a fast connection, `fetch` took 9 seconds for LOLA's heights (335 MB)
and 1 second for the colour map, `tiles` 12 seconds (238 MB in `data_out/tiles`), `terrain` 2
seconds (27 MB, 0.5 GB of memory) and `sync-local --tiles` under a second (269 MB in
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
- `report --site shackleton_center_rim_high` (2025-01-01, 730 days): any-part-of-Sun-visible 90.7 % of hours (`illum_fraction`), time-averaged visible disk fraction 86.2 % (`mean_sun_fraction`), longest dark 63 h, Earth visible 50.0 %, longest Earth gap 334 h. LOLA map (`AVGVISIB`, hourly over 18.6 years, 60 m DEM, from the ground; the label's 2009–2013 is the span of the altimetry): 0.796 sunlit, 0.533 Earth. Differences expected: our point is the 20 m argmax peak with a 2 m mast over a different 2-year span.
- `report --site shackleton_center`: 0 % sunlit, 0 % Earth (permanently shadowed floor), matching the Mazarico maps.
- Committed data size: `data/` ≈ 2.8 MB (limit 30 MB). Generated tiles in `data_out/tiles`: 706 tiles, 238 MB (gitignored).
