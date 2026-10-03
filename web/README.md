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

- `/`: home page. Says what the product does, charts one real month at de Gerlache Rim 2 (the Sun's and Earth's rows and what they mean for a small lander), explains why the south pole is hard in three drawings, shows a computed shadow picture of the ridge beside three real places (the ridge, and the Athena and Blue Ghost landers of March 2025, which open Explore at the first whole hour after each landed), and states the three checks against NASA.
- `/sites`: "Choose a landing site". Every catalogue site in three plain groups with its best landing day in the chosen period, its time with power from that day, and its sunlight and contact with Earth over the first N days after it (`loadOverview` in the store works them out one site at a time; places that never see Earth sit under their own heading), a relief map of the pole with one pin per site (names written where they fit, `src/lib/viz/maplabels.ts`), and a form that computes any other place south of 60° S. A row opens Explore on the landing date it names, where every figure of the row is one Explore shows.
- `/explore`: the answer for one site and period. The answer says how long the power lasts and why, and offers the landing date inside the period that gives the longest time with power ("Land on 20 January instead"); a link searches the next 12 months. Below it: the numbers, a chart of the Sun, Earth and the battery hour by hour on one time axis, the ground (one sentence for the time bar's hour: is the site lit, can Earth be reached; then three tabs: "Shadow map" with north up, "3D from above" (the same light on the terrain) and "Horizon chart" (the hills all round with the Sun's and Earth's paths); a site with no polar terrain opens on the horizon chart and shows the globe in 3D), where the site is with its nearest neighbours within 300 km, and the assistant; the time bar stays at the bottom of the window. `?site=&start=&days=` opens a site and period.
- `/explore/stand`: "Stand on the Moon", the full-window view from the site (`src/components/stand/`), opened by "Stand at the site" beside the ground panel's tabs and under the answer. `?site=&start=&days=&hour=` as Explore plus the hour; `?quality=fast` for weaker graphics (pixel ratio 0.75, no drawn detail, coarser shadow steps). It reuses the store, the words (`src/lib/viz/stand.ts`: the headline, the lander's state, the key moments and their captions, the Sun and Earth labels, the line on what is measured and what is drawn, and the reasons under "Why this happens") and the time bar, which carries the key moments as flags; without WebGL 2 it shows the horizon chart. The development laptop's integrated graphics are not a target; the demo runs on a laptop with a discrete GPU.
- `/compare`: "Compare sites". Up to four sites in one table for the same period and lander: a small Sun and Earth strip per site (`src/components/compare/MiniStrip.tsx`), sunlight, Earth in view, longest night, time with power from the period's first day and the verdict, with one sentence above the table that names the best site for each measure, every tied site included (`src/lib/viz/compare.ts`). Empty, it offers two ready pairs; with two sites or more, a link searches the next 12 months for the landing day that is best on average.
- `/validate`: "Accuracy". Three checks, each with its pass mark, headline figure and plain sentence (`src/lib/viz/checks.ts`), and its table behind "Show the numbers": directions to the Sun and Earth against JPL Horizons (the live re-check runs through `/api/horizons`), sunlight against the LOLA illumination map, predicted sunsets against the reported ends of three missions. Then the error budget and the test count; `npm run validation:tests` refreshes the count in `public/validation/tests.json`.
- `/brief`: a printable page for the selected site and period: Explore's answer and its sentences, five numbers (sunlight, contact with Earth, longest night, time with power, battery when full), the Sun's and Earth's rows over the period, the lander, the method and the data, and a paragraph written from the numbers (by a model when one answers and every number checks out, otherwise by a template). The rows keep their black background in print.
- `/learn`: "How it works". The home page's three drawings, the science behind them (the Moon's tilt, libration, how to read the charts, the battery sum) and five steps through the pages (`src/lib/learn/story.ts`), then the way to the site list.
- `/api/chat`: the assistant (task `plan`) and the brief narrator (task `narrate`) on OpenRouter; see `.env.example`. Without a key, or with `?demo=1`, answers come from `src/lib/ai/transcripts.json` and the phrase matcher.

Time with power (`src/lib/engine/landing.ts`) is the hours from landing, with the battery as charged as the lander settings say (full by default), to the first hour the battery cannot cover, counted up to the length of the period. Its Python reference is `pipeline/lunar_pipeline/landing.py`; `uv run python -m lunar_pipeline.cli fixture-landing --site ID [--start UTC] [--days N]` (from `pipeline/`) writes a golden file into `data/fixtures/landing/` that the TypeScript tests check against.

Terrain and shadows. `uv run python -m lunar_pipeline.cli terrain` (from `pipeline/`) cuts a height window for every polar site in the catalogue (20 m per pixel inside 87.55° S, 80 m elsewhere), an 80 m context grid around each 20 m window and the 960 m south cap, listed in `data_out/terrain/manifest.json` (version 2); `sync-local` copies them to `public/data/terrain` (git-ignored; tests that need them skip without them). The shadow map is one sweep per grid along the Sun's direction, keeping the running maximum of the tangent height minus distance times the tangent of the Sun's elevation, coarse to fine (`src/lib/engine/shadow.ts`): a ±230 km crop of the cap, the context, then the window, so hills outside the window still shade it. It runs in `src/workers/shadow.worker.ts` through `src/lib/shadow-client.ts` (an overtaken hour's picture is dropped): half resolution at once and full resolution once the hour rests (`useShadowPicture`), measured in the browser at about 37 ms and 135 ms for a 1024 by 1024 window. The 3D terrain is painted with the same picture instead of GPU shadows. Its Python reference is `pipeline/lunar_pipeline/shadow.py`; `uv run python -m lunar_pipeline.cli fixture-shadow` writes `data/fixtures/shadow/`, and `shadow-acceptance.test.ts` checks that de Gerlache Rim 2's pixel is lit when the engine has the Sun up in at least 97 % of the hours of January 2027. `next.config.ts` makes the browser check `/data` files again on every load, since the pipeline rewrites them under the same names.

## The sky (`src/lib/sky/`)

The stand view's maths, each piece tested against SPICE or the engine:

- `frames.ts`: the site's east, north and up in the Moon-fixed frame; azimuth and elevation to world directions (x east, y up, z south).
- `moonOrientation.ts`: the Moon's orientation every 6 hours (`data/sky/moon_me_6h.f32`, J2000 to MOON_ME from SPICE, 2024 to 2036), slerped; 60 off-grid times within 0.001° of SPICE.
- `stars.ts`: the Yale Bright Star Catalogue (`data/sky/stars.bin`, 8,404 stars to magnitude 6.5) placed for a site and hour; within 0.01° of SPICE at two sites and five hours.
- `earth.ts`: Earth's lit fraction and its turn, by the IAU model SPICE uses for IAU_EARTH (within 0.05°).
- `terrainField.ts` and `shadowRule.ts`: the shadow levels as heights in the site's frame (curvature dropped), and the per-pixel shadow rule the ground shader runs: the steepest rise towards the Sun against the Sun's elevation, the Sun's disc for the penumbra, samples from beyond the point's own cell out to 150 km. Its TypeScript twin agrees with the engine on 712 of the 720 hours of January 2027 at de Gerlache Rim 2 (the misses: the Sun half hidden at sunset and sunrise).
- `shaders.ts` and `standRenderer.ts`: the scene (ground meshes from 20 m to 960 m cells out to 125 km, the far skyline as a ring, the stars, the Sun at its true 0.53° with a faint glare, Earth) with regolith light (Lommel–Seeliger, a lunar phase curve, the opposition surge), metre-scale craters and stones drawn near the eye that cast their own shadows, and your own shadow (a person 1.8 m tall). The exposure stops down as a camera's would, looking down-Sun at sunlit ground or with the Sun in the frame; by day the stars show only once the view looks up. `buildScene` needs no WebGL, so the camera and the labels are tested in Node.
- `landerShape.ts`: the drawn lander's shape in one table; the model is built from it and the ground shader casts its soft shadow from it (the Sun's disc as the penumbra), so the two always match.
- `boulders.ts`: fourteen drawn boulders and 360 pebbles, seeded by the site and kept clear of the lander and the line to it; the ground shader casts the boulders' shadows.
- `framePacer.ts`: when the view draws: every frame while something moves, one sharp frame after 300 ms of rest, then nothing; a slow graphics chip never queues frames it has not finished.

`uv run python -m lunar_pipeline.cli fetch --group sky`, then `sky` and `fixture-sky` (from `pipeline/`), write `data/sky/` and `data/fixtures/sky/`; `sync-local` copies `data/sky` to `public/data/sky`.

## Themes

Light is the default; the header switch changes it and the choice is kept in `localStorage` under `earthrise.theme`. `?theme=dark` or `?theme=light` sets the theme for one visit without changing the stored choice. The system preference is not followed. An inline script in `src/app/layout.tsx` sets `data-theme` on `<html>` before the first paint (`src/lib/theme.ts`). Colours are tokens in `src/app/globals.css` (the dark values also apply inside `.theme-dark`, which the stand view uses so its time bar stays dark under the black sky); picture panels ("stages": charts on black, the shadow map, 3D) keep the same dark colours in both themes. The design is in `docs/superpowers/specs/2026-10-01-ui-redesign-design.md`.

Text never scales with a picture: labels on charts and drawings are page text laid over the drawing (`src/components/SkyRow.tsx`), so nothing falls under 13 px on a narrow screen.

The look, in short (reasoning in section 15 of the design): the palette is the Moon's own three tones, shadow black for picture panels, regolith grey for the page and sunlit white for panels, with colour kept for the Sun (gold) and Earth (blue). Headlines use the class `display` (Bricolage Grotesque at 87.5 % width, weight 700). Pictures have a 6 px radius, panels and controls 8 px. The only motion that plays by itself is on the home page, where the Sun's line is drawn once from left to right (`reveal` on `SkyRow`); reduced motion shows the finished picture.

## Home page assets

    # from pipeline/
    uv run python -m lunar_pipeline.cli home-assets

writes `public/hero/de-gerlache-rim-2.jpg` (the shadow map on the home page, computed from three LOLA grids), `public/maps/south-pole-relief.jpg` (the relief map with site positions) and `src/lib/data/home.json` (the month charted on the home page and the headline figures of the three checks). Run it again after the validation tables or the site catalogue change; `src/lib/data/home.test.ts` fails when `home.json` has drifted from the validation tables.

## Assistant and narration

The assistant is the panel "Ask in plain words" on Explore and Compare (`src/components/PlannerChat.tsx`). `src/lib/ai/`: `actions.ts` (closed action schema, validator, site matcher, `applyActions`, the notes in the pages' words), `intents.ts` (twelve rehearsed phrasings, among them "make it 90 days" and "find the best landing date for 14 days"), `explanations.ts` (five fixed paragraphs), `state-summary.ts` (the compact state sent with each question), `openrouter.ts` (model chain with timeouts), `protocol.ts` (system prompt, lenient JSON extraction, reply types), `cache.ts` + `transcripts.json` (twelve rehearsed answers), `rate-limit.ts`, `narrate.ts` (number check and template brief), `client.ts` (browser calls). The catalogue the server validates against is `src/lib/data/catalogue.json`, written by the pipeline's `sync-local`.

## Power and contact

- `src/lib/engine/power.ts`: irradiance, panel geometries, battery simulation (`powerBudget`), pinned to `data/fixtures/power/` written by `pipeline/lunar_pipeline/power.py`.
- `src/lib/engine/metrics.ts`: `withCommsThreshold`, `contactWindows`, `windowScore`, and `Series.sunAu`.
