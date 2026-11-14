# Machine learning in Earthrise: a feasibility study

14 November 2026, the day before the Space Apps submission deadline (15 November, evening). Two ideas were
put forward. This study looks at where each fits in Earthrise, what data exist, the methods from simplest
to most ambitious, how each could be checked, what it would cost, and what to build when.

## Summary

Neither idea needs machine learning to be useful in Earthrise, and neither should go into the app before
tomorrow evening. Uncertainty-aware prediction fits our uncertainty budget as a Monte Carlo ensemble:
versions of NASA's adjusted south-pole elevation model (PGDA product 90), each shifted within its stated
error, cost one to two seconds each with the pipeline's own code (all 18 polar sites in under an hour),
and they show what a plus-or-minus cannot, such as Connecting Ridge's longest night splitting from 486 h
to about 310 h in some versions. A learned emulator would add little: event by event, the spread follows a
one-line rule (the skyline's change divided by how fast the Sun or Earth crosses it) within 25 % for 90 to
100 % of events at two of the three sites tried, and the rule breaks down where an emulator would also be
least reliable, at the grazing Sun of the Shackleton rim summit. The weak point is the error model: the
spread changes several-fold with the assumed correlation length of the height errors, the app's skyline
lies about five stated errors from product 90's (median over 18 sites), and at the Shackleton rim summit
the app's longest night (62.5 h) lies outside every ensemble we ran (124 to 131 h). Science-interest
estimation fits beside the distance to permanent shadow Explore already shows; the data are public and
small (Diviner's modelled temperatures and ice-stability depth downloaded in 4.4 s and read in 12 s), and
the modelled cold ground within 5 km separates the sites (0 to 84 km²) where the shadow distance (0.01 to
1.05 km) barely does. A transparent rule is the right tool and a trained classifier is not: the best-known
ice detections (Li et al. 2018) exist only as dots in a figure, are few and clustered, and were kept only
where the ground is colder than 110 K, so a classifier would learn that threshold back. Recommendation:
before the deadline, commit this study and at most one sentence of future work; afterwards, fit the error
model and run the ensemble, then add a cold-trap layer worded as modelled conditions, never as ice found,
and try an emulator only if the simple rule is shown to fail.

Update, 14 November: with the user's go-ahead, step 4 of the plan below, the cold-trap layer, was built before
the deadline as a transparent layer (no score, no classifier): `data/coldtraps`, shown on Explore, in the brief,
on the site list and as a layer on the shadow map. The -1 value is settled: it is exactly the ground whose annual
maximum is below 101.3 K, where ice would be stable at the surface all year (`docs/method.md`, "Modelled cold
traps").

## Terms used

- **Skyline**: the height of the terrain horizon in each of 720 directions around a site, as the app
  traces it from LOLA elevation grids.
- **Elevation model** (DEM, digital elevation model): a grid of surface heights. **Error map**: product
  90's `ERR` files, the stated height error of each pixel of its adjusted elevation models, in metres, as
  one standard deviation (**one sigma**).
- **Error model**: the assumptions that turn an error map into possible versions of the ground: how large
  the errors are, whether they are Gaussian, and how far apart two points must be before their errors stop
  moving together (the **correlation length**).
- **Ensemble** (Monte Carlo ensemble): many versions of the ground drawn from the error model, each with
  its own skyline and its own forecast; the spread of the forecasts is the uncertainty.
- **Emulator**: a model trained on ensemble results that predicts the spread for a new point without
  running an ensemble there.
- **First-order (linear) propagation**: estimating an event's time error as the skyline's error at the
  direction of the crossing divided by the rate at which the body's height above the skyline changes. The
  budget already does exactly this for the ephemeris error.
- **Instruments and archives**: on NASA's Lunar Reconnaissance Orbiter (LRO), LOLA (laser altimeter),
  Diviner (thermal radiometer), LAMP (ultraviolet spectrograph), LEND (neutron detector) and LROC's Narrow
  Angle Camera (NAC); M3, the Moon Mineralogy Mapper on India's Chandrayaan-1; Lunar Prospector (1998-99);
  LCROSS, the 2009 impactor; PGDA, NASA Goddard's Planetary Geology, Geophysics and Geochemistry
  Laboratory, which publishes products 69 and 90; PDS, NASA's Planetary Data System; SPICE, NASA's toolkit
  for planet and spacecraft positions.
- **Permanently shadowed region (PSR)**: ground the Sun never reaches over the Moon's 18.6-year cycle.
- **Cold trap**: ground cold enough that water ice would last over geological time; by convention, an
  annual maximum surface temperature below about 110 K.
- **Ice-stability depth**: the depth below which buried ice would sublimate more slowly than a stated rate
  (Diviner's product uses 1 kg per square metre per billion years).
- **Prospectivity**: a modelled ranking of where ice could be, from conditions that favour it. It is not a
  detection and cannot establish that ice is there.
- **Label**: an example with a known answer that a classifier learns from. **Spatial autocorrelation**:
  nearby places resemble each other. **Leakage**: a test that looks good because the test examples are not
  really independent of the training examples, or because the label was built from the features.

## What Earthrise already has that both ideas build on

- **The uncertainty budget** (`data/uncertainty/budget.json`, method in `docs/method.md`, "Uncertainty
  budget"): per site and event, the sampling, terrain and ephemeris errors and their sum, shown as
  "Times ±N h" on Explore, in the brief and on the Accuracy page. Its terrain part traces three other
  skylines per polar site (`data/uncertainty/skylines/<site>.json`): product 90's adjusted skyline, and the
  same skyline raised and lowered by one stated error in every direction at once. A point not in the
  catalogue gets the largest margin found at the featured polar sites. (Since 14 November the terrain part
  also takes the 32 terrain versions of each polar site; 68 margins grew and none shrank, and the
  default landing, de Gerlache Rim 2 on 1 January 2027, now shows "Times ±8 h", where it showed ±4.5 h.
  `docs/method.md`, "Terrain versions".)
- **The ground at each site** (`terrain_quality`): height error, effective resolution, slope and its
  error, roughness at 100 m, and the nearest permanently shadowed pixel of `LPSR_80S_20MPP_ADJ` within
  10 km. At all 18 polar sites that pixel is within 1.05 km (from 6 m to 1.05 km), so the distance alone
  barely tells the sites apart; the size and temperature of the shadow would.
- **Neighbourhood ranges** (being built on the `g-objectives` branch, `web/src/lib/plan/neighbourhood.ts`):
  for a site the catalogue places only to within a stated radius, the browser worker works out the same
  period at 8 points around it and states the range ("Within about 5 km (9 points): power for 3.2 to 30
  days"); around a derived high point it probes 0.5 and 1 km. This is uncertainty in where the lander is.
- **The catalogue's point kinds** (on the `g-sites` branch): every site says whether it is surveyed, a
  target, a region centre, derived or a reference, with the radius its source states.

## Idea 1: uncertainty-aware prediction

### What it would mean in Earthrise

The idea: learn, from many plausible versions of the terrain, how much each forecast varies when the
elevations are uncertain, and point out the options that hold up.

- **Explore** (the answer): beside "power for 3 days 4 hours, then night", a range over versions of the
  ground ("2 days 20 hours to 3 days 6 hours in 90 of 100 versions"), and a "better date" or "better place"
  chosen for how often it still meets the mission's requirements, not only for its single best value.
- **Options and why, Compare and the 12-month search**: rank by the share of versions that keep power
  through the period, or by the worst case, so a planner sees which choice is robust.
- **Accuracy and the brief**: the ensemble's method and its check against independent evidence.
- **For a planner**: "if the ground is a metre off, does the battery still outlast this night, and which
  date or place is safest?" **For an educator**: why a tenth of a degree of skyline moves a sunset by hours
  near the pole (the Sun crosses the skyline at a few hundredths of a degree an hour). **For the public**:
  how sure the times are, in one line.

How it relates to what exists. Today's terrain margin raises and lowers the whole skyline by one stated
error at once, which is the most coherent shift possible and treats every direction as moving together. An
ensemble lets directions move partly independently, keeps the site's own height error (which moves every
direction together) and captures effects that a plus-or-minus misses: an event that one version of the
ground does not have at all (the budget already counts 13 lost sunsets at the Shackleton rim summit and 10
at the peak near Shackleton), and nights that merge or split (at Connecting Ridge the longest night is 486 h
under three of the four skylines and 304 h under the lowered one). It is the terrain counterpart of the
neighbourhood ranges, which cover where the lander is; the point kinds say which matters more: for a region
centre with a 5 km radius the position dominates, for a surveyed lander such as IM-2 only the terrain is
left, and for a derived high point both (product 90 puts the Shackleton rim summit 1.7 m lower).

### The data

No new download is needed for a first ensemble: the four whole product 90 files are already in
`data_raw/pgda90` and the pipeline already reads 20 m windows over HTTP.

| Product | Resolution and coverage | Size | Use here |
|---|---|---|---|
| `LDEM_80S_80MPP_ADJ.TIF`, `_ERR.TIF` (PGDA product 90) | 80 m, 80 to 90° S | 189,158,392 and 254,808,965 bytes (downloaded) | heights and their stated error to 100 km |
| `LDEM_60S_240MPP_ADJ.TIF`, `_ERR.TIF` | 240 m, 60 to 90° S | 218,961,039 and 267,005,175 bytes (downloaded) | heights and errors 100 to 220 km |
| `LDEM_80S_20MPP_ADJ.TIF`, `_ERR.TIF` | 20 m, 80 to 90° S | 2.6 and 3.7 GB listed; read as 6.5 km windows (about 25 MB in all, cached) | the first 6 km south of 87.55° S |
| `LDEM_80S_80MPP_ADJ_EFFRES.TIF`, `LDEC_80S_80MPP_ADJ.TIF` | 80 m | 250,228,467 bytes; 111 MB listed | effective resolution and laser shots per pixel, to make the correlation length depend on track density |
| Product 90 NAC images and simulated images (`M*LE_20MPP.TIF`, `M*_20MPP_MODEL.TIF`, 9 images) | 20 m | for example 3,010,744 and 72,170,866 bytes for M1311409938 | independent check of shadows and skylines |
| The app's own LOLA grids (`data_raw/lola`) | 20, 80, 240 m | already downloaded | a second generation of the same terrain, for fitting the error model (below) |

All are NASA products, free to use; PGDA asks users to cite Barker et al. 2023 (its "Data Usage Policy").

### Methods, from simplest to most ambitious

1. **Today's plus-or-minus** (built): three other skylines per polar site, events at one-minute steps,
   margins at the 95th percentile.
2. **First-order propagation** (no machine learning): the time error of a crossing is the skyline error in
   that direction divided by the crossing rate; the budget's ephemeris term is computed this way already. It
   costs nothing to run, works for any point whose skyline and error the app can trace, and is exactly what
   an emulator would have to learn for ordinary crossings. It fails where the forecast has a threshold: a
   grazing Sun that may or may not clear a peak, a night that may merge with the next, a battery that runs
   out or not.
3. **Monte Carlo ensemble** (the real step): N versions of the ground, each the adjusted model plus the
   error map times a smooth random field with a chosen correlation length (Gaussian-smoothed white noise,
   on each band's own grid for short lengths and on one lattice shared by all bands for long ones, as the
   prototype below does), the skyline re-marched with the pipeline's own `uncertainty.horizon_profile` and
   the events found as in `site_budget`. Ensemble spread then covers threshold effects too. Two cautions:
   the highest point of a noisy profile is on average higher than that of the smooth one, so the ensemble's
   middle sits slightly above today's skyline (measured: under 0.03° in 95 % of directions); and the result
   depends on the error model more than on N.
4. **Learned emulator**: train a regression model (gradient-boosted trees or a small network) on ensemble
   results at a few thousand points (features such as the skyline error at the crossing direction, the
   crossing rate, the distance to the skyline, slope, height error, latitude) to predict the spread
   anywhere instantly. It needs the ensembles first; for ordinary crossings it reproduces method 2, which is
   free; and where method 2 fails (thresholds, lost events) the emulator has the fewest examples and is
   least reliable. If "any point in the browser" is the goal, two simpler routes exist: a small ensemble in
   the browser worker (it already re-traces 8 skylines for the neighbourhood range; it would need the error
   map as tiles, which can be coarse, since the skyline error is the height error over the distance), or a
   margin map worked out offline on a grid and looked up.

**Does machine learning add anything?** Not now. The physics gives the rule, the ensemble gives the
truth under the error model, and the emulator only interpolates between ensembles. The measurements below
bear this out. It becomes worth trying only if the ensemble shows method 2 failing often and the app needs
instant spreads for points it has not seen.

**Measurements** (prototype `pipeline/scratch/ml_study_probe.py ensemble`, which calls the pipeline's own
`adjusted_grids`, `bands_for_site`, `fallback_bands`, `horizon_profile` and `fine_vectors`; one core, other
jobs running). Each member is product 90's adjusted model plus its `ERR` map times a smooth Gaussian random
field (correlation length 250 m, 2.5 km or 25 km), re-marched in 720 directions with the app's bands and
2 m mast; its Sun and Earth events are found every minute for the budget's 730 days from 2025-01-01.

- **Cost.** At Connecting Ridge: loading the four whole product 90 files 8.9 s; SPICE positions every minute
  for 730 days 19.4 s (once, shared by every skyline); then per member 0.5 to 1.1 s for the random fields
  (the shortest correlation length costs most), 0.5 s for the march and 0.07 s for every event of the two
  years. 90 members took 143 s in all. So 100 members cost 2 to 3 minutes a site, and all 18 polar sites
  under an hour per correlation length on one core. The unperturbed march reproduces the budget's stored
  adjusted skyline to 0.0005°.
- **Three sites, three correlation lengths** (30 members at Connecting Ridge, 20 at the other two):

| Site | Correlation length | Skyline spread over stated error (median of 720 directions) | Events the first-order rule predicts within 25 % (sunsets, sunrises) | Longest night of the two years, 5th to 95th percentile of members |
|---|---|---|---|---|
| Connecting Ridge | 250 m | 0.97 | 94 %, 98 % | 310 to 486 h |
| | 2.5 km | 0.60 | 96 %, 98 % | 486 h |
| | 25 km | 0.14 | 90 %, 100 % | 486 h |
| de Gerlache Rim 2 | 250 m | 0.96 | 100 %, 100 % | 501 h |
| | 2.5 km | 0.87 | 100 %, 100 % | 501 h |
| | 25 km | 0.26 | 100 %, 100 % | 501 h |
| Shackleton rim summit | 250 m | 0.71 | 50 %, 68 % | 124 to 131 h |
| | 2.5 km | 0.71 | 81 %, 88 % | 125 to 128 h |
| | 25 km | 0.28 | 78 %, 89 % | 125 to 127 h |

  (The first-order columns count only events that move a minute or more; Earth events follow the rule
  within 25 % at every site and length.)
- **The first-order rule holds for ordinary events.** Against the budget's raised skyline, the actual shift
  over the predicted one (skyline change at the crossing direction divided by the crossing rate) has a
  median of 1.00 at all three sites; at Connecting Ridge 98 % of the sunsets and sunrises that move a minute
  or more are within 25 % of it, at de Gerlache Rim 2 91 to 100 %. Across ensemble members the same rule
  predicts each event's spread as well (table). This is what an emulator would learn.
- **Where it does not.** At the Shackleton rim summit, where the Sun grazes the skyline for days, the rule
  is within 25 % for only 50 to 68 % of sunsets and sunrises with 250 m errors; against the raised skyline
  14 sunsets are off by more than a factor of two or vanish, the worst moving 22 h, and in the 250 m
  ensemble 5 events vanish in some members. At Connecting Ridge the longest night (486 h) splits to about
  310 h in 4 of 30 members with 250 m errors, as under the budget's lowered skyline (304 h). Thresholds
  like these have no rule; only the ensemble shows how often they happen, and they are where an emulator
  would have the fewest examples.
- **The error model sets the answer.** Per direction, the ensemble's skyline spread falls from about the
  stated error (0.7 to 1.0 times) with 250 m errors to between a seventh and just over a quarter of it
  with 25 km errors, where the site and its skyline move together and their errors cancel. The coherent
  plus-or-minus the budget uses is wider than any of these ensembles at the Shackleton rim summit (longest
  night 73 to 134 h against 124 to 131 h). The correlation length is not known; it has to be fitted (see
  Validation).
- **An ensemble around product 90 does not reach the app's own answer.** At the Shackleton rim summit the
  app's skyline gives a longest night of 62.5 h and 90.7 % sunlight; product 90 gives 126.7 h and 86.2 %,
  and the middle 90 % of members of every ensemble stay within 124 to 131 h and 85.4 to 86.4 %. The
  difference between two elevation models built from the same laser shots is larger than the spread their
  stated error implies, which is the check below seen from another side.

### Validation, and what it can and cannot claim

A check made for this study, from committed data only (`data/uncertainty/budget.json`): for each polar
site, the 95th percentile over directions of the gap between the app's skyline and product 90's adjusted
skyline, against the 95th percentile of the stated one-sigma skyline error.

| Site | Gap, p95 | Stated error, p95 | Ratio |
|---|---|---|---|
| Connecting Ridge | 0.373° | 0.137° | 2.7 |
| Shackleton rim summit | 0.929° | 0.151° | 6.2 |
| Peak near Shackleton | 0.992° | 0.135° | 7.4 |
| Slater Plain | 0.815° | 0.052° | 15.7 |
| IM-2 Athena | 0.066° | 0.026° | 2.5 |
| Nobile Rim 2 (sparse laser tracks, 2.6 m height error) | 0.413° | 1.591° | 0.3 |

Over all 18 polar sites the gap exceeds the stated error at 17, with a median ratio of 5.1 (0.3 to 15.7).
These are two percentiles side by side, not paired direction by direction, and the app's grids are an older
generation with errors of their own, so the gap is not product 90's error. But it says that skylines move
between models built from the same laser shots by several times the stated error, so an ensemble drawn from
the `ERR` maps alone would be overconfident. Today's margins are not invalidated: the budget already counts
the step from the app's skyline to product 90's as part of the terrain spread.

What would check an ensemble:

- **Fit the error model to data**: the difference between product 90 and the PDS LOLA grids (both already
  downloaded) gives an amplitude and a correlation length to compare with `ERR`, `EFFRES` and the shot
  counts; an ensemble is then calibrated if, for example, about two thirds of directions fall inside its
  one-sigma band.
- **Shadows in images**: product 90's NAC images and their simulations on the 20 m model; where a shadow
  edge in the image sits relative to the simulated one is an independent test of skylines.
- **Mission backcasts**: the three missions on the Accuracy page (Blue Ghost lasted 2.4 h past our sunset);
  too few to calibrate anything, useful as a sanity check.

It can claim: the spread of each forecast under a stated error model, and which options keep their result
across it. It cannot claim: the probability that a landing works. The spread is only as good as the error
model; hills smaller than the models resolve, the lander's own height, tilt and placement, and the battery's
temperature stay outside it, as the budget already says.

### Cost and risk

| Step | Effort | Compute | Data | Where |
|---|---|---|---|---|
| First-order propagation for the 18 polar sites, compared with the budget (the prototype does three) | 1 to 2 h | seconds | none new | offline pipeline |
| Error model fitted to the two DEM generations | 4 to 8 h | minutes | none new | offline pipeline |
| Ensemble at the 18 polar sites, 100 members, 2 to 3 correlation lengths | 1 to 1.5 days with tests | under 1 h per correlation length on one core, about 15 minutes on four (measured: 1.1 to 1.7 s a member, 30 s a site) | a few MB of results in `data/uncertainty` | offline pipeline |
| Ranges and robust ranking on Explore, Compare, the brief and Accuracy | 1 to 2 days with tests and wording | none | the results above | app |
| Emulator | 2 to 4 days plus training ensembles | hours to train | ensembles at thousands of points | offline, then a small model in the browser |

What could break: every margin the app, the brief, the pitch and the video quote would change; the
manifest must be rebuilt after any change to `data/`; and the ranking code is being changed on another
branch today. Honesty risks: calling an ensemble share a probability; presenting `ERR` as the whole error;
an emulator returning confident spreads for ground unlike its training points.

## Idea 2: science-interest estimation

### What it would mean in Earthrise

The idea: combine thermal, terrain and permanent-shadow data to map modelled ice prospectivity next to
operational feasibility, without claiming confirmed ice.

- **Explore, "Where on the Moon" and the ground panel**: next to "permanently shadowed ground 0.1 km
  away", the coldest modelled ground within 10 km, the area within 5 km where ice would last at the surface
  or within half a metre (Diviner's model), and the slope on the way there. With the numbers measured
  below, the Shackleton rim summit would read: "13.5 km² within 5 km is cold enough for ice to last in
  NASA's temperature model, and ground within 10 km reaches 64 K; the nearest permanent shadow is 60 m
  away. Modelled conditions, not detected ice."
- **Choose a landing site**: a second sort or column, "cold traps within reach (modelled)", beside the
  power ranking, so the trade between power, Earth in view and science interest is visible; a layer on the
  relief map.
- **How it works**: why ice can last in craters that never see the Sun, and what each instrument actually
  sees (temperature, hydrogen tens of kilometres wide, frost on the top micrometres).
- **For a planner**: "which candidate sites have power and radio windows and modelled cold traps a rover
  could reach?" **For an educator**: cold traps and the evidence for ice. **For the public**: what is known
  and what is not.

How it relates to what exists: it extends `terrain_quality`'s nearest permanent shadow (one distance today)
with the shadow's size, temperature and modelled ice-stability depth; within a region centre's stated
radius (the point kinds) it would report the range across the neighbourhood, as the neighbourhood ranges do
for power. The catalogue already cites a site-selection study that weighs such layers (Sanchez-Lozano et
al., LPSC 2025).

### The data

All of these answered from this machine with curl (HTTP 200 or 206); sizes are the servers' byte counts
from one-byte range requests. "Read" means the label or readme was read for this study.

| Product | What it is | Resolution, coverage | Size | Read |
|---|---|---|---|---|
| Diviner Polar Resource Product, `dlre_prp_south.tab` (LRO-L-DLRE-5-PRP-V2.0) | thermal-model fits to Diviner's first mapping year (Paige et al. 2010): annual average temperature at 2 cm depth, annual maximum surface temperature, depth to ice stability (0 = stable at the surface; deeper than 2.8738 m reported as -999) | 2,880,000 triangles of a Kaguya laser-altimeter elevation model, a square around the pole to 80° (measured: median triangle 0.128 km², so pairs make cells of about 510 m; centres from 75.9° S to the pole) | 604,800,210 bytes as ASCII; 116,583,332 bytes zipped (`extras/prp/dlre_prp_south.zip`), downloaded in 4.4 s | label, PDS4 label, catalog file (V1.0 "lacked any meaningful data"; use V2.0); downloaded and read, see below |
| Diviner Polar Cumulative Products, seasonal (`pcp_avg_tbol_pols_*`) | seasonal temperatures (Williams et al. 2019) | south polar, many files | 187 to 220 MB per file, dozens of files | listing only; too large for now |
| Product 90 permanent shadow `LPSR_80S_20MPP_ADJ.TIF` and tables | 506,349 PSRs; 1,531 larger than 1 km² | 20 m, 80 to 90° S | 154,221,202 bytes (map); 218,652,814 (all PSRs, CSV); 29,642,968 (over 1 km², CSV); 369,101 (attribute table) | attribute table downloaded and read: columns `gid`, `area_km2`, `name` |
| Product 69 (Mazarico et al. 2011) permanent shadow `LPSR_85S_060M_201608`, `LPSR_75S_120M_201608`, `LPSR_65S_240M_201608` | PSR over an 18.6-year cycle | 60, 120, 240 m | 656,183, 1,046,706 and 582,074 bytes as GeoTIFF; the 60 m IMG is already in `data_raw/illumination` | product page |
| Product 90 slope `LDSM_80S_80MPP_ADJ.TIF`, `LDSM_60S_240MPP_ADJ.TIF` | slope in degrees, with error maps | 80 m, 240 m | 241,594,035 and 258,884,830 bytes | product page |
| Product 90 roughness and slope at baselines of 100 to 1600 m, `LDRM_80S_1000MPP_ADJ_*` | roughness, plane-fit slope, a K-means roughness class | 1 km | 1,490,865 (roughness 100 m), 1,533,793 (slope 100 m), 448,159 (class) | product page |
| PDS LOLA slope and roughness `ldsm_75s_240m`, `ldsm_85s_40m`, `ldrm_75s_240m` | slope, roughness | 240 m, 40 m | 29,062,688, 115,034,112 and 29,062,688 bytes | listing |
| LEND averaged data, `lend_rdr_alds_20090915` and `_20111211` | neutron count rates per detector (collimated epithermal among them), 2009-09-15 to 2016-09-14 | 0.5° by 0.5° cells south of 80° S (14,400 cells) | 4,464,000 bytes each | label: count rates, not hydrogen; hydrogen needs a published conversion |
| Lunar Prospector `hydrogenhd` (Feldman et al. 2001) | hydrogen, ppm by weight | 0.5° bins (259,200), poles included; the instrument's footprint is far wider than a bin | 518,400 bytes binary; 13.6 MB as text | file header |
| LAMP gridded data `LAMP_80s_240mpp_ratio_albed_01` (LRO-L-LAMP-5-GDR-V1.0) | far-ultraviolet off-band to on-band albedo ratio, a water-frost indicator, with an error map | 240 m pixels, 80 to 90° S, September 2009 to October 2010 | 25,020,004 bytes (2501 by 2501 floats) | label |
| LOLA albedo `ldam_50s_1000m_float` (Lemelin et al. 2016) | 1064 nm albedo; high values in cold traps are a frost indicator | 1 km, 50 to 90° S | 25,644,096 bytes | label |
| Chandrayaan-1 M3 ice detections (Li et al. 2018, PNAS 115, 8907) | several thousand 280 m pixels with three ice absorptions, searched only in shaded pixels | both poles | no data file: the locations are dots in the paper's Figure 4 (PNAS refuses curl here; the PubMed Central copy is readable) | paper |
| LCROSS impact (Colaprete et al. 2010, Science 330, 463) | the one in-place measurement: about 5.6 ± 2.9 % water by mass in the ejecta from Cabeus | one point | none | not fetched |
| Not checked in this session | Mini-RF radar polarisation mosaics (ambiguous between ice and rough ground), the LROC PSR atlas, micro cold traps (Hayne et al. 2021), ShadowCam images of shadowed craters | | | |

Licences: all are public NASA archives with no fee or registration; data.nasa.gov lists the LAMP gridded
data as public domain; the producers ask to be cited (PGDA's usage policy, the PDS citation fields). Taking
the Diviner zip, product 90's 1 km and 80 m slope maps, LAMP, LOLA albedo, LEND and Lunar Prospector would
be about 420 MB of downloads, and much less kept once resampled; the 20 m shadow map can be read in windows
as the pipeline already does.

### Methods, from simplest to most ambitious

1. **Separate layers, no score**: show each quantity as measured or modelled, with its source and
   resolution: coldest ground, ice-stability depth, permanent shadow, slope, and hydrogen only as regional
   context. Least to get wrong.
2. **A transparent index**: classes anyone can recompute, for example "ice would last at the surface"
   (annual maximum below 110 K, or stability depth 0, once the -1 value is understood), "within half a
   metre", "within a metre", "dry", each combined with "in permanent shadow" and "reachable" (slope under
   a stated limit, such as 15°, along the way), plus a count of independent frost indicators that agree
   (LAMP ratio above 1.2, LOLA albedo above 0.35: the thresholds Li et al. used). Shown per site as areas
   within a stated distance, next to the site's power and radio results. This is the operational part:
   science interest is only useful next to whether a lander there keeps power and sees Earth.
3. **A weighted multi-criteria score**: weights for each layer, as site-selection studies do. The weights
   are opinions; if used, they must be shown and adjustable.
4. **A learned classifier**: train on "ice" labels to map a probability everywhere. Why it does not work
   here:
   - **The labels do not exist as data.** Li et al.'s detections are published only as dots in a figure.
     Rebuilding them from raw M3 images is weeks of work.
   - **They are few and clustered.** Several thousand 280 m pixels in a handful of craters are a handful of
     independent examples, not thousands; with spatial autocorrelation, a random split of nearby pixels into
     training and test sets leaks and inflates the score; only a split by crater or region is honest, and
     then there are too few regions to test.
   - **There are no true negatives.** M3 sees only the top micrometres, only where scattered light gives
     enough signal, and Li et al. report frost in only about 3.5 % of cold traps; "no detection" is not "no
     ice".
   - **The labels were selected with the features.** Li et al. kept detections where the annual maximum
     temperature is below 110 K, the LOLA albedo above 0.35 and the LAMP ratio above 1.2. A classifier fed
     the Diviner, LOLA and LAMP maps would learn those thresholds back and present them as a probability.
   - **Hydrogen is too coarse to help at a site.** Lunar Prospector and LEND see tens of kilometres; a site
     and its rover range are a few kilometres.

   An unsupervised grouping (like product 90's roughness classes) is possible but adds a label without
   adding knowledge.

**Does machine learning add anything?** No. It can only re-weight the same maps, and it would dress a
physical threshold as a learned probability. The value is in a careful, sourced, transparent layer.

**Measurements** (prototype `pipeline/scratch/ml_study_probe.py diviner`, one core, other jobs running):

- **Fetch and read.** The Diviner zip downloaded in 4.4 s (116,583,332 bytes, 26.6 MB/s); unzipping it into
  memory took 2.4 s and parsing every column of the 604,800,210-byte table 9.5 s, so the table never has to
  be written to disk. The product 90 PSR attribute table (369,101 bytes) took 0.87 s: 1,531 PSRs larger than
  1 km², 18,921 km² in all, the largest 1,071 km².
- **Across the cap south of 80° S** (292,386 km² in the product): 14,749 km² with an annual maximum below
  110 K; 12,471 km² below 100 K and 16,322 km² below 120 K, so the threshold alone moves the cold-trap area
  by 11 to 15 %. Ice depth 0 (stable at the surface) covers only 2,341 km², but a value of **-1, which the
  label does not explain**, covers 12,813 km², all of it colder than 101 K: 87 % of the ground colder than
  110 K carries -1 and only 13 % carries 0. A reader that took the label at its word would miss most of the
  coldest ground. (Settled since: -1 is exactly the ground whose annual maximum is below 101.3 K, the
  temperature at which exposed ice sublimates at the product's own rate, Paige et al.'s white "surface cold
  traps"; see `docs/method.md`, "Modelled cold traps".) Buried ice would last within 10 cm of the surface on
  20 % of the cap, between 10 and 50 cm on 13 %, between 0.5 and 2.87 m on 4 %, and deeper (or not at all) on
  58 %.
- **Around each polar site**, next to product 90's permanent shadow (the 10 km LPSR windows the budget
  already caches):

| Site | Nearest permanent shadow (shown today) | Permanent shadow within 5 km | Modelled below 110 K within 5 km | Share of that shadow below 110 K | Coldest within 10 km |
|---|---|---|---|---|---|
| Shackleton crater floor | 0.01 km | 78.39 km² | 84.29 km² | 100 % | 68 K |
| de Gerlache crater floor | 0.24 km | 43.96 km² | 56.92 km² | 97 % | 35 K |
| Nobile Rim 2 | 0.26 km | 17.94 km² | 23.18 km² | 97 % | 56 K |
| Lunar south pole | 0.49 km | 16.45 km² | 16.96 km² | 86 % | 68 K |
| Shackleton rim summit | 0.06 km | 14.33 km² | 13.46 km² | 80 % | 64 K |
| Peak near Shackleton | 0.14 km | 6.75 km² | 4.39 km² | 58 % | 51 K |
| Haworth | 0.33 km | 4.99 km² | 2.72 km² | 51 % | 63 K |
| Mons Mouton Plateau | 0.01 km | 5.78 km² | 1.95 km² | 28 % | 51 K |
| Connecting Ridge | 0.10 km | 3.68 km² | 1.16 km² | 21 % | 64 K |
| Nobile Rim 1 | 0.64 km | 1.36 km² | 0.26 km² | 14 % | 68 K |
| Slater Plain | 0.55 km | 1.88 km² | 0.13 km² | under 1 % | 52 K |
| Peak near Cabeus B | 0.23 km | 0.54 km² | 0.00 km² | 0 % | 148 K |
| Malapert Massif | 0.44 km | 0.51 km² | 0.00 km² | 0 % | 132 K |
| Mons Mouton | 0.41 km | 0.67 km² | 0.00 km² | 0 % | 73 K |
| de Gerlache Rim 2 | 1.05 km | 0.12 km² | 0.00 km² | 0 % | 95 K |
| IM-1 Odysseus | 0.56 km | 0.28 km² | 0.00 km² | 0 % | 146 K |
| IM-2 Athena | 0.49 km | 1.32 km² | 0.00 km² | 0 % | 90 K |
| de Gerlache rim summit | 0.04 km | 0.25 km² | 0.00 km² | 0 % | 95 K |

  The distance shown today runs from 0.01 to 1.05 km and hardly separates the sites; the modelled cold
  ground within 5 km runs from 0 to 84 km² and does. At 7 of the 18 sites none of the permanently shadowed
  ground within 5 km is colder than 110 K in Diviner's model: small shadows are warmed by light and heat
  from the slopes around them, and a 510 m model cannot resolve them anyway. "Permanently shadowed" and
  "cold trap" are not the same thing, and the app should not let one stand for the other.

### Validation, and what it can and cannot claim

- **Consistency** (measured above): large shadows are cold in Diviner's model (97 to 100 % of the shadow
  within 5 km of the two crater floors and Nobile Rim 2), small ones mostly are not; of the cold triangles
  within 5 km of a site, 56 to 100 % sit on product 90's permanent shadow, except one triangle near Slater
  Plain. The cap's area below 110 K (14,749 km²) is smaller than product 90's PSRs over 1 km² (18,921 km²),
  as expected if not every shadow is a cold trap. Report every class area for 100, 110 and 120 K, so the
  threshold's weight (11 to 15 %) is visible.
- **The undocumented -1**: settle with the Diviner team or the PDS Geosciences Node what it means before any
  depth is shown. (Settled from the table, the physics and Paige et al.'s own map on 14 November, before any
  depth was shown; the team and the node have not been asked. `docs/method.md`, "Modelled cold traps".)
- **Independent indicators**: compare the classes with LAMP and LOLA albedo where they were not used, and
  with Li et al.'s figure, crater by crater; LCROSS's single point at Cabeus.
- **Registration**: Diviner's mesh comes from a Kaguya elevation model, not the LOLA grids the app uses, and
  covers only the first mapping year; check the offsets before drawing it at fine scale.

It can claim: where models of temperature and shadow say ice could last, and where orbital indicators agree.
It cannot claim: that ice is there, how much, or how deep. The app should say "modelled conditions where ice
could last" every time, never "ice here".

### Cost and risk

| Step | Effort | Compute | Data | Where |
|---|---|---|---|---|
| Read the Diviner product, resample, per-site summaries (coldest ground, areas by class within 5 and 10 km, slope on the way) | 0.5 to 1 day with tests | minutes | 117 MB download, a few MB kept | offline pipeline |
| Show them in the ground panel, the brief and the site list, with wording and a Learn section | 1 to 2 days | none | per-site JSON, a small map layer | app |
| LAMP, LOLA albedo and hydrogen context layers | 0.5 to 1 day | minutes | about 55 MB | offline pipeline |
| A classifier | days, plus rebuilding labels from M3 | hours | M3 images (GB) | offline |

What could break: the public reading a coloured layer as "ice found here", and the claim of a NASA-checked
number where it is a model. Honesty risks are higher than for idea 1, since Earthrise speaks to educators
and the public.

## Recommendation

**Before tomorrow evening (15 November): build neither, and change no number the app shows.** Both ideas
touch the margins or add claims the submission, pitch and video would then have to match, and the app's
ranking code is already changing on another branch today. Commit this study. If the team wants it, add one
sentence to the submission's future work, for example: "Next, a terrain ensemble from NASA's adjusted
south-pole maps, to show how often each landing still works, and a layer of modelled cold traps from LRO
Diviner beside each site's power and radio windows, labelled as modelled conditions, not detected ice."

**After the deadline, in this order:**

(Update, 14 November: steps 1 and 2 were built before the deadline after all, on the user's go-ahead; see
`docs/method.md`, "Terrain versions". The fitted model differs from the prototype's guesses in two ways that
matter: the two generations differ by about 1.4 m, 3 to 29 times the stated error, but are correlated over only
32 to 131 m, under two pixels, so the versions move each direction of the skyline partly on its own. The
emulator of step 5 was not built.)

1. Fit an error model to the two DEM generations, so its size and correlation length come from data, not
   from `ERR` alone (half a day to a day).
2. Run the Monte Carlo ensemble at the featured sites and compare it with first-order propagation and with
   today's budget; then show ranges and rank options by how often they hold (two to three days with the
   app).
3. Check skylines against product 90's NAC images at the sites they cover. *Done on 14 November 2026, ahead of the
   deadline at the team's request:* product 90's pictures reach only one featured site, so LROC's WAC polar movie
   frames were added (`docs/method.md`, Validation, item 5; `data/validation/images.json`). The app's shadows and
   20 pictures agree on a median 92 % of the ground, nearly all disagreement on shadows' edges; 17 of the 20 meet the
   check's own mark, so it misses: in the three that do not, all with the Sun 1.1° up or less, the app puts a fifth to a
   quarter of the sunlit ground in shadow, and product 90's terrain does much the same.
4. Build the cold-trap layer as a transparent index (Diviner, product 90 shadow and slope), with per-site
   summaries next to power and radio contact, and strict wording. (Built on 14 November, ahead of this
   order, at the user's request: `data/coldtraps`, `docs/method.md`, "Modelled cold traps".)
5. Consider an emulator only if step 2 shows first-order propagation failing often and instant spreads are
   needed for points the app has not seen; try a small ensemble in the browser worker or a precomputed
   margin map first.

**Do not build:** a supervised ice classifier or any "probability of ice"; an emulator before an ensemble
exists; hydrogen maps read at site scale; any wording that implies confirmed ice.

## What this study did

Read the pipeline's uncertainty code and the committed budget, the app's budget module, and the catalogue
and neighbourhood work on the `g-sites` and `g-objectives` branches; checked every product above from this
machine (labels, readmes and byte counts by range requests); computed the skyline-gap check from
`data/uncertainty/budget.json`; ran skyline ensembles at three sites and read the Diviner product with a
prototype, `pipeline/scratch/ml_study_probe.py` (committed with this study so the numbers can be rerun; it
imports the pipeline and changes nothing in it). A first run whose 25 km fields degenerated on the 13 km
near-field window was discarded; the numbers above come from the corrected rerun. Downloads: the Diviner
zip (116.6 MB), the PSR attribute table (369 KB) and labels and listings (under 1 MB), all into a scratch
folder and deleted afterwards. No app or pipeline code was changed, and nothing was added to `data_raw/`.

## Sources

Earthrise
- Uncertainty budget method: `docs/method.md`, section "Uncertainty budget"; data `data/uncertainty/budget.json`
- Pipeline code: `pipeline/lunar_pipeline/uncertainty.py`, `pipeline/lunar_pipeline/pgda90.py`, `pipeline/lunar_pipeline/horizon.py`

Terrain and uncertainty
- PGDA product 90, "A New View of the Lunar South Pole from LOLA": https://pgda.gsfc.nasa.gov/products/90 (files: https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/); Barker et al. 2023, Planet. Sci. J. 4, 183, https://doi.org/10.3847/PSJ/acf3e1; data https://doi.org/10.60903/gsfcpgda-lola-spole
- Product 90 PSR tables: https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ.TIF, https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ_1km2.DBF, https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ_1km2.CSV
- Product 90 slope and roughness: https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDSM_80S_80MPP_ADJ.TIF, https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDSM_60S_240MPP_ADJ.TIF, https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDRM_80S_1000MPP_ADJ_ROUGH_100M.TIF, https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDRM_80S_1000MPP_ADJ_SLP_100M.TIF, https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDRM_80S_1000MPP_ADJ_CLASS.TIF
- Product 90 effective resolution and NAC images: https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ_EFFRES.TIF, https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/M1311409938LE_20MPP.TIF, https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/M1311409938_20MPP_MODEL.TIF
- PGDA product 69, "Lunar Polar Illumination": https://pgda.gsfc.nasa.gov/products/69 (files: https://pgda.gsfc.nasa.gov/data/MoonIllumination/LPSR_85S_060M_201608.TIF, https://pgda.gsfc.nasa.gov/data/MoonIllumination/LPSR_75S_120M_201608.TIF, https://pgda.gsfc.nasa.gov/data/MoonIllumination/LPSR_65S_240M_201608.TIF); Mazarico et al. 2011, Icarus 211, 1066, https://doi.org/10.1016/j.icarus.2010.10.030
- LOLA polar grids at PDS: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ and https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ldam_50s_1000m_float.lbl

Temperature
- Diviner Polar Resource Products: https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/ (label https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.xml; zip https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/extras/prp/dlre_prp_south.zip; catalog https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/catalog/prpds.cat); Paige et al. 2010, Science 330, 479, https://doi.org/10.1126/science.1187726
- Diviner Polar Cumulative Products (seasonal): https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_pcp/seasonal/slon/pols/
- PDS Diviner page: https://pds-geosciences.wustl.edu/missions/lro/diviner.htm

Hydrogen
- LEND bundle: https://pds-geosciences.wustl.edu/lro/lro-l-lend-2-edr-v1/lrolen_0xxx/ (south averaged data: https://pds-geosciences.wustl.edu/lro/lro-l-lend-2-edr-v1/lrolen_0xxx/data/2011/20111211/lend_rdr_alds_20111211.lbl)
- Lunar Prospector special products: https://pds-geosciences.wustl.edu/missions/lunarp/reduced_special.html (file: https://pds-geosciences.wustl.edu/missions/lunarp/reduced/hydrogenhd.txt)

Frost indicators
- LAMP gridded data: https://planetarydata.jpl.nasa.gov/img/data/lro/lamp/gdr/LROLAM_2001/ (label: https://planetarydata.jpl.nasa.gov/img/data/lro/lamp/gdr/LROLAM_2001/DATA/RATIO/LAMP_80s_240mpp_ratio_albed_01.lbl); catalogue entry https://data.nasa.gov/dataset/lro-moon-lamp-5-gridded-data-record-v1-0
- Li et al. 2018, "Direct evidence of surface exposed water ice in the lunar polar regions", PNAS 115, 8907, https://doi.org/10.1073/pnas.1802345115 (read at https://pmc.ncbi.nlm.nih.gov/articles/6130389)
- Colaprete et al. 2010, "Detection of water in the LCROSS ejecta plume", Science 330, 463, https://doi.org/10.1126/science.1186986

Site selection
- Sanchez-Lozano, Pena-Asensio, Neira-Acosta, LPSC 2025 abstract 1149 (as cited in `docs/data-credits.md`)
