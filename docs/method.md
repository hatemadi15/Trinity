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
