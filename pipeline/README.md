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

`globe` resamples NASA's CGI Moon Kit (the colour map with its poles filled and LOLA's heights at 16 pixels a
degree, 44 MB fetched into `data_raw/globe`) into `data_out/globe` for the home page's arrival: colour and
normal maps at 1K and 4K, heights at 4 pixels a degree and `manifest.json`. `sync-local --tiles` copies the set
into `web/public/data/globe`.

## Tests

    uv run pytest -q            # synthetic tests always run; data tests skip until fetched

## Week 1 results (2026-09-28)

- `uv run pytest -q` → 52 passed (synthetic + data tests; data downloaded via `fetch`).
- JPL Horizons cross-check: 300 rows, max |Δel| 2.7e-5°, max |Δaz·cos el| 2.6e-6°.
- `report --site shackleton_center_rim_high` (2025-01-01, 730 days): any-part-of-Sun-visible 90.7 % of hours (`illum_fraction`), time-averaged visible disk fraction 86.2 % (`mean_sun_fraction`), longest dark 63 h, Earth visible 50.0 %, longest Earth gap 334 h. Mazarico 2011 map (`AVGVISIB`, 2009–2013, 60 m DEM): 0.796 sunlit, 0.533 Earth. Differences expected: our point is the 20 m argmax peak with a 2 m mast over a different 2-year span.
- `report --site shackleton_center`: 0 % sunlit, 0 % Earth (permanently shadowed floor), matching the Mazarico maps.
- Committed data size: `data/` ≈ 2.8 MB (limit 30 MB). Generated tiles in `data_out/tiles`: 706 tiles, 238 MB (gitignored).
