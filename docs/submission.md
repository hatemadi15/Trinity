# Project page draft — Earthrise (NASA Space Apps 2026, Beirut)

Challenge: **CLPS Lunar Mission Browser**. Team: **Astroy/Ed**. Status: draft for the Space Apps project page; sections follow the submission form. Numbers below come from the validation tables of the current build (generated 2026-11-14), as the Accuracy page (`/validate`) shows them; refresh them before submitting.

## Links and what is still to fill (14 November 2026)

| Link | State on 14 November 2026 |
|---|---|
| Repository | `https://github.com/hatemadi15/Trinity`. **Private**: make it public before submitting, or the judges cannot open or clone it. |
| Live demo | **To fill** once deployed (`docs/hosting.md`): no Vercel project for Earthrise existed in the team's Vercel account. Not `https://earthrise.vercel.app`, which is an unrelated site. |
| 30-second video | **To fill** once recorded (`docs/video-storyboard.md`). |
| Data zip (GitHub Release) | **To fill** once published (`docs/hosting.md`, section 3); the repository had no releases. |

Two statements below are the team's to confirm before pasting, marked **To confirm**: how the changes were reviewed (Use of Artificial Intelligence) and the dates of the pre-existing work.

## High-level project summary (≤ 250 words)

Earthrise is a browser tool that lets mission planners, educators and the public compare lunar south-pole landing sites and dates. Pick a site and a landing date and it answers in one sentence how long a solar lander keeps power and how much of that time Earth is in view for radio: "Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night." Then it shows why, hour by hour: the Sun and Earth against the hills in their direction (NASA LRO LOLA elevation grids, JPL DE440 ephemeris), the battery's charge, and the ground as a shadow map and in 3D. It suggests a better landing day or place nearby, searches the next 12 months, compares up to four sites, prints a one-page brief, and takes plain questions through an assistant that moves the same controls. A first-person view stands you at the site under the real sky, and the home page flies you there from space. Every number is computed in the browser; a prepared laptop runs it offline.

The Accuracy page shows what each check establishes and what it leaves out: our Sun and Earth directions against JPL Horizons (300 rows, worst 0.00003°), our sunlight against NASA's LOLA 18.6-year illumination maps worked out the maps' way (typical gap 0.9 points at 15 sites), and the battery sums against worked answers. Three real landers are context, not a check.

## Project details

### The problem

Missions to the Moon's south pole live or die by two questions: when is the Sun above the local horizon, and when can a radio see Earth? The answers depend on terrain a few kilometres away and change hour by hour. The tools that answer them (SPICE, GIS stacks, illumination maps) are exact but slow to set up, and comparing two sites for two dates means running them once for each.

### What Earthrise does

- **The arrival (home page)**: a flight from the whole Moon, with Earth just beyond its south pole, down over the pole, the polar cap and the ridge to a landing beside a lander at de Gerlache Rim 2 on 1 January 2027, then that month at the site, sped up. "Fly to the south pole" plays it in 21 seconds and it ends on the answer for the site, with "Open the full forecast" under it.
- **Choose a landing site**: the 34 places in the catalogue (the nine Artemis III candidate regions NASA named in October 2024; the landing spots of IM-1, IM-2 and Blue Ghost Mission 1 and the coming IM-3 and CP-12 landings; the six Apollo landings; the landers of India, China and Japan and the target of Russia's Luna 25; and high points, ridges and crater floors around Shackleton and de Gerlache), each marked with what kind of point it is (a lander found in orbital images, a landing target, the centre of a region with its radius, a high point derived from the heights and never checked for landing, or a reference), sorted by how long a lander keeps power from its best landing day in the chosen period, with their sunlight and contact with Earth, on a relief map of the pole. Chang'e 4, Chang'e 6 and CP-12's basin, on the far side, sit under a heading of their own: Earth never rises there. Any other point south of 60° S is worked out in the browser (2.1 s for -88.2°, 40° on a 4-core Linux computer in Chromium, 14 November).
- **Explore**: one site, one period (a landing date and hour in UTC and a length of 2 to 90 days; steps of an hour and a day either way, and a shift by any number of days or hours), answer first. The answer is for a lander that lands on the period's first day: how long it keeps power, why it stops, and how much of that time Earth is in view. It offers a better landing day inside the period ("Land on 20 January instead") or a site nearby that does clearly better, and a search of the next 12 months. Below it: the numbers, with the Sun's height at the time bar's hour and its highest; a chart of the Sun's and Earth's heights against the hills in their direction and of the battery's charge, hour by hour; the radio windows (each stretch with Earth in view for a direct link, in UTC, which of them the lander has power for, and the longest time without Earth, labelled as geometric visibility rather than a scheduled contact); the ground at the hour of the time bar (a north-up shadow map computed from the elevation data, the same light on the terrain in 3D, and the view all round with the Sun's and Earth's paths); and where the site lies, with its nearest neighbours. A time bar at the bottom plays the period hour by hour and counts down to the next sunset or sunrise and to Earth's next rising or setting.
- **The lander**: three ready-made landers (4 m² of panel, 200 W and a 2 kWh battery; 8 m², 400 W, 20 kWh; 20 m², 500 W, 50 kWh) or your own: the panel (upright and turning to the Sun, upright and fixed, flat on the deck, or following the Sun in two axes), its area and efficiency, the power the lander uses, the battery and its charge at landing, how high Earth must stand above the hills for radio, and the mast height (a new mast height traces the hills again in the browser).
- **Stand on the Moon (/explore/stand)**: the view from the site under the real sky, opened from Explore with "Stand at the site": NASA's ground out to 125 km, the Sun at its true size, Earth and the stars, a lander beside you for scale, the answer first on a plate at the top, with the better landing day under it, and Brighter picture for projectors. Play lets you watch the month go by at the speed you choose, stopping on each key moment and turning to it; Next steps from one moment to the next; and the better landing day is one click away.
- **Compare sites**: a baseline and up to three scenarios, each with its own site, UTC landing hour, stay (2 to 90 days), lander, mast and Earth clearance, worked out on its own: "Compare from here" on Explore makes the landing shown the baseline, "Slip the landing" adds the same site days or hours later in one press, and "Find a nearby alternative" adds the best catalogue site within 30 km for that scenario's settings. The page says what changed at the original site and why, which alternative works better and the trade-offs (sunlight, time with power, radio contact while it has power, Earth in view, the longest time without Earth, first sunset and Earthset after landing), then every setting and figure side by side with the signed change from the baseline, and says whether the scenarios share a landing time or each uses its site's own best one. The address carries the whole comparison, versioned scenario files save and reopen it with the app and data versions, and `/compare/brief` prints it.
- **Ask in plain words**: typed questions ("compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days", "find the best landing date for 14 days", "explain the longest night") are turned into validated actions on the same controls. The assistant never computes physics; every number on screen comes from the engine.
- **Accuracy**: opens with "Three checks meet their criteria; past missions are context, not a check." Each check has a pass mark, a headline figure, what it shows, when it passes, what it was tested on and what it leaves out, and its full table on request; the directions check has a live re-check against JPL Horizons, and the power sums are worked out in the browser. The missions say what they can and cannot tell. Every panel names the data it draws on.
- **The brief**: one printable page with the answer, five numbers, the Sun's and Earth's rows over the period, the method and the data, and a narrated paragraph checked claim by claim against the figures.
- **How it works**: three drawings of why the south pole is hard, the science behind them (the Moon's 1.5° tilt against Earth's 23.4°, libration, how to read the charts, the battery sum) and five steps through the pages, and how to run it offline, in plain words for students and the public.

### How it works

Sun and Earth positions come from a precomputed hourly table (2024–2036) built offline with SPICE from the JPL DE440 ephemeris in the MOON_ME frame and interpolated in the browser (Earth parallax included). The hills on the horizon are traced through nested LOLA elevation grids (20 m posts within 6 km, 80 m to 100 km, 240 m to 220 km; north of 80° S the 240 m grid alone) in 720 directions from a mast at the chosen height, with the Moon's curvature; outside the polar grids, as at the Apollo sites, the horizon is flat. The Sun counts as up when any part of its disk clears the hills; Earth counts as in view when its centre clears them by the chosen margin. Power is efficiency × area × 1361 W/m² ÷ AU² × visible Sun fraction × panel cosine; the battery charges with the surplus and empties on the deficit in one-hour steps. The time with power runs from landing to the first hour the battery cannot cover, up to the length of the period; the best landing day is the sunlit hour that gives the longest time with power, with more contact with Earth breaking ties. The shadow map sweeps each elevation grid along the Sun's direction, coarse to fine, so hills beyond the site's own grid still cast their shadows, and the 3D terrain is lit with the same picture. The Python pipeline is the reference implementation; the TypeScript engine is pinned to it by golden fixtures (masks within 0.0005°, metrics exact).

### Validity

| Evidence | Result (tables generated 2026-11-14) |
|---|---|
| Check: Sun and Earth directions vs JPL Horizons (six sites × two bodies, 2025–2026, every 30 days at 00:00 UTC). Geometry only, not terrain | 300 rows, worst 2.7e-5° in elevation, 2.6e-6° in azimuth × cos(el), against a 0.01° target; live re-check button on the Accuracy page |
| Check: sunlight and Earth in view vs the LOLA average-visibility maps (60 m/px, south of 85°S, hourly over 18.6 years), worked out the maps' way: from the ground, any part of the disc, 60 m terrain at the maps' pixel centres | 15 covered sites. Sun: typical gap 0.9 points, 14 within 5. Earth: typical gap 0.2 points, 14 within 5. The outlier is the pole, where one map pixel reads 0 % among lit ones (−0.3 points without it). The app's own numbers (2 m mast, finer terrain, Earth's centre) sit a typical 2.6 points from the Sun map and 4.1 from the Earth map. Agreement between two LOLA-based models, not a ground observation |
| Check: the power and battery sums | 9 worked cases agree with the hand answers to 1e-6 W, in the pipeline and in the browser; 5 recorded runs pin the app's engine to the pipeline. The sums, not real hardware |
| Context (no pass mark): predicted sunset vs reported mission end | Blue Ghost M1: +2.4 h (flat mare horizon). IM-1: −67 h, tipped over with panels away from the low Sun. IM-2: −299 h, on its side in a crater. Reported events, not observed sunsets, and not a test of battery survival |
| Automated tests | Last run 14 November 2026, 12:06 UTC, on commit 77ca0ec with every data part present: in the app 1,583 passed, 0 skipped, 0 failed (146 files); in the Python pipeline 147 passed, 0 skipped, 0 failed (run, not only collected). The Accuracy page shows the last run (`npm run validation:tests`). |

Error budget, measured for every featured site over 2025–2026 (docs/method.md, "Uncertainty budget"): the directions are good to 3e-5° (under 4 s of time at any event); the hourly steps put each event up to 1 h late; the terrain data, compared with NASA's adjusted south-pole elevation maps (PGDA product 90) and their stated height error, moves events by under an hour at some sites and by up to a day at grazing high points (95th percentile, site by site). Each time in the app carries the sum as its margin, for example ±3.5 h for a sunset at Connecting Ridge and ±10.5 h at the Shackleton rim summit. The power figures count electrical energy only: they do not show whether a lander keeps warm through the night or starts again after it.

### Impact and next steps

On a 4-core Linux computer in Chromium, Explore gave its answer for a catalogue site 3.5 s after the page opened, and 0.7 s for the next site (14 November). How much time that saves a planner against their usual tools has not been measured: no study with planners has been run yet, and that evaluation is still to be done. Planners can hand the brief to an engineering team; educators and the public get the same pages in plain words, a page that explains them in five steps, and real missions to replay. Next: NAC imagery per site, relay-satellite passes, and a public API for the tables. Next, a terrain ensemble from NASA's adjusted south-pole maps, to show how often each landing still works, and a layer of modelled cold traps from LRO Diviner beside each site's power and radio windows, labelled as modelled conditions, not detected ice (docs/ml-feasibility.md).

## Use of Artificial Intelligence

- **In the product**: an assistant ("Ask in plain words", on Explore and Compare) and a brief narrator call large language models through the OpenRouter API (free models, in the order tried: `qwen/qwen3.8-27b`, `nvidia/nemotron-3-super-120b-a12b`, `google/gemma-4-31b-it`, `nvidia/nemotron-3.5-lightning`). The models translate questions into a closed set of validated actions (select a site, set the period or move the landing, change the lander, add or remove a compared site, find the best landing date, open a page, explain a term) and write one paragraph of the brief. They never compute physics; every claim in a narrated paragraph (each number on its measure, unit, site and sign; any stated state, comparison or cause) must hold against the app's own state or the paragraph is replaced by a template; in the assistant's replies, sentences whose claims do not hold are removed; neither may claim the lander survives, since the figures count electrical energy only. Live, the language model answers first, then the app's own phrasings (a phrase matcher), then twelve rehearsed answers, and the source of every answer is shown on screen ("answered by qwen3.8-27b", "matched your words", "rehearsed answer").
- **In development**: the team used Claude Code (Anthropic) as a pair programmer for planning, code, tests and documentation; the commit history in the repository shows every change. **To confirm** by the team before pasting: how the changes were reviewed and run (the draft said "every change was reviewed and run by the team").
- No AI-generated images or video are used.

## Pre-existing code and data

The engine, pipeline and app in the repository were built by the team from 24 September 2026, the date of the first commit, and are published under the repository's licence; the commit history shows the timeline. **To confirm** by the team before pasting: the draft said the work was done between 28 September and 8 November, before the hackathon weekend, with only polish during the event, but the history has commits on 11, 12 and 14 November, adding features as well; describe what was done before and during the event as the history shows it. Third-party libraries: Next.js, React, three.js, react-three-fiber, drei, zustand, vitest, Tailwind; spiceypy, rasterio, numpy, boto3.

## NASA data

| Data | Where it is used |
|---|---|
| LRO LOLA polar elevation models (LDEM 20 m 87.5°S, 80 m 80°S, 240 m 60°S), PDS Geosciences Node | the hills around every site, the shadow map and the 3D terrain, the relief map of the pole, any point picked south of 60°S |
| LRO LOLA average illumination and Earth-visibility maps (Mazarico et al.), 60 m/px south of 85°S, and the LOLA 20 m elevation model to 85°S | the Accuracy page's terrain check (sunlight and Earth in view) |
| JPL DE440 planetary ephemeris and NAIF SPICE kernels (MOON_ME frame) | hourly Sun and Earth table |
| JPL Horizons API | the Accuracy page's directions check and its live re-check |
| NASA CGI Moon Kit (colour, with the poles filled, and LOLA heights at 16 pixels per degree) | the globe in the 3D view, and the Moon from space in the home page's arrival |
| NASA Blue Marble (land, shallow water and topography; clouds), NASA Goddard | Earth in the stand view, turned for the hour |
| Yale Bright Star Catalogue, 5th revised edition, through NASA HEASARC | the 8,404 stars in the stand view's night sky, with their colours |
| NASA Artemis III candidate landing regions (October 2024) | site catalogue |
| NASA CLPS mission records (IM-1, IM-2, Blue Ghost M1 landing sites and reported mission ends) | the Accuracy page's mission context, the two landers on the home page |

## Other data and tools

Intuitive Machines and Firefly Aerospace mission updates (mission end dates), LROC site coordinates, published Artemis III site coordinates (Gracy & Lee 2024; Sánchez-Lozano et al. 2025). Tools: OpenRouter, Vercel, Cloudflare R2.

## Team

Astroy/Ed, Beirut local event.

## Repository

`https://github.com/hatemadi15/Trinity` — `pipeline/` (Python reference implementation), `web/` (the app), `docs/` (method, data credits, hosting, this page).
