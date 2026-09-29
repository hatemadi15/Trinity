# Project page draft — Earthrise (NASA Space Apps 2026, Beirut)

Challenge: **CLPS Lunar Mission Browser**. Team: **Astroy/Ed**. Status: draft for the Space Apps project page; sections follow the submission form. Numbers below come from the Validate page of the current build (2026-09-29); refresh them from `/validate` before submitting.

Links to fill in at submission: live demo URL (see `docs/hosting.md`), 30-second video URL, repository `https://github.com/hatemadi15/Trinity`.

## High-level project summary (≤ 250 words)

Earthrise is a browser tool that lets mission planners, educators and the public compare lunar south-pole landing sites and dates in seconds. Pick a site and a start date and it traces the terrain skyline from NASA LRO LOLA elevation grids, moves the Sun and Earth with the JPL DE440 ephemeris, and shows, hour by hour, when the Sun clears the horizon and when Earth is in view. Six numbers summarise a window (sunlit fraction, longest night, Earth-visible fraction, longest Earth gap, both at once, lowest battery charge), a power budget turns them into a "survive the night" verdict, and a best-window finder scans the next year for the span that keeps a lander lit and in contact. Up to four sites compare side by side; a one-page brief prints; a planner assistant drives the same controls from plain questions. Every computation runs in the browser, so the app works on a laptop without Wi-Fi at the venue.

The numbers are checked, not asserted: a Validate page compares our Sun and Earth directions with JPL Horizons (300 rows, worst difference 2.7e-5°), our sunlit fractions with the LOLA multi-year illumination map (11 of 15 sites within 5 points), and our predicted sunsets with what happened to three CLPS landers: Blue Ghost Mission 1 ended 2.4 hours after our predicted sunset; IM-1 and IM-2 ended early for reasons the page states.

## Project details

### The problem

Missions to the Moon's south pole live or die by two questions: when is the Sun above the local horizon, and when can a radio see Earth? The answers depend on terrain a few kilometres away and change hour by hour. The tools that answer them (SPICE, GIS stacks, illumination maps) are exact but slow to set up, and comparing two sites for two dates takes a specialist a day.

### What Earthrise does

- **Explore**: one site, one window (14, 30 or 90 days). A 3D terrain view with real shadows driven by the computed Sun vector, a globe you can click to pick any site south of 60°S, a sky dome with the skyline and the Sun and Earth tracks, an hourly timeline, and a scrubber that moves everything together.
- **Compare**: up to four sites over the same window and planner settings, one column per site with a sparkline, the six numbers and the verdict; "Best 30-day window" scores the mean over the compared sites.
- **Planner settings**: panel model (horizontal, fixed vertical, vertical turning to the Sun, two-axis), area, efficiency, load, battery, minimum Earth elevation and mast height (mast changes recompute the skyline in the browser).
- **Planner assistant**: typed questions ("compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days", "best 14-day window", "explain the longest night") are turned into validated actions on the same controls. The assistant never computes physics; every number on screen comes from the engine.
- **Validate**: three tables anyone can rerun, with a live re-check against JPL Horizons.
- **Brief**: a printable one-page summary with a narrated paragraph checked number by number against the figures.
- **Learn mode**: fewer numbers, plain words on every tile, a five-step guided story.

### How it works

Sun and Earth positions come from a precomputed hourly table (2024–2036) built offline with SPICE from the JPL DE440 ephemeris in the MOON_ME frame and interpolated in the browser (Earth parallax included). The terrain skyline is traced through nested LOLA elevation grids (20 m posts within 6 km, 80 m to 100 km, 240 m to 220 km) in 720 directions from a mast at the chosen height, with the Moon's curvature. The Sun counts as up when any part of its disk clears the skyline. Power is efficiency × area × 1361 W/m² ÷ AU² × visible Sun fraction × panel cosine; the battery charges with the surplus and empties on the deficit in one-hour steps. The Python pipeline is the reference implementation; the TypeScript engine is pinned to it by golden fixtures (masks within 0.0005°, metrics exact).

### Validity

| Check | Result (2026-09-29 build) |
|---|---|
| Sun and Earth directions vs JPL Horizons (six sites × two bodies, 2025–2026, every 30 days) | 300 rows, worst 2.7e-5° in elevation, 2.6e-6° in azimuth × cos(el); live re-check button on the page |
| Sunlit fraction vs the LOLA average-visibility map (60 m/px, south of 85°S) | 15 covered sites, 11 within 5 points, worst +10.8 points at the Shackleton rim high point (a 20 m peak sampled by a 60 m map) |
| Predicted sunset vs reported mission end | Blue Ghost M1: +2.4 h (flat mare skyline). IM-1: −67 h, tipped over with panels away from the low Sun. IM-2: −299 h, on its side in a crater |
| Automated tests | 322 in the web engine and app, 82 in the Python pipeline (2026-09-29); the Validate page shows the live count |

Error budget: directions under 0.01°, skyline 0.05–0.15°, event timing ±15–60 minutes near the pole (hourly series, the Sun moves 0.5° per hour along the horizon).

### Impact and next steps

Planners get a first answer in a minute instead of a day and can hand the brief to an engineering team; educators get the same screens in plain words; the public can replay real missions. Next: NAC imagery per site, a first-person "stand on the surface" view, relay-satellite passes, and a public API for the tables.

## Use of Artificial Intelligence

- **In the product**: a planner assistant and a brief narrator call large language models through the OpenRouter API (free models, in the order tried: `qwen/qwen3.8-27b`, `nvidia/nemotron-3-super-120b-a12b`, `google/gemma-4-31b-it`, `nvidia/nemotron-3.5-lightning`). The models translate questions into a closed set of validated actions (select a site, set a window, change a setting, open a page, explain a term) and write one paragraph of the brief. They never compute physics; every number in a narrated paragraph must appear in the app's own state or the paragraph is replaced by a template. When no model answers, twelve rehearsed transcripts and a phrase matcher answer instead, and the source of every answer is shown on screen ("answered by gemma-4-31b", "rehearsed answer", "matched your words").
- **In development**: the team used Claude Code (Anthropic) as a pair programmer for planning, code, tests and documentation; every change was reviewed and run by the team, and the commit history is public.
- No AI-generated images or video are used.

## Pre-existing code and data

The engine, pipeline and app in the repository were built by the team between 28 September and 8 November 2026, before the hackathon weekend, and are published under the repository's licence; the commit history shows the timeline. During the event the team polished the planner, rehearsed the demo, refreshed the validation tables and wrote the project page. Third-party libraries: Next.js, React, three.js, react-three-fiber, drei, zustand, vitest, Tailwind; spiceypy, rasterio, numpy, boto3.

## NASA data

| Data | Where it is used |
|---|---|
| LRO LOLA polar elevation models (LDEM 20 m 87.5°S, 80 m 80°S, 240 m 60°S), PDS Geosciences Node | terrain skylines, 3D terrain, custom-site picking |
| LRO LOLA average illumination and Earth-visibility maps (Mazarico et al.), 60 m/px south of 85°S | Validate page agreement table |
| JPL DE440 planetary ephemeris and NAIF SPICE kernels (MOON_ME frame) | hourly Sun and Earth table |
| JPL Horizons API | cross-check table and the live re-check |
| NASA CGI Moon Kit (colour and displacement) | globe texture |
| NASA Artemis III candidate landing regions (October 2024) | site catalogue |
| NASA CLPS mission records (IM-1, IM-2, Blue Ghost M1 landing sites and reported mission ends) | backcasts, landing-page stories |

## Other data and tools

Intuitive Machines and Firefly Aerospace mission updates (mission end dates), LROC site coordinates, published Artemis III site coordinates (Gracy & Lee 2024; Sánchez-Lozano et al. 2025). Tools: OpenRouter, Vercel, Cloudflare R2.

## Team

Astroy/Ed, Beirut local event.

## Repository

`https://github.com/hatemadi15/Trinity` — `pipeline/` (Python reference implementation), `web/` (the app), `docs/` (method, data credits, hosting, this page).
