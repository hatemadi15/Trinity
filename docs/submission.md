# Project page draft — Earthrise (NASA Space Apps 2026, Beirut)

Challenge: **CLPS Lunar Mission Browser**. Team: **Astroy/Ed**. Status: draft for the Space Apps project page; sections follow the submission form. Numbers below come from the validation tables of the current build (generated 2026-09-29), as the Accuracy page (`/validate`) shows them; refresh them before submitting.

Links to fill in at submission: live demo URL (see `docs/hosting.md`), 30-second video URL, repository `https://github.com/hatemadi15/Trinity`.

## High-level project summary (≤ 250 words)

Earthrise is a browser tool that lets mission planners, educators and the public compare lunar south-pole landing sites and dates in seconds. Pick a site and a landing date and it answers in one sentence how long a solar lander keeps power there and how much of that time Earth is in view for radio: "Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night." Then it shows why, hour by hour: the Sun and Earth against the hills in their direction (NASA LRO LOLA elevation grids, the JPL DE440 ephemeris), the battery charging and running down, and the ground as a shadow map and in 3D. It suggests a better landing day or a better place nearby, searches the next 12 months for the best landing day, compares up to four sites in one table, prints a one-page brief, and takes plain questions through an assistant that moves the same controls. Everything is computed in the browser, so it works offline.

The numbers are checked, not asserted: the Accuracy page compares our Sun and Earth directions with JPL Horizons (300 rows, worst difference 0.00003°), our sunlight with NASA's LOLA multi-year illumination map (11 of 15 sites within 5 points), and our predicted sunsets with what happened to three commercial landers: Blue Ghost Mission 1 sent its last signal 2.4 hours after our predicted sunset; IM-1 and IM-2 ended early, for reasons the page states.

## Project details

### The problem

Missions to the Moon's south pole live or die by two questions: when is the Sun above the local horizon, and when can a radio see Earth? The answers depend on terrain a few kilometres away and change hour by hour. The tools that answer them (SPICE, GIS stacks, illumination maps) are exact but slow to set up, and comparing two sites for two dates takes a specialist a day.

### What Earthrise does

- **Choose a landing site**: the 19 places in the catalogue (the nine Artemis III candidate regions NASA named in October 2024, the landing spots of IM-1, IM-2 and Blue Ghost Mission 1, and high points, ridges and crater floors around Shackleton and de Gerlache), sorted by how long a lander keeps power from its best landing day in the chosen period, with their sunlight and contact with Earth, on a relief map of the pole. Any other point south of 60° S is worked out in the browser in a few seconds.
- **Explore**: one site, one period (14, 30 or 90 days from a chosen date), answer first. The answer is for a lander that lands on the period's first day: how long it keeps power, why it stops, and how much of that time Earth is in view. It offers a better landing day inside the period ("Land on 20 January instead") or a site nearby that does clearly better, and a search of the next 12 months. Below it: the numbers, a chart of the Sun's and Earth's heights against the hills in their direction and of the battery's charge, hour by hour; the ground at the hour of the time bar (a north-up shadow map computed from the elevation data, the same light on the terrain in 3D, and the view all round with the Sun's and Earth's paths); and where the site lies, with its nearest neighbours. A time bar at the bottom plays the period hour by hour.
- **The lander**: three ready-made landers (4 m² of panel, 200 W and a 2 kWh battery; 8 m², 400 W, 20 kWh; 20 m², 500 W, 50 kWh) or your own: the panel (upright and turning to the Sun, upright and fixed, flat on the deck, or following the Sun in two axes), its area and efficiency, the power the lander uses, the battery and its charge at landing, how high Earth must stand above the hills for radio, and the mast height (a new mast height traces the hills again in the browser).
- **Compare sites**: up to four sites in one table for the same days and lander: sunlight, Earth in view, longest night and time with power (and when the power comes back), with a small Sun and Earth strip per site and one sentence naming the best site for each measure. A search finds the landing day in the next 12 months that is best on average across the compared sites.
- **Ask in plain words**: typed questions ("compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days", "find the best landing date for 14 days", "explain the longest night") are turned into validated actions on the same controls. The assistant never computes physics; every number on screen comes from the engine.
- **Accuracy**: three checks, each with a pass mark, a headline figure and its full table on request, and a live re-check against JPL Horizons.
- **The brief**: one printable page with the answer, five numbers, the Sun's and Earth's rows over the period, the method and the data, and a narrated paragraph checked number by number against the figures.
- **How it works**: three drawings of why the south pole is hard, the science behind them (the Moon's 1.5° tilt against Earth's 23.4°, libration, how to read the charts, the battery sum) and five steps through the pages, in plain words for students and the public.

### How it works

Sun and Earth positions come from a precomputed hourly table (2024–2036) built offline with SPICE from the JPL DE440 ephemeris in the MOON_ME frame and interpolated in the browser (Earth parallax included). The hills on the horizon are traced through nested LOLA elevation grids (20 m posts within 6 km, 80 m to 100 km, 240 m to 220 km) in 720 directions from a mast at the chosen height, with the Moon's curvature. The Sun counts as up when any part of its disk clears the hills; Earth counts as in view when it clears them by the chosen margin. Power is efficiency × area × 1361 W/m² ÷ AU² × visible Sun fraction × panel cosine; the battery charges with the surplus and empties on the deficit in one-hour steps. The time with power runs from landing to the first hour the battery cannot cover, up to the length of the period; the best landing day is the sunlit hour that gives the longest time with power, with more contact with Earth breaking ties. The shadow map sweeps each elevation grid along the Sun's direction, coarse to fine, so hills beyond the site's own grid still cast their shadows, and the 3D terrain is lit with the same picture. The Python pipeline is the reference implementation; the TypeScript engine is pinned to it by golden fixtures (masks within 0.0005°, metrics exact).

### Validity

| Check | Result (tables generated 2026-09-29) |
|---|---|
| Sun and Earth directions vs JPL Horizons (six sites × two bodies, 2025–2026, every 30 days) | 300 rows, worst 2.7e-5° in elevation, 2.6e-6° in azimuth × cos(el); live re-check button on the Accuracy page |
| Sunlight vs the LOLA average-visibility map (60 m/px, south of 85°S) | 15 covered sites, 11 within 5 points, typical gap 2.6 points, worst +10.8 points at the Shackleton rim high point (a 20 m peak sampled by a 60 m map) |
| Predicted sunset vs reported mission end | Blue Ghost M1: +2.4 h (flat mare horizon). IM-1: −67 h, tipped over with panels away from the low Sun. IM-2: −299 h, on its side in a crater |
| Automated tests | 740 in the web engine and app, 114 in the Python pipeline (2026-10-02); the Accuracy page shows the current count |

Error budget: directions under 0.01°, the hills on the horizon 0.05–0.15°, event timing ±15–60 minutes near the pole (hourly series, the Sun moves 0.5° per hour along the horizon).

### Impact and next steps

Planners get a first answer in a minute instead of a day and can hand the brief to an engineering team; educators and the public get the same pages in plain words, a page that explains them in five steps, and real missions to replay. Next: NAC imagery per site, a first-person "stand on the surface" view, relay-satellite passes, and a public API for the tables.

## Use of Artificial Intelligence

- **In the product**: an assistant ("Ask in plain words", on Explore and Compare) and a brief narrator call large language models through the OpenRouter API (free models, in the order tried: `qwen/qwen3.8-27b`, `nvidia/nemotron-3-super-120b-a12b`, `google/gemma-4-31b-it`, `nvidia/nemotron-3.5-lightning`). The models translate questions into a closed set of validated actions (select a site, set the period, change the lander, add or remove a compared site, find the best landing date, open a page, explain a term) and write one paragraph of the brief. They never compute physics; every number in a narrated paragraph must appear in the app's own state or the paragraph is replaced by a template. When no model answers, twelve rehearsed transcripts and a phrase matcher answer instead, and the source of every answer is shown on screen ("answered by qwen3.8-27b", "rehearsed answer", "matched your words").
- **In development**: the team used Claude Code (Anthropic) as a pair programmer for planning, code, tests and documentation; every change was reviewed and run by the team, and the commit history is public.
- No AI-generated images or video are used.

## Pre-existing code and data

The engine, pipeline and app in the repository were built by the team between 28 September and 8 November 2026, before the hackathon weekend, and are published under the repository's licence; the commit history shows the timeline. During the event the team polished the assistant, rehearsed the demo, refreshed the validation tables and wrote the project page. Third-party libraries: Next.js, React, three.js, react-three-fiber, drei, zustand, vitest, Tailwind; spiceypy, rasterio, numpy, boto3.

## NASA data

| Data | Where it is used |
|---|---|
| LRO LOLA polar elevation models (LDEM 20 m 87.5°S, 80 m 80°S, 240 m 60°S), PDS Geosciences Node | the hills around every site, the shadow map and the 3D terrain, the relief map of the pole, any point picked south of 60°S |
| LRO LOLA average illumination and Earth-visibility maps (Mazarico et al.), 60 m/px south of 85°S | the Accuracy page's sunlight check |
| JPL DE440 planetary ephemeris and NAIF SPICE kernels (MOON_ME frame) | hourly Sun and Earth table |
| JPL Horizons API | the Accuracy page's directions check and its live re-check |
| NASA CGI Moon Kit (colour and displacement) | the globe in the 3D view |
| NASA Artemis III candidate landing regions (October 2024) | site catalogue |
| NASA CLPS mission records (IM-1, IM-2, Blue Ghost M1 landing sites and reported mission ends) | the Accuracy page's mission check, the two landers on the home page |

## Other data and tools

Intuitive Machines and Firefly Aerospace mission updates (mission end dates), LROC site coordinates, published Artemis III site coordinates (Gracy & Lee 2024; Sánchez-Lozano et al. 2025). Tools: OpenRouter, Vercel, Cloudflare R2.

## Team

Astroy/Ed, Beirut local event.

## Repository

`https://github.com/hatemadi15/Trinity` — `pipeline/` (Python reference implementation), `web/` (the app), `docs/` (method, data credits, hosting, this page).
