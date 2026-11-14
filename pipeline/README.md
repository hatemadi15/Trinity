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
    uv run python -m lunar_pipeline.cli report --site shackleton_center_rim_high
    uv run python -m lunar_pipeline.cli fetch --group globe
    uv run python -m lunar_pipeline.cli globe
    uv run python -m lunar_pipeline.cli sync-local --tiles

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

To copy only the committed data without generated tiles, run:

```powershell
uv run python -m lunar_pipeline.cli sync-local
```

## Tests

    uv run pytest -q            # synthetic tests always run; data tests skip until fetched

## Week 1 results (2026-09-28)

- `uv run pytest -q` → 52 passed (synthetic + data tests; data downloaded via `fetch`).
- JPL Horizons cross-check: 300 rows, max |Δel| 2.7e-5°, max |Δaz·cos el| 2.6e-6°.
- `report --site shackleton_center_rim_high` (2025-01-01, 730 days): any-part-of-Sun-visible 90.7 % of hours (`illum_fraction`), time-averaged visible disk fraction 86.2 % (`mean_sun_fraction`), longest dark 63 h, Earth visible 50.0 %, longest Earth gap 334 h. Mazarico 2011 map (`AVGVISIB`, 2009–2013, 60 m DEM): 0.796 sunlit, 0.533 Earth. Differences expected: our point is the 20 m argmax peak with a 2 m mast over a different 2-year span.
- `report --site shackleton_center`: 0 % sunlit, 0 % Earth (permanently shadowed floor), matching the Mazarico maps.
- Committed data size: `data/` ≈ 2.8 MB (limit 30 MB). Generated tiles in `data_out/tiles`: 706 tiles, 238 MB (gitignored).
