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

## Routes

- `/`: home page. Says what the product does, shows a computed shadow picture of one site, explains why the south pole is hard, charts one real month, and opens three real missions as forecasts (`/explore?site=&start=&days=`).
- `/sites`: "Choose a landing site". Every catalogue site in three plain groups with its sunlight, its contact with Earth and its longest time with power for the chosen period and lander (`loadOverview` in the store works them out one site at a time), a relief map of the pole with one pin per site (names written where they fit, `src/lib/viz/maplabels.ts`), and a form that computes any other place south of 60° S. A row opens Explore on the landing date it names.
- `/explore`: the answer for one site and period. The verdict says how long the power lasts and why, and offers the landing date inside the period that gives the longest time with power ("Land on 20 January instead"); a link searches the next 12 months. Below it: the numbers, a chart of the Sun, Earth and the battery hour by hour on one time axis, the ground (3D terrain, or the globe for a site the terrain files have no detailed window for), where the site is with its nearest neighbours, and the assistant; the time bar stays at the bottom of the window. `?site=&start=&days=` opens a site and period.
- `/compare`: up to four sites over the same window and planner settings, one column per site.
- `/validate`: Horizons cross-check (live re-check through `/api/horizons`), LOLA map agreement, CLPS backcasts; `npm run validation:tests` refreshes the test-count badge in `public/validation/tests.json`.
- `/brief`: printable one-page mission brief for the selected site and window.

Time with power (`src/lib/engine/landing.ts`) is the hours from landing, with a full battery, to the first hour the battery cannot cover, counted up to the length of the period. Its Python reference is `pipeline/lunar_pipeline/landing.py`; `uv run python -m lunar_pipeline.cli fixture-landing --site ID [--start UTC] [--days N]` (from `pipeline/`) writes a golden file into `data/fixtures/landing/` that the TypeScript tests check against.
- `/learn`: "How it works" (still the earlier Learn introduction; rebuilt in part 4 of the redesign).
- `/api/chat`: the planner assistant (task `plan`) and the brief narrator (task `narrate`) on OpenRouter; see `.env.example`. Without a key, or with `?demo=1`, answers come from `src/lib/ai/transcripts.json` and the phrase matcher.

## Themes

Light is the default; the header switch changes it and the choice is kept in `localStorage` under `earthrise.theme`. `?theme=dark` or `?theme=light` sets the theme for one visit without changing the stored choice. The system preference is not followed. An inline script in `src/app/layout.tsx` sets `data-theme` on `<html>` before the first paint (`src/lib/theme.ts`). Colours are tokens in `src/app/globals.css`; picture panels ("stages": charts on black, the shadow map, 3D) keep the same dark colours in both themes. The design is in `docs/superpowers/specs/2026-10-01-ui-redesign-design.md`.

Text never scales with a picture: labels on charts and drawings are page text laid over the drawing (`src/components/SkyRow.tsx`), so nothing falls under 13 px on a narrow screen.

The look, in short (reasoning in section 15 of the design): the palette is the Moon's own three tones, shadow black for picture panels, regolith grey for the page and sunlit white for panels, with colour kept for the Sun (gold) and Earth (blue). Headlines use the class `display` (Bricolage Grotesque at 87.5 % width, weight 700). Pictures have a 6 px radius, panels and controls 8 px. The only motion that plays by itself is on the home page, where the Sun's line is drawn once from left to right (`reveal` on `SkyRow`); reduced motion shows the finished picture.

## Home page assets

    # from pipeline/
    uv run python -m lunar_pipeline.cli home-assets

writes `public/hero/de-gerlache-rim-2.jpg` (the shadow map on the home page, computed from three LOLA grids), `public/maps/south-pole-relief.jpg` (the relief map with site positions) and `src/lib/data/home.json` (the month charted on the home page and the headline figures of the three checks). Run it again after the validation tables or the site catalogue change; `src/lib/data/home.test.ts` fails when `home.json` has drifted from the validation tables.

## AI layer (Week 6)

`src/lib/ai/`: `actions.ts` (closed action schema, validator, site matcher, `applyActions`), `intents.ts` (twelve rehearsed phrasings), `state-summary.ts` (the compact state sent with each question), `openrouter.ts` (model chain with timeouts), `protocol.ts` (system prompt, lenient JSON extraction, reply types), `cache.ts` + `transcripts.json` (rehearsed answers), `rate-limit.ts`, `narrate.ts` (number check and template brief), `client.ts` (browser calls). The catalogue the server validates against is `src/lib/data/catalogue.json`, written by the pipeline's `sync-local`.

## Engine additions (Week 4)

- `src/lib/engine/power.ts`: irradiance, panel geometries, battery simulation (`powerBudget`), pinned to `data/fixtures/power/` written by `pipeline/lunar_pipeline/power.py`.
- `src/lib/engine/metrics.ts`: `withCommsThreshold`, `contactWindows`, `windowScore`, and `Series.sunAu`.
