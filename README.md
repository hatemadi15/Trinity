# Earthrise

Compare lunar south-pole landing sites and dates: Sun and Earth above the terrain horizon, solar
power potential, direct-to-Earth communication windows. NASA Space Apps 2026 — challenge
"CLPS Lunar Mission Browser" — team Astroy/Ed.

- `pipeline/` — offline Python pipeline (NASA SPICE, LOLA DEMs, LOLA illumination maps) → `data/`
- `web/` — Next.js app with the TypeScript science engine
- `docs/` — design spec, weekly plans, method notes, data credits

## Week 4 features

- Compare up to four sites over the same window and planner settings, with sparklines, six KPIs and a survive-the-night verdict per site.
- Best-window finder: scans the next year from the start date and moves the window to the best-scoring span, opening at sunrise.
- Planner settings: solar panel model, area, efficiency, load, battery, minimum Earth elevation and mast height (mast changes recompute the skyline in the browser).
- Site catalogue with the nine Artemis III candidate landing regions (October 2024 list) and the Shackleton–de Gerlache Connecting Ridge.

## Week 5 features

- Validate page (`/validate`): JPL Horizons cross-check with a live re-check, LOLA illumination-map agreement, and CLPS mission backcasts (Blue Ghost M1, IM-1, IM-2) against reported mission ends, plus the error budget and automated-test counts.
- Mission brief (`/brief`): a printable one-page summary of the selected site and window (verdict, six numbers, timeline, sky dome, method, data); Print or save as PDF.
- Learn mode: a header toggle that keeps four plain-language tiles and adds a five-step guided story; `/learn` introduces it.

## Week 6 features

- Planner assistant: a strip on Explore and Compare turns plain questions into validated actions on the same controls, through `/api/chat` on OpenRouter's free models (temperature 0, two calls at most) with rehearsed transcripts and a phrase matcher as fallbacks; the source of every answer is shown. `?demo=1` forces the rehearsed answers for the pitch.
- Narrated brief: the brief opens with a paragraph checked number by number against the figures; the template wins any doubt.
- Landing page with three mission cards (de Gerlache Rim 2, IM-2 Athena, Blue Ghost Mission 1) that open Explore on the site and date; `/explore?site=&start=&days=` is shareable. Mare sites get a flat skyline and the globe view.
- Hosting preparation (`docs/hosting.md`, `publish-r2`) and the submission package drafts (`docs/submission.md`, `docs/pitch.md`, `docs/video-storyboard.md`, `docs/demo-checklist.md`).

## Hosting

The app deploys to Vercel (root `web/`); the data files are published to a Cloudflare R2 bucket with `uv run python -m lunar_pipeline.cli publish-r2` and fetched from `NEXT_PUBLIC_DATA_BASE`. Steps, environment variables, CORS, the offline venue mode and a go-live checklist are in `docs/hosting.md`.
