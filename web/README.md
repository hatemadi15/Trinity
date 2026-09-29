# Earthrise — web app

Next.js 16 app for the CLPS Lunar Mission Browser (NASA Space Apps 2026, team Astroy/Ed).

## Setup

    npm install
    # copy the pipeline artifacts (run from pipeline/): uv run python -m lunar_pipeline.cli sync-local --tiles
    npm run dev

`.npmrc` sets `legacy-peer-deps=true` because npm 10's peer resolver crashes on vitest 5's peer set.

## Engine

`src/lib/engine/` is a pure-TypeScript port of the Python pipeline science (no DOM, no React):
time (UTC ↔ TDB), geometry (ENU az/el with parallax, south polar stereographic), ephemeris
(Catmull-Rom over the hourly MOON_ME table), tiles (zlib int16 DEM tiles, bilinear sampler),
horizon (nested-grid skyline with fallback bands), metrics (sunlit / Earth-visible series,
prefix-sum window index, best-window search).

Parity gates (all in `npm test`): JPL Horizons az/el < 0.002° (achieved 2.7e-5°), Python masks
< 0.01° (achieved 0.0005°, the JSON rounding quantum), metrics fractions < 1e-6 (exact).
Demo: `npm run engine:demo -- --site shackleton_center_rim_high` (mask in about 2 s cold, under 1.5 s warm in Node; `computeSiteMask` also reports DEM coverage and any tiles that failed to load).
