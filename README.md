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
