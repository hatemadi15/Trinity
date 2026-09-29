# NASA data used

| Dataset | What we use it for | Source | Citation |
|---|---|---|---|
| SPICE generic kernels: `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `de440s.bsp` | Sun and Earth positions in the Moon body-fixed frame (MOON_ME), light-time and stellar aberration corrected | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | Acton et al. 2018, Planet. Space Sci. 150, 9–12; Park et al. 2021 (DE440) |
| LRO LOLA polar DEMs `ldem_875s_20m`, `ldem_80s_80m`, `ldem_60s_240m` | Terrain horizon masks, tiles for the browser engine, 3D terrain | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ | Smith et al. 2017, Icarus 283, 70–91 |
| LOLA Lunar Polar Illumination maps `avgvisib_85s_060m_201608` (+ `_earth`), `lpsr_85s_060m_201608` | Independent check of our illumination and Earth-visibility numbers; overlay layers | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/ | Mazarico et al. 2011, Icarus 211, 1066–1081 |
| JPL Horizons API (observer on the lunar surface) | Cross-check of Sun and Earth azimuth/elevation | https://ssd-api.jpl.nasa.gov/doc/horizons.html | Giorgini et al. 1996 |
| CLPS landing coordinates (IM-1, IM-2, Blue Ghost M1) | Featured sites and mission backcasts | NASA / provider press releases, LROC | — |
| NASA SVS CGI Moon Kit `lroc_color_2k.jpg` (LRO LROC WAC colour mosaic, 2K equirectangular, longitude 0 at the centre) | Globe texture in the 3D view | https://svs.gsfc.nasa.gov/4720 (file: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg) | NASA's Scientific Visualization Studio; LRO LROC WAC (Arizona State University) |

Method reference for horizon masks: Barker et al. 2021, Planet. Space Sci. 203, 105119 (nested-grid horizon computation).

## Site catalogue (Week 4)

- NASA, "NASA Provides Update on Artemis III Moon Landing Regions", 28 October 2024 (the nine candidate regions: Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain). Region centres marked `approximate` in `data/sites.json` were digitised from NASA's region map, scaled with the two published points below; each region is 15-20 km across, so the centres are good to about 5 km.
- Sanchez-Lozano, Pena-Asensio, Neira-Acosta, "A GIS-based multi-criteria decision-making approach for Artemis III landing site selection", LPSC 2025 abstract 1149 (Nobile Rim 2 optimal site 84 12'5.61"S, 60 41'59.61"E).
- Gracy & Lee, "Candidate landing sites for Artemis 3 in two NASA candidate landing regions nearest the lunar south pole", LPSC 2024 abstract 1695 (Connecting Ridge 89.53432 S, 209.94767 E; Peak near Shackleton 89.01701 S, 126.27302 E).
- LROC featured image 1294, "Malapert Massif" (86 S, 0 E), Arizona State University / NASA GSFC.

## Mission backcasts (Week 5)

- IM-1 Odysseus: Intuitive Machines mission update, 29 February 2024 — final transmission as the lunar night began (hour not published; the catalogue uses 00:00 UTC).
- IM-2 Athena: Intuitive Machines / NASA release, 7 March 2025 — mission concluded with the lander on its side in a crater at Mons Mouton, batteries depleted (hour not published; the catalogue uses 12:00 UTC).
- Blue Ghost Mission 1: Firefly Aerospace mission update, 16 March 2025 — mission concluded at 23:25 UTC, about five hours after lunar sunset, after 346 hours of daylight operations.
