# Earthrise: immersive space design (2 October 2026)

Approved direction: "All three, in parts", built on one real sky (option 1 of three). Mockup: the "Stand on the Moon" artifact (https://claude.ai/artifact/4f8iLougbgjkdPkgMMFANF), version 2, rebuilt after "the graphics could be more realistic": NASA terrain from 20 m to 125 km, shadows from those heights, regolith photometry, a white Sun, NASA's Blue Marble Earth turned for the hour, and real stars. This spec builds on `2026-10-01-ui-redesign-design.md`: everything that document settled (plain words, answers first, big type, honest notes, the accuracy story) still holds unless a section below changes it.

## 1. Goal

A first-time visitor should feel they are standing on the Moon within ten seconds, and still read the answer at once. The product stays a forecast: where, when, how long a solar lander keeps power, and whether it can talk to Earth. Immersion is how the forecast is shown, not a separate toy.

Success is measured, not felt:

- Blind reads (two fresh readers, screenshots or a recorded walk, as before) keep purpose, next step and look at 4 or more and room and readability at 3 or more, and add a sixth score, **immersion** ("did it feel like being there?"), which must reach 4 for parts A and B.
- The three shots the 30-second video needs exist in the app itself: the arrival from space, the Sun skimming the ridge, Earth rising over the hills.
- The figures on screen are the engine's figures; the sky is placed from SPICE and NASA data, and a test says so for every body drawn.

## 2. What stays

- The routes, the answers, the words of every sentence the blind reads approved, the period controls, the lander dialog, the assistant, Compare, Accuracy, How it works, the brief.
- The engine's results and their tests. Nothing in this work changes a number.
- Offline: the venue laptop runs the production build with the Wi-Fi off; every new asset is in the data mirror.
- One gold action per screen; gold is the Sun, blue is Earth, green and red are the power verdict.
- No text under 14 px, controls at least 40 px tall, standalone links underlined, reduced motion respected.

## 3. One sky engine

One set of modules draws the sky and the ground for all three parts. It is written for React Three Fiber (already in the app) and fed only from data the pipeline and the engine already produce, plus three small new files.

### 3.1 Frames and data

- **World frame**: x east, y up, z south (north is −z), metres, origin on the ground at the site, the eye at the mast height (2 m by default). Directions come from the engine's azimuth (clockwise from north) and elevation.
- **Sun and Earth**: azimuth and elevation per hour from the engine's series (as Explore uses them). Their distance is not drawn: both sit on a sky sphere 200 km away at their true angular sizes, the Sun 0.53° and Earth about 1.9°.
- **Stars**: the Yale Bright Star Catalogue, 5th revised edition (about 9,100 stars to magnitude 6.5, with B−V colour), from NASA HEASARC. The pipeline writes `data/sky/stars.bin` (unit vectors in J2000, magnitude, B−V; about 180 kB). Proper motion is ignored (under 0.1° over the catalogue's epochs for all but a handful).
- **The Moon's orientation**: the pipeline writes `data/sky/moon_me_6h.f32`, the J2000→MOON_ME rotation as a quaternion every 6 hours from 2024 to 2036 (about 19,000 samples, 300 kB), from SPICE `pxform` with the same kernels as the ephemeris. The browser interpolates with slerp. Stars go J2000 → MOON_ME → the site's east, north, up.
- **Earth's rotation**: computed in the browser from Greenwich sidereal time and the IAU pole, so the right continents face the Moon; checked against SPICE (`IAU_EARTH`) in a fixture.
- **Earth's face**: NASA's Blue Marble (public domain), 2048 by 1024, about 1 MB. Earth's phase is lit by the true Sun direction, whatever the hour at the site.
- **The Moon from space** (part B): NASA SVS CGI Moon Kit colour map (4K) and relief (LOLA, 16 pixels per degree), resampled by the pipeline to web sizes (together under 15 MB).
- **The ground**: the levels part 3 already serves, meshed around the eye in the site's frame with the Moon's curvature: the 20 m window to 5 km, the 80 m context to 20 km, the south cap (960 m cells) to 125 km. Each is lit by the engine's own shadow picture for the hour (the part 3 sweep on that level), not by GPU shadow maps, so the 3D view and the 2D shadow map always agree.
- **The far skyline**: beyond 125 km, the site's 720-direction mask (hills out to 220 km) drawn as a dark ring whose top edge is the mask, so the skyline is complete in every direction.

### 3.2 Realism

The view must look like a photograph taken on the Moon, because it is drawn from the same physics the forecast uses:

- **No air.** The sky is black in daylight; the Sun is white (nothing reddens it), small (0.53°) and hard, with camera bloom and a faint six-spike flare; there is no haze, so 100 km hills are as crisp as 1 km ones.
- **Regolith light.** The ground follows lunar photometry: Lommel–Seeliger reflectance (no limb darkening), a lunar phase function, and the opposition surge, so the ground brightens looking away from the Sun and darkens towards it. Albedo varies gently (highland grey, brighter crater rims).
- **Shadows.** Hard edges with the true penumbra of the Sun's disc, from the engine's shadow picture; at a low Sun they run for kilometres.
- **Underfoot.** Metre-scale relief within 1.5 km: bowl craters with raised rims at three sizes and regolith roughness, drawn in the shader and fading with distance. The view says plainly that these small craters are drawn, not measured.
- **Earth.** NASA's Blue Marble and cloud maps at 1.9°, lit by the true Sun (its phase), turned by Greenwich sidereal time so the right continents face the Moon, with a thin atmosphere rim. Earthshine lights the ground faintly blue, in proportion to Earth's lit fraction, when Earth is up.
- **Stars.** The Yale catalogue in its B−V colours; dimmed while the Sun is up (a camera exposure), never in front of the ground.
- **Exposure.** ACES tone mapping; one exposure for the day scene; only the Sun blooms.

### 3.3 Modules (web)

| Module | Job | Tested by |
|---|---|---|
| `lib/sky/frames.ts` | azimuth/elevation ↔ world vectors; site east/north/up in MOON_ME | values against SPICE fixtures |
| `lib/sky/moonOrientation.ts` | load and slerp the 6-hour quaternion table | off-grid hours against SPICE to 0.001° |
| `lib/sky/stars.ts` | decode the catalogue; place stars for a site and hour; size and colour from magnitude and B−V | 20 stars at 5 hours against SPICE to 0.01° |
| `lib/sky/earth.ts` | Earth's lit fraction and rotation for an hour | phase against the Sun–Earth–Moon angle; rotation against SPICE |
| `components/sky/SkyScene.tsx` | the R3F scene: sky sphere, stars, Sun disc and glare, Earth, far ring, near ground | component tests with a stubbed renderer; screenshots |
| `components/sky/SkyLabels.tsx` | the words on the sky: Sun, Earth, N E S W, each with what it is doing | label text per hour |
| `components/sky/LookControls.tsx` | drag, wheel and keys to look; "Face the Sun", "Face Earth", "Look up" | yaw/pitch/zoom maths |
| `lib/sky/quality.ts` | picks the ground resolution, glare and pixel ratio from measured frame time | the choice function |

Names are indicative; the plan fixes them. Each module has one job and a test that runs without WebGL.

### 3.4 The C++ core

The two heaviest calculations move to one C++17 library, `native/`, used by both the browser and the pipeline:

- **Shadow sweep** (part 3's running maximum over the height levels): today 37 ms at half resolution and 135 ms at full in the worker. Target: 12 ms and 45 ms, so Play can redraw shadows every frame at the half level.
- **Horizon march** (720 directions across the nested tiles, with curvature): today about 2 s cold for a point the user picks. Target: under 0.6 s. It also returns, per direction, the distance of the highest point (for the far ring's shading).

Builds:

- **Browser**: Emscripten to WebAssembly with SIMD, loaded by the existing workers. When the module cannot load, the workers keep using the TypeScript code (today's path), so nothing breaks.
- **Pipeline**: a shared library (`.dll` built with the MinGW-w64 g++ already installed; `.so` elsewhere) with a plain C ABI, called from Python with `ctypes` and NumPy arrays. When it is missing, the pipeline keeps its NumPy code.

Parity is the rule: the existing golden fixtures (masks within 0.0005°, the shadow fixtures) run against the TypeScript, WebAssembly, NumPy and C++ paths, and all four must agree. The built `.wasm` is committed, so `npm run build` needs no C++ toolchain; a script rebuilds it and a test fails if the committed module is older than its sources.

Downloads to approve before fetching (each over the ~100 MB rule): the Emscripten SDK (about 1 GB installed). The MinGW toolchain is already present.

## 4. Part A: Stand on the Moon

**Where it lives.** A new full-window view, `/explore/stand` (same `site`, `start`, `days` as Explore, plus the hour), opened from a "Stand here" button beside the ground panel's tabs and under Explore's answer. Back returns to Explore at the same hour. The home arrival (part B) ends here.

**What you see** (as the mockup):

- A black sky, in daylight too. Real stars, dimmed while the Sun is up at the site, full when it is night.
- The Sun as a small white disc with camera bloom, skimming the ridge. Earth at its true size with its true phase and the continents that face the Moon, hidden when the hills hide it.
- The ground to 125 km from NASA's heights (20 m near you), with the realism of section 3.2: regolith light, the engine's shadows, small craters underfoot, earthshine when Earth is up; the skyline beyond from the site's horizon.

**The words** (on quiet plates, never over the Sun):

- Top left: where you stand ("Standing at de Gerlache Rim 2, 88.3° S: a ridge NASA shortlisted for astronauts"), Explore's answer title, the live sentence for the hour (the ground panel's sentence: sunlight or shadow and why, Earth in view or not), and the lander's state ("The lander has power" / "off: its battery ran out on 4 January; power comes back on 20 January").
- Labels on the sky: "Sun 2.4° up", "Sun, behind the hills", "Earth 4.5° up", "Earth, below the horizon", and N, E, S, W on the horizon.
- Bottom: the time bar (Play, the hour, the gold Sun-up track and the blue Earth track).
- One line of help until the first drag: "Drag to look around. Scroll to zoom. Press Play to run the month."
- A note on what is measured and what is drawn (the mockup's: "Ground from NASA's laser altimeter…; the small craters underfoot are drawn, not measured").

**Interaction.** Drag or arrow keys to look; wheel or pinch to zoom (14° to 75°); "Face the Sun" (46°), "Face Earth" (16°, so Earth's phase and continents read), "Look up" (72°). Play runs 12 hours a second. The view opens looking at the stars and settles on the Sun in under four seconds; with reduced motion it opens settled.

**Phone.** The plate shrinks to the title and the live sentence; the look buttons sit under it; the time bar stays. Touch drag looks around.

**Fallback.** Without WebGL, or when the quality check cannot reach 30 frames a second, the button opens today's "View all round" with the same words.

**Done when.** The view runs at 30 frames a second or more at 1440 by 900 on the development laptop's integrated GPU (60 on a discrete GPU), every body is placed by a tested function, the labels and plates agree with Explore for every hour of a test month, and the blind read (immersion included) passes.

This also closes the deferred "the 3D view has no north or Sun direction".

## 5. Part B: Arrival and the home journey

The home page's first screen becomes the sky engine seen from space: the Moon (CGI Moon Kit colour and relief), lit by the real Sun for 1 January 2027 10:00 UTC, the terminator across the south pole, Earth beyond, the headline over it: "See when a Moon lander has sunlight and a signal."

Scrolling (or "Explore a landing site") runs the arrival, four beats, each with one sentence:

1. **The Moon** (from space): "At the south pole the Sun never climbs: it circles the horizon once a month."
2. **The pole** (the camera swings down; long shadows across the cap level): "One hill can hide it for weeks."
3. **The ridge** (descent onto de Gerlache Rim 2; the 80 m and 20 m levels load in): "This ridge was shortlisted for astronauts."
4. **Standing** (the part A view, the Sun on the ridge): Explore's answer for the site, with its two actions: "Explore this site" and "Choose a landing site".

The rest of the home page follows below (the three facts, the real places, the checks), in the part C look. Reduced motion shows the four beats as still frames with the same sentences. A "Skip" button is always visible while the arrival plays. The arrival never blocks reading: its sentences are text in the page, so a screen reader and a search engine read them in order.

**Done when.** The arrival runs smoothly from the first frame (the Moon textures stream in at a low resolution first), the four beats are the video's first 15 seconds, and the blind read (immersion included) passes.

## 6. Part C: The space look across the pages

- **Dark by default.** The page is near-black, the stages true black; the light theme stays for print and classrooms (the brief always prints light). The theme switch keeps its place.
- **The sky behind the pages.** Faint real stars (the same catalogue, a fixed hour) behind each page's header band only; never behind running text.
- **Plates.** Panels become dark plates with a hairline edge; no blur, no gradients, no glow except the Sun's glare and Earth's atmosphere, which are physical.
- **Type.** Unchanged faces and sizes; contrast rechecked for the dark palette (body text at least 7:1 on the page, secondary text at least 4.5:1).
- **Motion.** One orchestrated moment on the home page (the arrival); elsewhere, nothing moves unless the visitor moves it.
- **Phone.** The period band folds into one line ("de Gerlache Rim 2, 30 days from 1 January, small lander: change") so the answer is on the first screen (a deferred finding of the final read).

**Done when.** Every page passes the size and contrast measurements in both themes and the blind read of the whole app passes.

## 7. Performance and offline

- New data: stars 0.2 MB, Moon orientation 0.3 MB, Blue Marble 1 MB, Moon textures under 15 MB, the WebAssembly core under 0.3 MB. All in the data mirror and the R2 bucket, cached like the rest.
- Budgets: the stand view's first frame within 1.5 s of the route with warm caches; at 1440 by 900, at least 30 frames a second on the development laptop's integrated Intel UHD 620 (the class of machine the venue may have) and 60 on a discrete GPU; memory under 400 MB.
- What the mockup measured: tracing shadows per pixel through the height textures runs at about 11 frames a second on the UHD 620. The product therefore samples the shadow picture the engine computes once per hour and level (the C++ sweep makes that fast enough for Play), and keeps the per-pixel work to the photometry and the detail.
- The quality step lowers the pixel ratio, then the ground resolution, then the glare; it never drops the words.

## 8. Accessibility

- Everything the sky shows is also said in words: the plates and labels are text, the live sentence is announced politely when the hour changes by a key press (not while Play runs).
- Keyboard: arrows look, `+`/`-` zoom, space plays, the look buttons are buttons; focus is always visible.
- Reduced motion: no camera flights, no auto-turning; the arrival becomes still frames.
- No information by colour alone: Sun and Earth are named on the sky.

## 9. Testing and gates

- Test first, as before; gates from `web/` (`npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`) and `pipeline/` (`uv run pytest -q`).
- New fixtures from SPICE: star and planet directions for sites and hours, the Moon orientation at off-grid times, Earth's rotation and phase.
- C++ parity: the four paths against the same fixtures.
- Screens: screenshots at 1440 by 900 and 390 wide of every new view, measured (text size, control size, no sideways scroll), on `127.0.0.1` at 100 % zoom.
- Blind reads per part, with the immersion score; fix what both readers name; repeat until it passes.

## 10. Delivery

Three parts, each its own plan and pull request, merged on green:

1. **A, Stand on the Moon**, with the sky data, the sky modules and the C++ core (3 to 16 October).
2. **B, the arrival and the home journey** (17 to 27 October).
3. **C, the space look across the pages** (28 October to 4 November).

The week to the freeze (8 November) is for fixes, the video and rehearsals.

## 11. Out of scope

Sound, VR headsets, a free-flying camera away from the site, rovers, stars fainter than magnitude 6.5, the Milky Way as an image, and any change to a computed number.

## 12. Risks

- **Venue laptop graphics.** The quality step and the fallback to "View all round" keep the demo alive; rehearse on the laptop in part A.
- **Toolchain downloads.** Emscripten is about 1 GB; if it cannot be installed, part A ships with the TypeScript paths and the C++ core follows.
- **Immersion against clarity.** The blind reads keep both scores; the words never move off their plates.
- **Time.** Each part is shippable alone; if part C slips, the app keeps today's look with parts A and B.
