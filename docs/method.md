# Method (Week 1 reference implementation)

## Sun and Earth positions
- SPICE DE440 (`de440s.bsp`), lunar orientation `moon_pa_de440_200625.bpc`, frame `MOON_ME` (alias of `MOON_ME_DE440_ME421`), aberration `LT+S`, observer = Moon centre.
- Hourly table 2024-01-01T00:00 → 2036-12-31T23:00 (113,976 steps), float32 km, Catmull-Rom interpolation between samples (error below 0.002° at half steps).
- Topocentric az/el from a site on the 1737.4 km sphere with the site offset subtracted (Earth parallax up to 0.26°). Sun/Earth directions are evaluated with site height 0 m (matches the Horizons fixtures at alt = 0); the DEM height + mast enter the horizon mask only. Effect on az/el is below 0.001°.

## Terrain horizon
- LOLA polar DEMs (20 m to 6 km, 80 m to 100 km, 240 m to 220 km), 720 azimuths, great-circle march, exact spherical curvature, bilinear sampling. Observer mast 2 m.
- Where a ring leaves its DEM (sites near a grid edge, e.g. IM-1 at 80.13°S), the missing distances are re-marched on the next coarser DEM instead of being dropped.
- Sunlit fraction = fraction of the solar disk (radius 0.267°) above the skyline; Earth visible when the Earth centre is above the skyline.

## Cross-checks (from `data/fixtures/horizons/summary.json` and the report command)
- JPL Horizons, 6 sites × 2 bodies × 25 epochs (300 rows, 2025–2026): max |Δel| = 2.7e-5°, max |Δaz·cos el| = 2.6e-6° (about 0.1 arcsec).
- Mazarico et al. 2011 maps at the Shackleton rim high point (−89.781°, −156.257°). Two of our quantities are comparable: `illum_fraction` = fraction of hours with any part of the solar disk above the skyline (0.907 over 2025–2026), and `mean_sun_fraction` = time-averaged visible disk fraction (0.862). The map value `AVGVISIB` = 0.796 (2009–2013 span, 60 m DEM, no mast). Earth visibility: ours 0.500 vs map 0.533. Systematic differences: our point is the 20 m argmax peak (map pixel is 60 m), we add a 2 m mast, and the spans differ; the sign (ours higher) is consistent with all three.
- Shackleton crater centre: 0 % sunlit and 0 % Earth-visible in both our series and the Mazarico maps (permanently shadowed).
- Longest continuous darkness at the Shackleton rim high point over 2025–2026: 63 h; longest Earth gap: 334 h.

## Power budget (Week 4)

Irradiance on a Sun-facing surface is 1361 W/m² · (1 AU / d)² · f, where d is the Sun distance from the DE440 table and f the visible fraction of the solar disk above the terrain skyline (section "Terrain horizon"). Panel output is P = η · A · irradiance · max(0, n · s) with the panel normal n for four geometries: horizontal (n = up, n · s = sin el), vertical fixed at azimuth φ (cos el · cos(az − φ)), vertical turning to the Sun's azimuth (cos el) and two-axis tracking (1). The battery walk uses one-hour steps: E(t+1) = min(C, E(t) + (P − L) · 1 h); an hour whose deficit exceeds the stored energy is a brownout and leaves the battery empty. Reported: minimum state of charge, brownout hours, first brownout hour, and the time with power (for example "power for 3 days 4 hours, then night"). Reference implementation: `pipeline/lunar_pipeline/power.py`; golden fixtures under `data/fixtures/power/` pin `web/src/lib/engine/power.ts` to 1e-6 W. The default configuration (vertical panel turning to the Sun, 4 m², a 30 % panel, 200 W load, 2000 Wh battery) is illustrative of a small lander, not any specific vehicle.

## Direct-to-Earth contact (Week 4)

Earth is in view when its elevation exceeds the skyline at its azimuth by the minimum elevation the planner sets (0–10°). Visibility windows are maximal runs of visible hours. This is geometric Earth-centre line of sight, not a radio link-budget or ground-station availability calculation. Mast height changes the skyline itself: the browser worker recomputes the selected site's skyline with the new mast; featured skylines are computed with a 2 m mast.

## Best window (Week 4)

The year finder scans up to 365 days after the chosen start in six-hour arrival steps, limited to arrivals for which the whole requested stay fits in the ephemeris table. It maximizes continuous powered hours from arrival to first brownout, then the fraction of those hours with Earth in view, then chooses the earliest tie. Across several sites it maximizes mean powered duration; this may hide a weak individual site, so inspect the per-site rows. Only arrivals with some visible Sun at every target site are candidates. “Best sampled” refers to this objective and sampling, not a global optimum or a mission-feasibility guarantee.

The Plan workbench stores independent site/date/lander scenarios and screens them against explicit continuous-operation, powered Earth-visibility and maximum Earth-gap requirements. Requirements do not change the physical simulation or establish flight safety. Shared comparisons preserve the full input assumptions.

## Validation (Week 5)

`uv run python -m lunar_pipeline.cli validate` writes three tables into `data/validation/` (synced to the web app and shown on `/validate`):

- `horizons.json`: every stored JPL Horizons row (six sites, Sun and Earth, 2025-2026 every 30 days, `CENTER=coord@301`) next to our own azimuth and elevation; worst difference 2.7e-5° in elevation and 2.6e-6° in azimuth over 300 rows. The page can re-query JPL live for eight epochs in 2026 through `/api/horizons` (a server-side proxy with a 12 s timeout) and falls back to the stored table when JPL is unreachable.
- `mazarico.json`: our sunlit fraction (hourly 2024-2036, 2 m mast) against the LOLA average-visibility map `avgvisib_85s_060m_201608` (60 m/px, south of 85°S) at the 15 covered sites; within 5 points at 11 of them, worst +10.8 points at the Shackleton rim high point. High points read a few points brighter here because the map sees no mast and averages other years.
- `backcasts.json`: the predicted local sunset after each CLPS landing (LOLA skyline, or a flat horizon for the mare site) against the reported end of the mission: Blue Ghost Mission 1 lasted 2.4 h past our predicted sunset (Firefly reported about 5 h), IM-2 died 299 h before its sunset on its side in a crater, IM-1 lost power about three days before its sunset with tilted panels.

Uncertainty: direction agreement is measured against the Horizons fixtures (worst elevation gap about 3e-5°). The quoted 0.05–0.15° terrain-horizon estimate is illustrative, not an established bound at every location. Matching Python and TypeScript validates implementation consistency rather than independent terrain truth. Events are estimated hourly; terrain error can shift them further, particularly at grazing crossings. No universal ±15–60-minute timing bound has been established.

## Model scope and interpretation

Power uses a constant load and fixed efficiency, with idealized charging and no thermal model, battery-temperature effects or restart energy. Power becoming available after a brownout does not establish vehicle survival or restart. Earth visibility checks the Earth centre against the terrain skyline plus the selected clearance; antennas, link budget, Earth ground-station coverage and scheduling are not modeled. Region-centre coordinates can be approximate by about 5 km; a single-point result must not be interpreted as the whole region.

The Mazarico comparison uses different terrain resolution, observer height and date coverage. These are possible explanations for discrepancies, not a measured allocation of error. A stronger independent validation would match coordinates, observer height, averaging interval and illumination definition, compare terrain resolutions explicitly, and validate event times using finer temporal samples. Mission-end comparisons are illustrations: Blue Ghost uses a flat mare horizon, and the early IM-1/IM-2 endings do not validate a polar skyline.
