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
- **The ground**: the levels part 3 already serves, meshed around the eye in the site's frame with the Moon's curvature: the 20 m window to 5 km, the 80 m context to 20 km, the south cap (960 m cells) to 125 km. Shadows are worked out on the GPU for every pixel and every frame from those same height levels, by the engine's rule: the steepest rise of the ground towards the Sun against the Sun's elevation, with the Sun's 0.53° disc giving the penumbra (no GPU shadow maps). A TypeScript twin of the shader's rule is tested against the engine's shadow picture (the part 3 sweep), so the 3D view and the 2D shadow map agree.
- **The far skyline**: beyond 125 km, the site's 720-direction mask (hills out to 220 km) drawn as a dark ring whose top edge is the mask, so the skyline is complete in every direction.

### 3.2 Realism

The view must look like a photograph taken on the Moon, because it is drawn from the same physics the forecast uses:

- **No air.** The sky is black in daylight; the Sun is white (nothing reddens it), small (0.53°) and hard, with camera bloom and a faint six-spike flare; there is no haze, so 100 km hills are as crisp as 1 km ones.
- **Regolith light.** The ground follows lunar photometry: Lommel–Seeliger reflectance (no limb darkening), a lunar phase function, and the opposition surge, so the ground brightens looking away from the Sun and darkens towards it. Albedo varies gently (highland grey, brighter crater rims).
- **Shadows.** Hard edges with the true penumbra of the Sun's disc, by the engine's rule, every frame; at a low Sun they run for kilometres and sweep across the ground as Play runs.
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

### 3.4 The C++ core (later)

The shadow sweep and the horizon march move to one C++ core, compiled to WebAssembly for the browser and loaded by the pipeline through a C ABI. It is specified on its own in `2026-10-02-cpp-core-design.md` and built after part A. Part A uses the TypeScript and NumPy paths that exist today; nothing in part A waits for it.

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

**Fallback.** Without WebGL 2, the button opens today's "View all round" with the same words.

**Done when.** Every body is placed by a tested function, the shader's shadow rule agrees with the engine's shadow picture, the labels and plates agree with Explore for every hour of a test month, and the blind read (immersion included) passes.

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
- Target hardware: the demo runs on a laptop with a discrete GPU, chosen later. Budgets there: the stand view's first frame within 1.5 s of the route with warm caches, 60 frames a second at 1440 by 900, memory under 400 MB. They are measured on that laptop when it is chosen.
- The development laptop (integrated Intel UHD 620, about 11 frames a second for the mockup) is not a target for now. A quality setting (pixel ratio, shadow steps, detail on or off) keeps it usable; it is not tuned or benchmarked there.
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

1. **A, Stand on the Moon**, with the sky data and the sky modules (from 3 October). The C++ core follows in its own plan.
2. **B, the arrival and the home journey** (17 to 27 October).
3. **C, the space look across the pages** (28 October to 4 November).

The week to the freeze (8 November) is for fixes, the video and rehearsals.

## 11. Out of scope

Sound, VR headsets, a free-flying camera away from the site, rovers, stars fainter than magnitude 6.5, the Milky Way as an image, and any change to a computed number.

## 12. Risks

- **Demo laptop graphics.** Full realism needs a discrete GPU; the demo laptop is chosen for it and the budgets are measured there. On weaker machines the quality setting, then "View all round", keep the demo alive.
- **The C++ core.** Specified separately and built after part A; until then the TypeScript and NumPy paths serve, as today.
- **Immersion against clarity.** The blind reads keep both scores; the words never move off their plates.
- **Time.** Each part is shippable alone; if part C slips, the app keeps today's look with parts A and B.

## 13. Amendment: Part A as built (4 October 2026)

Part A was built on `feat/immersive-a` through twelve blind reads and twelve fix passes. This section records what was built where it differs from section 4, and the reads. Every change below has its ruling, with what it costs if wrong, in the plan's ledger (`docs/superpowers/plans/2026-10-02-immersive-a-stand-on-the-moon.ledger.md`).

### 13.1 Where it differs from section 4

- **The ways in.** "Stand at the site" beside the ground panel's tabs and under the answer, not "Stand here". The forecast page's tabs are now "Shadow map", "3D from above" and "Horizon chart", with a line saying what each shows. The horizon chart is also the fallback without WebGL 2.
- **The opening.** On a wide screen the view opens 35° left of the Sun, so the Sun stands near the right edge and the ground before you is lit from the side. The lander stands 16 m away, 40° left of the Sun at the period's first hour, whatever hour the view opens on. A tall screen puts the lander 20° left of the Sun and opens 15° left of it, so the lander stands near the middle. A night opening with Earth up faces Earth. The view still eases down from the sky over 3.8 s, skipped with reduced motion. Read 10 asked for this: facing straight into the Sun, everything in view is lit from behind, and the daytime scene read as night.
- **The Sun.** A white disc at its true 0.53°, with a faint glare and a tight bloom; there is no six-spike flare (read 5 took it for a camera fault, and read 8 found the glow as big as Earth). The exposure acts like a camera's. It stops down when the view looks down-Sun at sunlit ground (to 0.35 at most), and when the Sun is in the frame (to 0.6 with the Sun in the middle, less towards the edges).
- **The stars.** None by day until the view tilts up (from 15° to 35° of pitch), and all of them at night; section 4 had them dimmed by day. The caption after "Look up" says why: there is no air, and cameras set for the bright ground (Apollo's) use exposures too short to catch the stars.
- **Look up.** The sky alone, 50° up with a 62° field, the Southern Cross a little above the middle where it is up. Section 4 had a 72° field with the horizon, but at this site a slope beside the eye curved up from a corner like a planet's edge (read 7).
- **Drawn, not measured.** None of these is in section 4; the readers asked for all of them:
  - a small solar lander for scale, whose model and soft shadow come from one shape table, so the two match; its power light sits on the face you see and glows while it has power;
  - fourteen boulders and 360 pebbles, placed from the site's own seed;
  - stones and crater rims that cast their own shadows;
  - your own shadow, a person 1.8 m tall, with its length given in words; the level length is worked out from the Sun's height as its label shows it, so the sum checks.

  The line above the headline says the small craters and rocks are added to look real.
- **Night.** Earthlight lights the ground and the slopes that face Earth. A neutral fill stands for eyes adapting to the dark, so the lander and the ground do not vanish when neither the Sun nor Earth lights them. The fill is not physical, and the night captions say what does and does not light the ground.
- **The words.** One card at the top left, the same in every state. It holds the headline ("Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days without power"), the lander's state at the hour, what to watch next, a better landing day on its own row, and the way back. "Why this happens" gives one reason a page, so the card never scrolls: the radio story, the site's latitude, the pole, Earth's rocking, the black sky and the rest, then how we know.
  - **Key moments.** The Sun going behind the hills, the battery running out, Earth coming into view and the Sun coming back are flags on the time bar. Each flag moves the time, turns the view and captions what it shows.
  - **Pointers.** The Sun, Earth or the lander beyond either side of the view gets a pointer at that edge with its state. A body hidden behind the lander is named over the lander.
  - **The time bar's key.** It names only what the bar draws.
  - **Compass.** A strip that says "Facing west" replaces the N, E, S and W letters, which both readers of read 2 took for strays.
  - **Help line.** "Drag to look around; pinch or scroll to zoom." stays on wide screens instead of going after the first drag.
  - **Hide the words.** Leaves only a bare time bar.
- **Looking.** Zoom 14° to 75°. "Face the Sun" uses a 46° field, "Face Earth" 16°, and "Face the lander" 36°, with the lander's parts named on leader lines. Play runs 12 hours a second, as section 4 says.
- **Phone.** The card folds to the headline until "More". The look buttons sit on the time bar ("Face: Sun, Earth, Lander", "Look up", "Hide words"). The key folds behind a "Key" button, the key moments are dots with a chip naming the next one, and the pointers carry the body's name alone.
- **Performance.** Not measured, as the demo laptop is not chosen yet. The view draws only when something changes, then one sharp frame after 300 ms at rest, and `?quality=fast` lightens it. On the development laptop's integrated graphics a still frame at full quality takes seconds, which section 7 allows.

### 13.2 The blind reads

Each round, two fresh readers judged still screenshots, at 1440 by 900 and on a phone at 390 by 844. One reader was a hackathon judge, the other a secondary-school science teacher. Scores are in the order purpose, next step, look, room, readability, then immersion after the semicolon.

The gate: purpose, next step and look at 4 or more, room and readability at 3 or more, and immersion at 4, for both readers. Where a reader gave the phone a separate score, it is in brackets.

| Read | Judge | Teacher | Fails on |
|---|---|---|---|
| 1 | 4, 4, 4, 3, 4; 3 | 4, 4, 3, 3, 3; 2 | look, immersion |
| 2 | 4, 4, 3, 3, 4; 3 | 4, 4, 3, 3, 4; 3 | look, immersion |
| 3 | 4, 4, 4, 3, 4; 4 (phone: look 2, room 1, immersion 1) | 4, 4, 3, 3, 4; 3 | look, immersion, the phone |
| 4 | 4, 4, 4, 3 (phone 2), 4; 3 | 4, 4, 4, 2, 4; 3 | room, immersion |
| 5 | 4, 4, 3, 2, 4; 3 | 4, 4, 4, 3 (phone 2), 4; 3 | look, room, immersion |
| 6 | 4, 4, 4, 3, 4; 3 | 4, 4, 3, 3, 4; 3 | look, immersion |
| 7 | 4, 4, 3, 3, 4; 3 | 4, 4, 3, 3 (phone 2), 4; 3 | look, immersion |
| 8 | 4, 4, 4, 3, 4; 3 | 4, 4, 4, 3 (phone 2), 4; 3 | immersion |
| 9 | 4, 4, 3, 3, 4; 3 | 4, 4, 4, 3 (phone 2), 4; 3 | look, immersion |
| 10 | 4, 4, 4, 2, 4; 3 | 4, 4, 4, 3, 4; 3 | room, immersion |
| 11 | 5, 4, 4, 3 (desktop 4, phone 2), 4; 4 | 4, 4, 4, 2, 3; 4 | the teacher's room |
| 12 | 5, 4, 4, 3, 4; 3 | 4, 4, 4, 3, 3; 4 | the judge's immersion |

Immersion stood at 3 for both readers from the fourth read to the tenth, through passes that each answered what both readers had named: long shadows, rocks, a lander, the true-size Sun, the night light. It moved once the opening was lit from the side and the words over the scene were cut (passes 11 and 12). Reads 11 and 12 each met the whole gate for one reader: the judge in read 11, the teacher in read 12. Each read fell short by one score from the other reader: the teacher's room in read 11, the judge's immersion in read 12.

**Ruling.** Part A closes after read 12, as ruled after read 11: one bounded pass on what both readers of read 11 named, then a last read, whatever it said. The scores left short lie within the reads' own scatter: the same build scored 3 and 4 for immersion from the two readers. What both readers of read 12 named moves to parts B and C (13.3). Part B's reads add a recorded walk, a sequence of frames with Play sweeping the shadows and a turn round the horizon, to the stills. Cost if wrong: part A ships one score short of its gate in its last read.

### 13.3 Asks carried to parts B and C

From reads 10 to 12, not built in part A:

- The month's paths of the Sun and Earth drawn in the scene: solid where they clear the skyline, faint where the hills hide them, with the days of the flags marked (judge, reads 10 and 12; teacher, read 10).
- Where a hidden Sun or Earth sits, marked on the hill that hides it, and the level horizon drawn as a faint line, so "Sun 1.5° up, behind the hills" reads at a glance (both, read 12).
- One name for the dark stretch, which the view calls "in shadow", "behind the hills", "in the dark" and "the night" (judge, read 12; both, read 11).
- On a phone: the lander's line and the better day shown without "More", Earth's angle back on its pointer, the key's colours named without "Key", and button words on one line (both, read 12). Read 11 asked for the opposite on the first two, so the phone's card has to balance room against these.
- Captions of two lines at most, kept off the middle of the scene (both, read 12).
- Comparing two landing days, and the same day at another site, inside the view (judge, reads 10 and 12).
- A classroom setting with larger type and brighter grey text (teacher, read 12).
- "Why this happens" with the pole first, and a way to read all the reasons as one list (judge and teacher, read 12, who disagree on paging).
- Finer models: a lander that is more than a box, your shadow lying on the ground rather than standing like a figure, rocks as solid stones, and near craters that read as more than ink (both, reads 11 and 12).
- Earth's rise over the month and the lack of twilight explained where they happen, not only under "Look up" (teacher, read 12).
- The battery's level in the view, as on the forecast page (judge, reads 11 and 12).
