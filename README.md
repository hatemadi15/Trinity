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
