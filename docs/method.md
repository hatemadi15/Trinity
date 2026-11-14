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

Earth is in view when its elevation exceeds the skyline at its azimuth by the minimum elevation the planner sets (0–10°). Contact windows are maximal runs of visible hours. Mast height changes the skyline itself: the browser worker recomputes the selected site's skyline with the new mast; featured skylines are computed with a 2 m mast.

This is geometric direct-to-Earth visibility: a clear line from the site to the centre of Earth's disc. It does not by itself establish antenna performance, a link budget, ground-station availability or a scheduled contact, and the app says so once beside its radio windows.

Two conventions, kept apart: the Sun counts as up while any part of its disc is above the skyline (sunlit fraction > 0); Earth counts as in view by its centre, so its disc (about 2° wide from the Moon) is half risen when it starts counting. The status sentence, the numbers, the countdown and the radio windows all read these same two flags.

Radio windows (`web/src/lib/viz/contact.ts`, built on the engine's `contactWindows`): each window's first and last hour on the hourly grid (UTC, the first whole hour of the new state, so the change itself falls within the hour before) and its length; the hours with Earth in view in all; the longest stretch without Earth, counting the stretches cut by the period's start or end, which are reported as "at least" (its length equals the summary's longest Earth gap); and powered contact, the hours with Earth in view and the lander powered, window by window. Powered contact is split at the first power cut: the hours before it are the radio contact while the lander has power that the answer, the numbers card, the brief and Compare give; the hours after the power comes back are reported apart, as they hold only if the lander survives the cold without power, which the energy model does not work out.

Countdown (`web/src/lib/viz/countdown.ts`): at an hour of the period, whether the Sun and Earth are up by the conventions above, and the hours to the first hour with the other state (the hour the key moments give the event). A change that does not come before the period ends is reported as such, never extrapolated. The Sun's elevation is the topocentric elevation above the level horizon (not the skyline), at the time bar's hour and at its highest in the period.

## Best window (Week 4)

The finder scans the 365 days after the chosen start date (clamped to the ephemeris table) in 6-hour steps and scores every window of the chosen length as sunlit fraction + Earth-visible fraction − (longest night + longest Earth gap) / (2 × window hours). Only sunlit start hours are candidates, because a lander arrives in daylight; a site that never sees the Sun in the scan falls back to every start. Without this rule a window that begins mid-night wins by truncating the night at its edge.

## Validation (Week 5)

`uv run python -m lunar_pipeline.cli validate` writes three tables into `data/validation/` (synced to the web app and shown on `/validate`):

- `horizons.json`: every stored JPL Horizons row (six sites, Sun and Earth, 2025-2026 every 30 days, `CENTER=coord@301`) next to our own azimuth and elevation; worst difference 2.7e-5° in elevation and 2.6e-6° in azimuth over 300 rows. The page can re-query JPL live for eight epochs in 2026 through `/api/horizons` (a server-side proxy with a 12 s timeout) and falls back to the stored table when JPL is unreachable.
- `mazarico.json`: our sunlit fraction (hourly 2024-2036, 2 m mast) against the LOLA average-visibility map `avgvisib_85s_060m_201608` (60 m/px, south of 85°S) at the 15 covered sites; within 5 points at 11 of them, worst +10.8 points at the Shackleton rim high point. High points read a few points brighter here because the map sees no mast and averages other years.
- `backcasts.json`: the predicted local sunset after each CLPS landing (LOLA skyline, or a flat horizon for the mare site) against the reported end of the mission: Blue Ghost Mission 1 lasted 2.4 h past our predicted sunset (Firefly reported about 5 h), IM-2's mission ended 299 h before its sunset, on its side in a crater; IM-1 lost power about three days before its sunset with tilted panels.

Error budget: see the next section, which replaces the earlier estimate ("event timing ±15–60 minutes near the pole") with measured margins.

## Uncertainty budget (review P1, November 2026)

`uv run python -m lunar_pipeline.cli uncertainty` writes `data/uncertainty/budget.json` (synced to the app by `sync-local`) and `data/uncertainty/skylines/<site>.json`. For every featured site (the 18 polar sites with a mask and Blue Ghost Mission 1), over the 730 days from 2025-01-01, it measures how far each of the app's event times can be off, from three sources kept apart:

- **Sampling.** The app reads the sky once an hour (the ephemeris table's rows at the top of each hour) and names an event at the first hourly sample in its new state. The pipeline finds the same events every minute from SPICE itself (DE440 `de440s.bsp`, `MOON_ME`, `LT+S`, observer at the Moon's centre, exactly as the table was made, so no interpolation is involved), with the same skyline, the same Sun-disk test (any part of the Sun above the skyline) and the same battery walk at a one-minute step. A Sun or Earth crossing is refined linearly between the two minutes that bracket it; battery times are to the minute. At the hours themselves the one-minute flags agree with the hourly ones at every sample (agreement 1.0 at all 19 sites), and the table's float32 rows sit within 3e-6° of SPICE. Why this is sound: the comparison changes only the time step, so its offsets are the sampling error and nothing else. Over 2,186 Sun and Earth crossings the hourly time is later than the one-minute time by 0 to 1 h (largest 0.998 h, as it must be); over 1,301 battery events the hourly walk's time is within 1 h of the one-minute walk's. Short episodes the hourly series can skip are counted per site (`short_episodes`): Mons Mouton has five sunlit spells under an hour in two years (2.8 h in all).
- **Terrain.** Each polar site's skyline is traced again through PGDA product 90's adjusted LOLA models (Barker et al. 2023): the 20 m model within 6 km of the sites south of 87.55° S, the 80 m model to 100 km and the 240 m model to 220 km, with the app's bands, march, fallback bands and 2 m mast. A control run of the same code on the app's own LOLA grids reproduces the stored masks to 0.0005°. The adjusted skyline is then raised and lowered by one stated height error (the `ERR` maps at the point that makes the skyline and at the site, combined in quadrature, over the distance). The one-minute events under those three skylines are compared with the events under the app's skyline: the terrain spread of an event is its largest shift; an event one of those skylines does not have at all is counted as lost, not as a shift. In 95 % of directions the adjusted skyline lies within 0.01° to 0.99° of ours, site by site; the largest gaps come where the skyline is the ground 100 to 150 m away, so a metre or two of height moves it by most of a degree (at the Shackleton rim summit the adjusted model puts the summit itself 1.7 m lower, and the gap reaches 1.2°).
- **Ephemeris.** The largest gap to JPL Horizons (`data/validation/horizons.json`: 2.2e-6° in height and 2.6e-6° in direction for the Sun, 2.7e-5° and 1.3e-6° for Earth, over 300 rows), added together and divided by the rate of the body's height above the skyline at each one-minute crossing. The 95th percentile is under 4 s at every site (largest single crossing 9 s).

**The margin.** For each site and event the supported plus-or-minus is the sum of the three 95th percentiles of the size of each error (sampling, terrain, ephemeris), rounded up to the next half hour for display. They are added, not root-summed, because the sampling error is one-sided and the terrain spread is not symmetric. A flat-horizon site (Blue Ghost) carries a stated 2.5 h terrain allowance in place of a measurement: Firefly's report puts the sunset Blue Ghost saw about 2.5 h before our flat-horizon sunset (`backcasts.json`). A point that is not in the catalogue gets the largest margin found at the featured polar sites (`pooled.polar.*.largest_shown_h`), and says so.

| Site (condition) | Event | Events | Hourly steps, p95 | Terrain, p95 (lost) | Ephemeris, p95 | Margin |
|---|---|---|---|---|---|---|
| Connecting Ridge (a grazing Sun at a polar ridge) | sunset | 58 | 0.89 h | 2.14 h (0) | 0.8 s | ±3.5 h |
| Connecting Ridge | Earth rises | 27 | 0.97 h | 1.57 h (0) | 1.9 s | ±3.0 h |
| Connecting Ridge | battery runs out | 47 | 0.56 h | 2.45 h (1) | 0.8 s | ±3.5 h |
| Shackleton rim summit (a crater-rim high point) | sunset | 81 | 0.94 h | 9.38 h (13) | 0.6 s | ±10.5 h |
| Shackleton rim summit | battery runs out | 63 | 0.58 h | 17.44 h (15) | 0.5 s | ±18.5 h |
| IM-2 Athena (Earth skimming the horizon) | Earth sets | 27 | 0.90 h | 0.11 h (0) | 3.8 s | ±1.5 h |
| IM-2 Athena | sunset | 31 | 0.85 h | 1.13 h (0) | 0.8 s | ±2.0 h |
| Blue Ghost Mission 1 (far from the pole, flat horizon) | sunset | 25 | 0.94 h | 2.5 h allowed | 0.0 s | ±3.5 h |

What the numbers mean: near the pole the terrain data, not the hourly step or the ephemeris, sets the margin, because the Sun and Earth cross the skyline at a few hundredths of a degree an hour, so a skyline a tenth of a degree higher moves an event by hours. The totals move too: at the Shackleton rim summit the adjusted maps give 86.2 % sunlight against our 90.7 % and a longest night of 126.7 h against our 62.5 h over the same two years; at the peak near Shackleton the longest night shortens from 117 days to 58. What they assume: the default lander for battery events (4 m² upright panel turning to the Sun, 30 %, 200 W, 2 kWh), a 2 m mast and Earth counted in view whenever its centre clears the skyline. What they do not establish: the product 90 models are not the truth either (their own error is part of the spread, as one standard error, not a bound); hills smaller than the models resolve, the skyline between its 720 directions and the lander's own height, tilt and placement are not in the budget.

**The ground at each site** (`terrain_quality`, from windows of the 20 m and 50 m product 90 maps around each site): the stated height error (0.16 to 2.6 m; Nobile Rim 2's 2.6 m with a 220 m effective resolution marks sparse LOLA tracks there), the slope and its error, the effective resolution, the roughness at a 100 m baseline and the nearest permanently shadowed pixel within 10 km (`LPSR_80S_20MPP_ADJ`). The app shows it under the site's description on Explore (Where on the Moon), in the brief, and in a table on the Accuracy page.

**The power model's scope**, as the app states it beside the lander, in All numbers and in the brief: a constant load, a constant panel efficiency, an ideal battery (no loss to cold or age) and one height, the mast's, for both the panel and the radio. The figures count electrical energy only; they do not show whether the lander stays warm enough through the night or starts again after it, and the verdict says power comes back only "if the lander starts again after the cold".

### Downloads (PGDA product 90, https://pgda.gsfc.nasa.gov/products/90; Barker et al. 2023, Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1)

Whole files, into `data_raw/pgda90/` (`uv run python -m lunar_pipeline.cli pgda90-fetch`, resumable, size-checked; 890 MB in all):

| File | Listed | Bytes | Use |
|---|---|---|---|
| `LDEM_80S_80MPP_ADJ.TIF` | 181M | 189,158,392 | skyline, 40 m to 100 km |
| `LDEM_80S_80MPP_ADJ_ERR.TIF` | 244M | 254,808,965 | height error at the skyline to 100 km |
| `LDEM_60S_240MPP_ADJ.TIF` | 210M | 218,961,039 | skyline, 100 to 220 km |
| `LDEM_60S_240MPP_ADJ_ERR.TIF` | 255M | 267,005,175 | height error at the skyline beyond 100 km |

Windows read over HTTP range requests (GDAL `/vsicurl/`) and cached in `data_raw/pgda90/windows/` by the `uncertainty` command itself (about 25 MB in all): `LDEM_80S_20MPP_ADJ.TIF` and `LDEM_80S_20MPP_ADJ_ERR.TIF` (6.5 km around each site south of 87.55° S), and 200 m around every polar site of `LDEM_80S_20MPP_ADJ_ERR.TIF`, `LDEM_80S_20MPP_ADJ_EFFRES.TIF`, `LDSM_80S_20MPP_ADJ.TIF`, `LDSM_80S_20MPP_ADJ_ERR.TIF`, 300 m of `LDRM_80S_50MPP_ADJ_ROUGH_100M.TIF` and 10 km of `LPSR_80S_20MPP_ADJ.TIF`. The server answers an occasional range request with 403; the reader retries.

To regenerate (from `pipeline/`): `fetch --group kernels --group lola` (if absent), `pgda90-fetch`, `uncertainty`, `sync-local`. The `uncertainty` run takes about 12 minutes on one core.
