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
