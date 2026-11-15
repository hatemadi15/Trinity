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

## 14. Amendment: Part B as built (5 October 2026)

Part B was built on `feat/immersive-b` through seven blind reads and six fix passes. This section records what was built where it differs from section 5, and the reads. Every change below has its ruling, with what it costs if wrong, in the plan's ledger (`docs/superpowers/plans/2026-10-04-immersive-b-arrival.ledger.md`).

### 14.1 Where it differs from section 5

- **Seven screens, not four beats.** The arrival is a section seven screens tall. Each screen is a stop of the flight, with one sentence:
  1. **The whole Moon**, north up, Earth just beyond its south pole, with the headline, a paragraph and the audience line ("For planners of NASA's commercial Moon landers, educators and anyone curious.").
  2. **The pole** from 900 km: "At the south pole the Sun never climbs: it circles the horizon once a month." The camera rests there. An early build ran the month's hours over the pole; read 4 found the dates out of order, so the month now runs once, at the site.
  3. **The cap** from 90 km, lit from the side: "NASA has shortlisted this ridge for astronauts to land on." The site's name goes before the pole's, so on a phone "this ridge" is marked.
  4. **The ridge** from 2 km, looking past the site at the Sun just over the hills: "Land a small uncrewed solar lander here on 1 January: the Sun stands just above the hills."
  5. **Landing beside the lander**: "One hill can hide the Sun for weeks. Here is January at this spot, sped up."
  6. **The month at the site half run**: "Earth comes into view on 10 January, but the lander's battery ran out on 4 January."
  7. **Its end**: Explore's answer for the site, the better landing day, "Open the full forecast" and "Choose a landing site".
- **The month at the site.** After landing, the hours run from the landing hour to five days after the Sun comes back, at an even pace, once and in order. The Sun slips behind a hill (3 January), the battery runs out (4 January), Earth comes into view (10 January) and the Sun comes back (20 January).
- **The camera beside the lander.** It stands a few metres up behind the lander and circles it as the story turns. On a wide screen the lander stands right of the words' column, whole, at every hour; the beats' cards are at most 46 per cent of the width. On a phone it stands under the Sun or Earth, above the words at the bottom. Read 4 found the lander missing from the descent, and read 5 found the cards over it.
- **The date bar.** Once landed, a bar at the top gives the date on one line and, on the next, a moment's name for a day after it passes, or what lights the ground ("In sunlight", "Lit only by Earthlight (picture brightened)", "In the dark (picture brightened)"). The month runs under it, the four moments ticked in their bodies' colours with a key. The beats' cards fade as they reach the top, so they never pass over it.
- **Power coming back.** The forecast counts energy only. Wherever the power comes back, on the stand view's state line too, it says "if the lander survives" the stretch without power (reads 6 and 7).
- **Labels.**
  - The Sun and Earth are named where they show. Out of view, once landed, they are pointed to from the left or right edge, at their height, the arrows along the horizon: a pointer up into the sky read as the Sun climbing.
  - The paths are dotted where the hills hide them, as the forecast chart dots the hidden Sun. Each is named over its own line, away from the other path, while it is the story: the Sun's until Earth comes into view, Earth's until the Sun comes back. On a phone, no path is named.
  - The level horizon is left out of the arrival; the stand view keeps it.
- **The actions, named for where they go.** "Fly to the south pole" plays the arrival in 21 seconds, 15 to landing and 6 through the month. "Open the full forecast" opens Explore for the site; "Choose a landing site", and "Choose a site" in the menu, open the list. Section 5 named all three "Explore…", which neither reader of read 4 could tell apart.
- **The ground.** From the reads:
  - no seam where the eye comes round square to the Sun, and no hairline where your shadow's reach ends;
  - craters with no thin rings, of every age, rims not perfect circles;
  - rocks as broken blocks;
  - no person's shadow in flight, as the arrival's camera is no one standing there.
- **Drawing.** The lander is drawn with the solid things. The guides blend in the same pass, before it, so it covers them. Drawn in three.js's transparent pass, the lander went missing once the flight had passed over the cap; the cause inside three.js or the driver was not found.
- **Stills.** One for each of the seven screens, wide and tall, from the production build.
- **The machine.** The development laptop (8 GB) ran short of memory and disk during the reads. The test browser's graphics process failed to compile the ground shader after many page loads. A fresh browser compiles it; the reads' frames were taken with the browser restarted between phases.

### 14.2 The blind reads

Each round, two fresh readers judged still screenshots: a hackathon judge and a secondary-school science teacher. The frames were a walk down the arrival at quarter screens, each screen on a phone, the first loads, the rest of the home page and the stand view at eight hours. Scores are in the order purpose, next step, look, room and readability, then immersion after the semicolon. The gate is as in 13.2: purpose, next step and look at 4 or more, room at 3 or more, and immersion at 4, for both readers.

| Read | Judge | Teacher | Fails on |
|---|---|---|---|
| 1 | 5, 4, 3, 4; 3 | 5, 4, 4, 4; 3 | look, immersion |
| 2 | 5, 4, 4, 4; 3 | 5, 4, 4, 3; 3 | immersion |
| 3 | 5, 4, 4, 4; 3 | 5, 4, 4, 3; 3 | immersion |
| 4 | 5, 4, 4, 4; 3 | 4, 4, 3, 4; 3 | look, immersion |
| 5 | 5, 4, 4, 4; 3 | 5, 4, 4, 4; 4 | the judge's immersion |
| 6 | 5, 4, 4, 4; 4 | 5, 4, 4, 4; 4 | none |
| 7 | 5, 4, 4, 4; 3 | 4, 4, 4, 4; 4 | the judge's immersion |

Immersion stood at 3 for both readers through the first four reads, through passes that each answered what both had named: the north-up Moon, pointers to the Sun and Earth, the measured cap at the pole, craters, named paths, and the month at the site. The teacher moved to 4 in read 5, once the camera landed beside the lander and a date bar ran over the month. The judge moved to 4 in read 6, once the lander stood clear of the words at every hour. Read 6 met the whole gate. Read 7 followed a bounded pass on what both readers of read 6 had named: the Sun in the picture over the ridge, pointers along the horizon, and the night's name kept whole on a phone. Its judge gave immersion 3, for the night ground and the rocks, and its teacher gave 4.

**Ruling.** Part B closes after read 7, as part A closed after read 12. Read 6 met the whole gate, and read 7 fell one score short from one reader, within the reads' own scatter: read 6's judge gave the same arrival a 4. Two things both readers of reads 6 and 7 named were fixed after read 7 without a further read, as clear and small changes:
- The stand view's power-back line now carries the survival condition.
- The date bar keeps one height.

The rest moves to part C (14.3). Cost if wrong: part B ships one score short of its gate in its last read.

### 14.3 Asks carried to part C

From reads 5 to 7, not built in part B:

- Say on the home page how the site answers the challenge, a browser of landing sites and dates, with more than two landers (judge, reads 5 to 7).
- The descent's middle (the cap from 900 to 90 km) reads soft and smeary, and half of the screen is black there (both, reads 5 and 6). A crater layer a few kilometres across would add a fourth far layer to the ground shader, whose compile already ran short of memory on the development laptop.
- Rocks still read as boxes, the lander as plain (both, reads 6 and 7).
- The stand view: crowded for a first look and for a projector; the lander out of frame at most hours; "if it survives" at one hour and "has power again" at another; the level horizon through the hill at night (both, reads 6 and 7).
- The date bar: the 3 and 4 January marks nearly on top of each other, and no mark for Earth setting (teacher, read 6).
- The phone's last screen: the answer's card covers the date bar and the sky (teacher, read 6).
- Say that the forecast's lander is an example, not a planned mission (teacher, read 6).
- The teacher's route ("Teaching this? How it works…") nearer the top, and the cause (the Moon's small tilt, a month-long day) said on the home page (teacher, reads 5 to 7).
- The ground at night: a flat grey plane in the dark, then blue in Earthlight with no word on the colour (both, read 7).
- A sharper patch round the site seen from the cap, where the measured window meets the coarser ground (judge, reads 1 and 7).
- One name for each event across the chart, the story, the stand view's flags and the scene's labels ("sets", "hides", "behind the hills") (teacher, read 7).
- Earth's loop explained where it first shows (teacher, read 7).
- Labels joined to their marks and sized for a projector (teacher, read 7).

## 15. Amendment: Part C as built (5 October 2026)

Part C was built on `feat/immersive-c`. It covers section 6 and the page-level asks of 13.3 and 14.3. Its ledger is beside its plan, at `docs/superpowers/plans/2026-10-05-immersive-c-space-look.ledger.md`, with every ruling and what it costs if wrong. The asks about the 3D scenes go to their own plan, part D (15.3).

### 15.1 Where it differs from section 6

- **The palette.** The dark theme is the default; a stored choice or `?theme=` still wins, so a visitor who chose light keeps it.
  - The page is near-black (`#07080a`) and the stages true black.
  - Plates are one step above the page (`#0f1013`, `#17181c`), with a hairline edge (`#2a2b30`).
  - Controls' edges are 3:1 on the page (`#6b6c71`), and a picture panel's edge is 2:1 on both the page and the stage (`#48494e`).
  - Body text is at least 7:1 on the page and its plates in both themes, and secondary text 4.5:1. Secondary grey is a step brighter than before (`#aeada8`, 8:1), for a classroom's projector.
  - The dark values hold on screen only: printed, every page takes the light theme's ink on white, whatever the theme on screen. With dark the default, How it works printed from it had pale grey text on white.
- **The stars behind the header band.**
  - **What:** a 2D canvas first in the app frame draws the stand view's catalogue, the low sky over the south pole. The Moon's axis is within 1.6° of the ecliptic's, so the band is the ecliptic from the horizon up, centred on Scorpius and Sagittarius (longitude 255°), 16 px to the degree.
  - **Where:** from the top of the page to just past the element marked `data-band-end` (each page's title), stopping 4 px short of the running text under it. The band fades out over its lowest third. On the home page and on Explore it is the header alone: on a phone Explore's period band is a line of words.
  - **How faint:** each star is 0.8 to 1.6 px across, 0.14 to 0.55 opaque and halfway to white. After read C1 found the brightest stars read as stray orange dots, none stands out.
  - **When:** in the dark theme only, never printed. Without the catalogue or a 2D canvas, the page is as before.
- **Plates.**
  - The arrival's and the stand view's plates are near opaque (92 %), with no blur. The phone's shade behind the opening words is a plate, edge to edge.
  - A source test keeps blur, gradients and glows out of the pages. It allows three things: the compass strip's fading mask, the radio band's stripes, and the black halo on the stand view's star names.
- **Motion.** The home chart's line no longer draws itself on load: the arrival is the one motion that plays by itself. The stand view's opening turn stays, as it answers the visitor's click.
- **Explore on a phone.** The period band folds into "de Gerlache Rim 2, 30 days from 1 January 2027, small lander: change", with the year and the lander's size. "change" opens the fields, and "done" folds them.
- **The home page.**
  - The first screen says "Earthrise is a browser of landing sites and dates: pick a place and a day from 2024 to 2036 … for three ready-made landers or your own".
  - The audience line sends teachers to How it works.
  - The forecast's lander is "an example lander, not a planned mission".
  - The first fact gives the cause: the Moon's 1.5° tilt and its month-long day. The teachers' line stands above the three facts.
  - The first screen and the landing beat give the year ("1 January 2027").
  - On a phone the first sentence and the scroll hint wait for a wider screen, so the Moon shows under the words.
- **One name for each event**, in the charts and their keys, the arrival, the stand view, Explore's answer, its time bar, the shadow map, the lander dialog, the glossary and How it works:
  - **Sunset** and **sunrise**. A body hidden while still above the horizon is "behind a hill", or "partly behind a hill": "Sun behind a hill, 1.4° above the horizon" on a label, "Sun behind a hill" on Explore's time bar. Read C1 found "1.4° up, set behind the hills" said up and set at once. A sentence about the moment says the body "sets behind the hills", and the charts' keys say their lines are "dotted while set".
  - **Night** for the stretch without the Sun.
  - **Earth rises** and **Earth sets**.
  - "In shadow" stays for a place on the shadow map.
  - A test reads every hour of the hero month, the charts' keys, the lander dialog and How it works for any other name.
- **The date bar.**
  - Earth setting is a key moment, "Earth sets", with its flag, its mark on Earth's path and its caption.
  - The bar draws the Sun's moments over its line, the battery's across it and Earth's under it, so moments hours apart never cover each other.
  - The lanes stand 2 px apart: the battery's marks are 6 px tall across the line, the Sun's and Earth's 10 px tall from 5 px off it, all 4 px wide.
  - Its key reads "Sunset or sunrise", "The battery runs out", "Earth rises or sets", at 15 px.
  - The beats' plates fade out by the bar's foot, so the bar stays. On a wide screen the words of the beats after landing are centred in the room under the bar, and each is whole at its own stop, on a short window too (a laptop at 150 %). Before landing they fade only at the top.
  - The "Earth sets" flag turns the view to Earth, as "Earth rises" does.
- **Labels and the last screen.**
  - Each label with a dot has a short line to its mark, and a path's name has one to its path.
  - Earth's path is named "a loop: the Moon wobbles a little each month" on a second line, in the arrival and in the stand view. Read C1 found "rocks" read as stones.
  - The answer's card starts under the date bar at every width: the beats' column is centred, so its card always reached under the centred bar.
- **The stand view on a phone.**
  - Folded, the card keeps the headline, the lander's line and the better day.
  - Earth's pointer keeps its angle ("Earth 5.9° below").
  - The time bar names its keys under the date, with no Key button.
  - The card's buttons keep their words on one line.
- **Explore and the site list.** "Stand at the site" is the plain button under the answer; the gold stays the better day's. The site list says what its figures count from, the lander and the order in one paragraph, not a list of terms.
- **The classroom.** How it works says how to show the app on a projector: zoom the page to 150 %. There is no separate mode: the pages reflow at 960 px, and the 3D labels grow with the page.
- **The measurements.** Every page was checked in both themes at 1440 × 900, at 390 × 844 and at 960 × 600 (150 % zoom), on the final build: no sideways scroll, no text under 13 px, and no text under 4.5:1 against its ground. Text part way through a fade is left out of the count. Two controls stay under 40 px:
  - the time slider, 32 px, a track the width of the bar;
  - the stand view's flags on a wide screen, 20 px chips spaced along the bar (on a phone they are 40 px dots).

### 15.2 The blind reads

Two fresh readers, a hackathon judge and a secondary-school science teacher, judged 52 still screenshots in the dark theme by default:
- the arrival, a quarter screen at a time;
- every page;
- the stand view at five hours;
- each screen on a phone;
- Explore and How it works in the light theme.

The scores are in the order purpose, next step, look, room and readability, then immersion after the semicolon. The gate is as in 13.2.

| Read | Judge | Teacher | Fails on |
|---|---|---|---|
| C1 | 5, 4, 4, 3, 4; 4 | 5, 4, 4, 3, 4; 4 | none |

**Ruling.** Read C1 met the whole gate for both readers. As part B did after its passing read 6, one bounded pass followed, without a further read. It took what both readers named that was cheap, clear and on the pages, several of them part C's own changes:
- the up-and-set label;
- "the Moon rocks";
- the band's orange star;
- the phone's plate over the Moon;
- the date bar's marks, and the bar giving way to the plates;
- the year;
- "Stand at the site" as a link;
- the site list's terms.

The rest goes to part D (15.3) or to the deferred list. Cost if wrong: part C ships with the stand view as crowded as both readers found it.

### 15.3 Asks carried to part D, the scenes

From the reads of parts B and C, about the 3D scenes rather than the pages:

- The descent's middle (the cap from 900 to 90 km) reads soft and smeary, with half of the screen black. A sharper patch round the site shows from the cap, where the measured window meets the coarser ground (both, part B reads 1 and 5 to 7).
- Rocks read as boxes, and the lander as plain (both, part B reads 6 and 7).
- The stand view:
  - crowded for a first look and for a projector;
  - the lander out of frame at most hours;
  - the level horizon through the hill at night;
  - the "Facing …" chip meeting Earth's label on a phone (part B reads 6 and 7; seen again in part C's checks).
- The ground at night: a flat grey plane in the dark, then blue in Earthlight with no word on the colour (both, part B read 7).

From part C's read C1 (both readers):

- The stand view: give the Moon the screen, which both readers named as their one change. Fold the card to a one-line status (the date, the power, the radio) with More. Label only the Sun, Earth and the lander by default. Put the paths, the level horizon and the star names behind one "Show guides" button. On a phone the scene is a strip a third of the screen tall.
- Labels in the scenes: they blink as the page scrolls ("Night here", the pole); Earth's labels pile up round its small disc, with its path through them; "Earth sets, 23 Jan" stands beside a rising Earth; the compass letters are cut at its ends.
- The Sun's path drawn solid above the hills in view while it is night: the hill that hides the Sun is out of view.
- Elsewhere on the pages, for a later pass:
  - Compare opens empty.
  - On a phone, Explore's sticky time bar covers the better day's button.
  - The light theme's diagrams stay black boxes.
  - The site list's map labels tangle near the pole.
  - The home chart still needs its paragraph to be read.

## 16. Amendment: Part D, the scenes (5 October 2026)

Part D takes the asks of 15.3. The user approved its first half, D1, from a mockup laid over the production build (`part-d-mockup-wide.jpg` and `part-d-mockup-phone.jpg`, 5 October 2026: "yes go ahead").

### 16.1 Two halves

- **D1, now: the stand view gives the Moon the screen.** This is the one change both readers of read C1 asked for, and the label fixes that go with it. It is mostly page work, built on `feat/immersive-d`.
- **D2, later, as its own plan:**
  - rocks as stones;
  - a finer lander;
  - the descent's middle (900 to 90 km) sharper, with no square patch round the site;
  - the night ground, today a flat grey plane in the dark.

  These are graphics work, and the ground shader's compile already runs short of memory on the development laptop.

Two other ways were weighed and set aside:
- Words that fade by themselves after a few idle seconds: motion nobody asked for, and screenshots would vary.
- Two modes, a forecast and a photo: one more thing for a first-time visitor to learn.

### 16.2 D1: the words over the view

- **A one-line status** replaces the card at the top left. It holds the lander's dot, then its power and radio for the hour, then "More".
  - On a wide screen the site's name comes first, in the secondary grey: "de Gerlache Rim 2. Power on, battery 100 %. No radio: Earth is below the horizon."
  - On a phone the name waits under More, and the line wraps to two lines at most.
  - The words, one name for each state:
    - with power: "Power on, battery 87 %.", or "Power on." without a battery size;
    - after a power cut: "Power on again since 20 January, if the lander survived 16 days without power; battery 40 %.";
    - without power: "Power off: the battery ran out on 4 January.", and "Power does not come back in this period." when it does not;
    - with power, the radio follows: "Radio contact: Earth is in view.", "No radio: Earth is below the horizon." or "No radio: Earth is behind a hill.";
    - without power and with Earth in view: "Earth is in view, but the radio has no power.";
    - while the power is worked out: "Working out the lander's power…".
  - The dot keeps its colours: green with power and Earth in view, amber with power alone, red without power.
  - The status line takes two lines at most at 1440 px wide, in every state.
- **More** ("More ▾", "Less ▴", with `aria-expanded`) opens today's card under the status, at the left. The card holds:
  - the line on where you stand;
  - the headline;
  - what to watch next;
  - the better landing day (the screen's one gold action);
  - "Why this happens" and "Back to the forecast";
  - the help line ("Drag to look around; pinch or scroll to zoom.");
  - on a phone, "Hide the words".

  The headline stays the page's level-one heading at all times, for screen readers, and shows in the card when it is open.
- **The buttons**, one compact row.
  - On a wide screen it sits at the top right: "Face" in grey, then "Sun", "Earth", "Lander" (named "Face the Sun", "Face Earth", "Face the lander" for screen readers), a divider, "Look up" (or "Look ahead"), "Guides" and "Hide words".
  - On a phone the row sits just above the time bar, with the same buttons but "Hide words", which moves under More.
- **Guides** is a toggle (`aria-pressed`), off when the view opens. It shows and hides:
  - the month's paths of the Sun and Earth, with their names;
  - the key moments' days on the paths;
  - the level horizon and its name;
  - the star names;
  - your shadow's length.
- **What shows without Guides:**
  - the Sun, Earth and the lander, named where they show (and the lander's parts when the view is zoomed in on it), with pointers at the edges for what is out of view;
  - the ring where a hidden Sun or Earth sits on the hill that hides it, as it goes with that body's label;
  - the compass strip, the caption line and the time bar.
- **Star names** show with Guides at night, and whenever the view looks well up (pitch over 25°), as "Look up" is about the stars and its caption names the Southern Cross.
- **Hide words** still leaves only a bare time bar; "Show the words" brings back the view as it was, Guides included.

### 16.3 D1: the scene's labels and framing

- **The opening keeps the lander in frame.** The lander still stands 16 m away, but it is placed by the hour the view opens on, not the period's first hour, so the opening view holds both the lander and what the view faces.
  - It stands 40° left of the Sun (20° on a tall screen), as before, when the view opens by day or in the dark. When it opens at night on Earth, it stands 22° left of Earth (10° on a tall screen), as that view is narrower.
  - Its solar panel and dish still face the Sun and Earth of the landing hour, as a lander that landed then would.
  - The home page's arrival lands beside it at the landing hour, so nothing changes there.
- **The level horizon hides behind the hills.** It is drawn only where it clears the skyline. Its name sits at the left-most stretch of the line in view at least 3° long, and is left out when none shows. Both readers of part B's reads 6 and 7 found the line through the hill at night.
- **Earth's labels do not pile up.**
  - With Guides on, a path's name and the days on it keep 24 px clear of their own body's label, so "Earth sets, 23 Jan" never stands beside a rising Earth.
  - The labels' plates are near opaque, so no path line shows through a name.
- **The compass letters fade whole.** Each of the eight points fades as one piece, from fully shown 40 px in from either end of the strip to gone before any part of it reaches the end, so no letter is cut ("N" for "NW"). The ticks keep the strip's fading edge.
- **The facing chip on a phone** counts as a panel, so the labels keep off it.
- **Earthlight says why the ground is blue.** The caption at night with Earth in view reads "Earthlight, sunlight bounced off Earth, lights this ground and tints it blue; brightened like a long exposure." In the arrival's date bar the state reads "Night, in blue Earthlight (picture brightened)".
- **Framing.** The horizon rests where it does today, 55 % down the room above the time bar on a wide screen and 40 % down the band between the status and the buttons on a tall one. The shorter status gives that band more room, so on a phone the scene grows from about a third of the screen to about 60 %.

### 16.4 D1: the arrival's labels

- Labels no longer switch off where they meet the beats' words. The words' plates pass over them, so a label never vanishes for one quarter-screen and comes back at the next ("Night here" in frames 04 to 06 of read C1, the pole's name at 07). Labels still give way to each other and to the date bar.
- "Night here: the Sun is below the horizon" becomes "Ground at night: the Sun is below the horizon", so the black it floats over reads as ground (part B read 7: "pointing at nothing").

### 16.5 D1: done when

- Every rule above has a test that failed first.
- The stand view's frames at 1440 × 900 and 390 × 844, by day and at night, Guides off and on, pass the measurements of 15.1: no sideways scroll, no text under 13 px, no text under 4.5:1.
- The phone's scene band (from the status's foot to the buttons' top) is at least 55 % of the screen's height.
- A blind read of the stand view and the arrival, by the same two readers' roles, passes the gate of 13.2: purpose, next step and look at 4 or more, room and readability at 3 or more, immersion at 4.

### 16.6 D1 as built: where it differs from 16.2 to 16.4

D1 was built on `feat/immersive-d`. Its ledger is beside its plan, at `docs/superpowers/plans/2026-10-05-immersive-d1-stand-view.ledger.md`, with every ruling and what it costs if wrong. Where the build differs from 16.2 to 16.4, from the checks on the production build and from the blind read's bounded pass (16.7):

- **The status line.**
  - On a phone it takes two lines by day. At night its power-off sentence takes three, as in the approved mockup; 16.2 said two at most.
  - Its lines are balanced, so no word stands alone on the second. More follows the last line, and the dot leads the first.
  - After a power cut it is short: "Power on again since 20 January, if the lander survived the night; battery 40 %." ("without power" when the battery ran down with the Sun up). The headline and the flags give the stretch's length. The final review found the long form five lines tall on a phone.
  - On a phone the site's name is on the facing chip under the status ("de Gerlache Rim 2, facing north-west"), as the status leaves it out.
  - On a phone the status plate sits tighter, so its longest state (four lines at 390 px) leaves the scene 55 % of the screen. At 360 × 800 that state takes five lines and leaves 50 %, a size outside 15.1's measurements.
- **The measurements** (16.5) were taken on the final build at 1440 × 900, 1024 × 768, 960 × 600, 820 × 1180, 390 × 844 and 360 × 800, the stand view at hours 10, 219, 500 and 600 and with More open: no sideways scroll, no text under 13 px or 4.5:1, More always reachable, and the card never under the row. The phone's scene band is 60 % by day, 58 % at night and 55 % after the power comes back.
- **The row** sits at the top right from 1280 px wide, and above the time bar below that, as on a phone. The final review found it over the status line and its More from 768 px to about 1070 px. Today's card takes the status line's measured height off the room it may fill.
- **Words.**
  - The row reads "Turn to: Sun, Earth, Lander", since both readers took "Face" for a noun.
  - Its hide button reads "Hide the words", its accessible name, as speech input needs (WCAG 2.5.3).
  - What to watch next starts "Press Play or a moment on the time bar:", since neither reader took the moments for "flags".
- **The plates, the sky's names, the facing chip and the compass strip are opaque.** No path or level line shows through them. 15.1's plates were 92 %.
- **The opening.**
  - At night on Earth it is 44° high (56° on a tall screen), so Earth and the lander's feet both fit. Part A's 36° (50°) cut the lander off.
  - Looking down for the lander's feet stops where what the view opens on (Earth at night, else the Sun) would come within 100 px of the status line, room for its name over it.
- **The lander.**
  - Its parts carry their names only when the view is zoomed in on it, with it within 10° of the view's middle; the night opening is zoomed in on Earth beside it.
  - Its own name is never hidden by the lander: standing up a slope from you, the label was tested against the lander's own box.
- **Labels.**
  - The days on a body's path keep its label's room: the label grown 120 px to either side and 24 px above and below. With 24 px all round, "Earth sets, 23 Jan" still stood 26 px beside a rising Earth. The path's own name keeps 24 px all round; with 120 px it was lost whenever the view faced its body (the final review).
  - A pointer keeps off the body under a name, not only the name: on a phone, Earth's pointer had covered the Sun.
- **Compass letters** show whole while 12 px or more inside the strip's ends, else not at all, with a 150 ms fade as they cross. 16.3's fade over 40 px left a faint "N" that neither reader could read.
- **At night under a thin crescent Earth** (under a quarter of its disc lit), the caption says "A thin crescent Earth gives this ground little light; brightened like a long exposure.", where the ground looks grey rather than blue.
- **The arrival's labels move clear of the beats' cards** rather than pass under them:
  - the night's name and the pointers move above or below a card;
  - the pole's name takes another side;
  - the rest give way while a card covers them.

  Under the cards (16.4) they showed through as ghost text, half hidden. The answer's last card keeps no plate mark, so labels give way to it, as before.
- **The Sun's path at night** is unchanged: Guides is off when the view opens, and with Guides on the path is the month's, as its name says.

### 16.7 D1: the blind read

Two fresh readers, a hackathon judge and a secondary-school science teacher, judged 31 still screenshots:
- the arrival at quarter screens, wide and on a phone;
- the stand view as it opens at six hours of the hero month;
- the stand view with More, Guides and Lander pressed;
- the stand view on a phone.

The scores are in the order purpose, next step, look, room and readability, then immersion after the semicolon. The gate is as in 13.2.

| Read | Judge | Teacher | Fails on |
|---|---|---|---|
| D1 | 5, 4, 4, 3, 4; 4 | 5, 4, 4, 4, 4; 4 | none |

**Ruling.** Read D1 met the whole gate for both readers. As parts B and C did after a passing read, one bounded pass followed, without a further read. It took what both readers named that was clear, small and in D1's scope: the changes of 16.6 marked as words, the opaque plates, the night opening, the pointers, the compass letters, the thin crescent, the phone's site name and the arrival's labels.

Both readers' other shared asks:
- **To the user, with D2:** bring the next step out of More, the judge's one change: the site, a way to change site or date, the better day and Compare, always in view.
- **To a words pass over every page:** "above the horizon" at night, where the hills look like the horizon. "Above the horizon" is the one name part C set across the shadow map, Explore and the stand view.
- **To D2:** the smeared descent, the square patch round the site and the box rock.
- **To the deferred list:**
  - Skip on a phone's card;
  - the slider on the first moment's dot;
  - unnamed paths in some views.

Cost if wrong: D1 ships with its next step one tap away, under More.

## 17. Amendment: Part D2, the scenes' look (6 October 2026)

D2 takes what D1 left for the scenes (16.1, 16.7): the descent's middle, smeared, with a sharp square round the site; the box rock; the plain lander; the night ground. It also brings the next step out of More, the one change the judge of read D1 asked for, which I put to the user with D2. The user's go for D2 ("continue and run", 6 October 2026) came after that question; the mockup (`d2-mockup`, published as a private page the same day) shows the row, and the user can still take it back.

### 17.1 The next step in view

- From 768 px wide, the status plate has a second row, always shown under the status line:
  - the better landing day as the screen's one gold action, shortened to "Try 20 January instead: power for 12 days 15 hours" (today's card keeps the radio part);
  - else "Compare sites" in gold;
  - then "Change site" (the site list), "Change date" (the forecast for this site and period, where the dates are set) and "Compare sites" when it is not the gold one.
- "Compare sites" adds the site to the comparison first, as Explore's does.
- From 768 px, today's card leaves out its better-day button and "Back to the forecast", which the row now holds, so the screen keeps one gold action.
- On a phone the row stays in today's card under More, as in D1, so the scene keeps 55 % of the screen (16.5).

### 17.2 The descent: sharp ground, no square

- **A flight level.** For the arrival's site only, a fourth level of measured ground: NASA's 240 m heights (`ldem_60s_240m`, which the cap takes by 4) at full resolution, 1024 by 1024 cells round the site (±123 km). The pipeline writes it beside the window and context (`<site>.flight.u16` and `.json`, kind `flight`), and the manifest's window entry names it (`flight`, manifest version 3).
- **How it is drawn, in flight only.**
  - A mesh at every other cell (480 m), between the 80 m context and the cap. Its light comes from slopes taken per pixel from its 240 m heights, not from the mesh, so the relief is as sharp as the data.
  - Each mesh reads its own three height slots: its own level, the next one, and the cap last, so far hills always shade it. The window keeps (window, context, cap); in flight the context reads (context, flight level, cap), the flight level (flight level, cap). The shader keeps three slots.
  - The cap draws from where the flight level ends.
  - The stand view does not load the flight level, and the shadow rule's twin in TypeScript never reads it, so the engine's agreement (712 of 720 hours) does not change.
- **No square.** Every level's edge is round, two of its cells inside its mesh's nearest side. Over the quarter of its reach inside that cut, its light and its shadows fade into the next level's, so neither the 20 m window, the 80 m context nor the flight level shows an edge from the air:
  - the light: the next level's slope, taken from its heights as its own mesh softens them, mixed in;
  - the shadows: one march reads both levels, from each level's own ground under the point, and the two are mixed.
  The next level leaves out a round hole a cell inside the finer one's cut, so the two overlap by a cell.
- **Without the flight file** (an old data mirror, or R2 before its next upload), the arrival draws as before, with round, faded edges.

### 17.3 Rocks as stones

- Each boulder is cut by 9 to 14 fracture planes in random directions, none near another's direction or its opposite, so no outline is a rectangle from any side.
- Its corners are drawn in a little towards a rounded shape, and its faces bend in low ripples, so no edge runs straight.
- It lies bedded a third to a half of its height, a shade lighter than the dust (fresh rock), with its patchy surface as before.
- Its shadow on the ground still comes from a sphere under its top, as before.

### 17.4 A finer lander

- Its size, footprint and shadow stay; parts whose shadow would be larger than about 10 cm cast it from the shadow shape, so the shadow still matches what is drawn.
- It gains the parts a real one has:
  - legs braced by two side struts each, on dish-shaped feet;
  - thruster pods at four corners;
  - tanks under the body, between the legs;
  - boxes of several sizes, a star tracker and an omni antenna on the deck;
  - a radiator with louvres, and a framed solar panel with a brace.
- Its foil comes in gold, silver and black panels, creased in its relief, so a sunlit facet breaks into creases instead of one glowing strip. No part but the lit power light is brighter than the bloom's threshold.

### 17.5 The night ground has shape

- With neither the Sun nor Earth up, the light stands for the starry sky, still brightened like a long exposure:
  - each point of the ground is lit by how much sky it sees: by its slope, and by the drawn craters round it, so bowls sit darker than their rims;
  - the rocks and the lander are lit from above, their tops lighter than their sides.
- The night's overall brightness stays as it is, and so does the caption.

### 17.6 D2: done when

- Every rule above has a test that failed first.
- The stand view's frames at the six sizes of 16.6 pass the measurements of 15.1, More stays reachable, and the phone's scene band stays at least 55 % of the screen (60, 58 and 55 % in D1).
- The arrival keeps its frame rate on the development laptop: once the flight level has loaded, the median frame and the 95th percentile under 50 ms while the page scrolls through the descent.
- A blind read of the arrival and the stand view by the same two readers' roles passes the gate of 13.2.

### 17.7 D2 as built: where it differs from 17.1 to 17.5

D2 was built on `feat/immersive-d2`; its ledger is beside its plan, at `docs/superpowers/plans/2026-10-06-immersive-d2-scenes.ledger.md`, with every ruling and what it costs if wrong. A prototype of the stones, the lander and the night light was rendered first in a scratch copy of the scene (its notes carry every number) and the mockup went to the user with the descent's before-and-after, the row and those stills (`.playwright-mcp/mock_d2/`). Where the build differs from 17.1 to 17.5:

- **The next step (17.1).** The row sits 40 px in from the plate's left edge, under the status words, as the approved mockup's source has it. From 768 px today's card leaves out its own better-day button and "Back to the forecast", which the row holds, so the screen keeps one gold action. The user's go ("continue and run") answered the report that proposed the row; the mockup invited a veto.
- **The flight level (17.2).** The pipeline writes it for the arrival's site only (`FLIGHT_SITES`), 1024 by 1024 cells of 240 m (1.9 MB zlib), and the manifest's window entry names it (version 3). The web keeps it apart from the shadow levels (`TerrainField.flight`), so the shadow rule's twin in TypeScript never reads it. In flight it draws at every other cell (480 m) with its light from per-pixel slopes of its 240 m heights, between the context and the cap; each mesh reads three height slots of its own (its level, the next, the cap last), so the window keeps (window, context, cap) and the stand view is unchanged. A mesh with nothing to fade into carries an edge far out (1e9, 2e9, 3e9 m), as GLSL's smoothstep is undefined with equal edges.
- **Stones (17.3).** The 9 to 14 main planes keep 24° apart and 20.6° from any opposite; the planes that close the solid do not, so about a fifth of the stones carry one face pair near parallel (as near as 0.3°), and a block can reach 15 planes. Each stone is bedded a third to a half of its height measured along its own height; a long tilted slab reads 0.18 measured upright. The old pins on the look were re-pinned: the top 0.45 to 0.85 of the stone's height above the ground, faces mostly flat with low swells, edges rounded a little, bumps cancelling within 0.15. Fourteen stones take about 0.45 s to build, twice the old blocks.
- **The lander (17.4).** 135 meshes (30 before). The tanks under the body shade the ground 12 m out at a 2° Sun, so the shadow's test moved its lit point to 10 m. The gold foil's roughness is 0.5, the floor part A set after two readers took a glint for the power light. The body stays an eight-sided cylinder drawing its dark underside; each dish foot has a flat top within its height. The dust's fill in the lander's shade is 3 by day and 1 at night, wired to the hour.
- **The night light (17.5).** The gain is 1.09, which brings the mean brightness back to the flat light's (1.15 overshot by 5 %), written beside the base colour. The six night samples share one loop with the slope's three, so the shader writes the crater field out once more at most; a drawn stone's own height counts against all six. The hemisphere fill is 1.6 times the old flat fill at the top.
- **After read D2's pass and the final review.** The headline stands on the status plate from 768 px, between the status line and the next step, and today's card leaves it to the plate there (both readers of read D2: the better day had nothing to compare against). The stones' kinds are 65 % blocks, 15 % lumps and 20 % slabs, the lumps' edges rounded over 0.07 of their size, not the prototype's 30 % and 0.12 (both took the night's lumps for pillows). On a phone Skip sits at the top right, under the date bar once landed. The next level's shadow march in a ring runs at that level's own steps, from its first step at the same growth, so the margin at the cut is the one its mesh works out for itself; the flight level's ray starts on its 240 m heights, which its mesh at every other cell can miss by tens of metres at a crater's rim. The window's third slot in flight is the cap, not the flight level: three slots a mesh, so its faded shadows beyond 20 km read 960 m heights where the context's read 240 m. The rings' second shadow march, the next level's, runs only within 5 km of the ground: from the air the rings fill much of the view and the second march made the flight stutter (the arrival's frames fell from 584 to 406 in a 14 s scroll on the laptop's Intel UHD 620, the 95th percentile frame from 50 to 234 ms); in flight each mesh keeps its own shadows at the cuts, where the handoff is a pixel or two.
- **Measured on the final build** (headless Chrome on the laptop's Intel UHD 620, through a CDP driver, as the Playwright server was down), after the pass and the final review's fixes: the stand view at 1440 × 900, 1279 × 800, 1024 × 768, 960 × 600, 768 × 1024, 390 × 844 and 360 × 800, by day (hour 10) and after the power comes back (hour 600), with More open at 1279, 960 and 390, with Earth turned to at night: no sideways scroll, no text under 13 px or 4.5:1, More always reachable, the next-step row never on More, the Turn to row or the open card; the status plate 132 px tall by day and 152 after the power comes back at 1440 (176 and 196 at 768); the phone's scene band 60 % by day at 390 × 844 and 55 % at 360 × 800, 50 % at 360 × 800 after the power comes back (as in D1); 768 × 1024 keeps 54 to 56 %. No line shows at a level's ring from the ground, by a 2° Sun or at night. The arrival's labels show over contiguous runs of quarter screens: none blinks; on a phone Skip sits clear of the beats' cards and under the date bar once landed. Without the flight file the arrival flies and lands as in D1. Cold loads of the stand view take 53 to 64 s on this laptop (the D1 build 46 to 50 s), warm loads 15 to 36 s.

### 17.8 D2: the blind reads

Two fresh readers, a hackathon judge and a secondary-school science teacher, judged 30 still screenshots: the arrival at quarter screens, wide and on a phone; the stand view as it opens at five hours of the hero month, with More and Lander pressed, by day and at night, at 1440 × 900, 1024 × 768, 820 × 1180 and 390 × 844. The scores are in the order purpose, next step, look, room and readability, then immersion after the semicolon. The gate is as in 13.2.

| Read | Judge | Teacher | Fails on |
|---|---|---|---|
| D2 | 4, 4, 4, 3, 4; 3 | 4, 3, 4, 4, 3; 4 | immersion (judge), next step (teacher) |
| D2-2 | 5, 4, 4, 3, 4; 3 | 4, 4, 4, 3, 4; 3 | immersion (both) |

Between the reads, one bounded pass on what both readers named: the headline on the status plate from 768 px, between the status line and the next step, so the better day has its comparison (both readers' first change); fewer and less rounded stones (both took the night's lumps for pillows); a phone's Skip button at the top right, clear of the beats' cards.

**Ruling.** D2 closes on read D2-2, as parts A and B closed: purpose, next step, look, room and readability pass for both readers; immersion is 3 from both. What both name for immersion lies beyond D2's asks of 15.3, which the build delivers and tests (the descent sharp from NASA's 240 m heights with no square, rocks as stones, a finer lander, the night ground with shape): the daytime ground's drawn blotches, the near boulder's look under the night light, the night's brightness under the long-exposure rule of 16.3, and the far hills out of the opening frame. Cost if wrong: the judges score presentation on a scene both readers still call a game.

### 17.9 Asks carried to part D3

From the reads of D2, for a later part:

- **The scene.** Far hills and the hill that hides the Sun in the opening frame (18 opens on a tilted slope); the daytime ground's drawn blotches read as noise, not rocks; a near stone under the night light reads as a loaf (a key light at night, or facets kept in the hemisphere's light); the night nearly as bright as day, so the 16 days without power do not feel dark (the long-exposure boost as a switch); the lander's shadow reads as a seam; the fly-down's black half over two and a half screens, and its length. The arrival's frame times on a weak graphics chip: on the laptop's Intel UHD 620 the fly-down's 95th-percentile frame is 200 ms against the D1 build's 50 ms (the flight level's longer marches, its per-pixel light, the round cuts' overdraw); profile it on the demo laptop, and if it stutters there, draw the flight level at every fourth cell or start its march a cell later.
- **Words.** "radio, if it survives the night", "brightened like a long exposure", "Sun behind a hill, 1.6° above the horizon", UTC and the degree figures, "Back to the forecast", "Press Play or a moment on the time bar", the compass's three dots, what Guides and Look up do, "it looks small only because it is far", "a browser of landing sites", the intro's one long sentence.
- **The pages.** The tablet's time-bar flags collide and read out of order (27); the status plate widens at night and More moves (23 to 25); the time bar cuts the lander's legs (24); Skip over a phone's first-screen words (12); the phone's verdict under More (28); the desktop's better-day button without the radio part the phone's keeps; the compass and the caption as one strip; a brighter setting for projectors; "your own lander" promised on the home page and not found.


## 18. Amendment: Part D3, the words, the pages and the scene (6 October 2026)

D3 takes the asks of 17.9, which the two blind readers of part D2 named. The user said "go for D3" on 6 October 2026, after D2's report; a mockup of the page changes went to the user with this section, as D1's and D2's did.

### 18.1 Three groups

- **The words**, across the stand view, the arrival and the time bar: the puzzling phrases explained where they appear, or dropped, and one plain name for each thing.
- **The pages**: the verdict on every screen, with the radio on the desktop's button and the better day on a phone's first screen; a status plate that keeps its width; the caption, the compass and its dots' names in one plate; the tablet's flags in order; the lander's feet clear of the time bar; Skip clear of a phone's first words; a brighter picture for projectors; the visitor's own lander reached from the stand view.
- **The scene**: the arrival's frame rate back to the D1 build's, a key light at night so the stones keep their facets, the daytime ground's blotches toned down, and the far hills in the opening frame.

Weighed and set aside, with the reason:

- A darker night with the brightening as a switch (the judge of read D2-2) against a brighter picture for projectors (the teacher): the night keeps the brightness 16.3 set, so the stones and the lander show, and the one control added is "Brighter picture" for projectors and bright rooms.
- A shorter fly-down and its black half (the judge): part B's reads settled the fly-down's length and its opening in black space.
- The lander's shadow as a seam: no still of D2's reads shows it, and the shadow is drawn as 16.4 set it; it waits for a still that shows it.

### 18.2 The words

- **"radio, if it survives the night"** (the time bar's key) becomes **"radio, if the lander survives the cold"**: the forecast counts energy only, and the cold is what the lander must live through.
- **"brightened like a long exposure"** goes from every line. The lines read "the picture is brightened so you can see it": the caption at an hour with neither the Sun nor Earth up, "Neither the Sun nor Earth lights this ground; the picture is brightened so you can see it. No air, no twilight."; with Earth up, "Earthlight, sunlight bounced off Earth, lights this ground and tints it blue; the picture is brightened so you can see it."; with a thin crescent Earth, "A thin crescent Earth gives this ground little light; the picture is brightened so you can see it."; and the battery's flag at night, "The battery runs out at night. Only Earthlight lights the ground here; the picture is brightened so you can see it." and "The battery runs out at night. With no Sun or Earth in sight, the picture is brightened so you can see it." The arrival's date bar keeps "night (picture brightened)".
- **"Sun behind a hill, 1.6° above the horizon"** becomes **"Sun behind a hill to the north-west, 1.6° up"**: the hill is named by its direction, as the ground panel names it, and "up" replaces "above the horizon", which at night reads as the skyline (both readers of read D2). On the horizon behind a hill: "Sun behind a hill to the north-west, on the horizon". The pointers keep "below the horizon" for a body under the level horizon, and a phone's short pointer keeps "Sun 1.6° up". The same words on the forecast page's ground panel.
- **The degree figures** keep their degrees, and the card's line on the pole says what a few degrees look like: "near the pole the Sun never climbs more than a few degrees (two degrees is about a thumb's width at arm's length)".
- **"Back to the forecast"** (a phone's card) becomes **"Open the full forecast"**: the forecast page is where the visitor goes, not where they came from when the arrival brought them.
- **"Press Play or a moment on the time bar:"** becomes **"Press Play, or a flag on the time bar, to watch:"**, and on a phone, where the moments are dots, **"Press Play, or a dot on the time bar, to watch:"**.
- **"Guides"** becomes **"Paths"**: the button shows the month's paths of the Sun and Earth with their days, the level horizon, the star names and your shadow; "Paths" names what a visitor sees first. "Look up" stays.
- **The compass's dots** are named where they sit (18.3): "Sun", "Earth", "lander", each by its dot.
- **"it looks small only because it is far"** (the arrival's Earth label) becomes **"small because it is far"**: "Earth, 394,000 km away on 1 January 2027: small because it is far".
- **"a browser of landing sites and dates"** (the arrival's first screen) becomes **"a forecast for landing sites and dates"**, and the intro's one long sentence becomes three: "Earthrise is a forecast for landing sites and dates. Pick a place and a day from 2024 to 2036. See its hours of sunlight and of radio contact with Earth, and how long a lander keeps power, for three ready-made landers or your own."
- **"this ridge"** in the arrival's words at the site names it: "de Gerlache Rim 2, this ridge".

### 18.3 The pages

- **The verdict on every screen.** From 768 px the gold button in the row under the status line carries the radio as today's card's does: "Try 20 January instead: power for 12 days 15 hours, radio for 3 days 5 hours" (17.1 gave the row the power alone). The headline above it stays as 16.2 set it. On a phone the better day sits on the first screen: one gold chip under the status plate, "Try 20 Jan instead: power for 12 days 15 hours ›", a link to that landing, 14 px type, 32 px tall, 6 px under the plate; today's card keeps its long form and the headline. The scene band of 16.5 is measured from the chip's foot and stays at least 55 % of the screen.
- **The status plate keeps its width.** From 768 px the plate takes its full width (the width beside the row from 1280 px, 860 px at most) at every hour, so More stays where it is as the night's words come and go; on a phone it is full width already.
- **One plate at the foot of the view.** From 768 px the caption (why a key moment happens, what looking up shows) sits in the compass's plate, above the compass, and under "Facing north, downhill" a line names the dots: a gold dot "Sun", a blue dot "Earth", a white dot "lander", 14 px. The plate is 460 px wide at most and the compass stays 300 px wide in its middle. On a phone, which has no compass, the caption keeps its own plate above the buttons.
- **The tablet's flags.** The time bar lays its flags out by their measured widths, not a guess from their letters, in up to three rows: the layout with no two flags over each other in a row and no stem down behind another flag's words, and of those the one with the fewest rows; the second row 22 px above the first, the third 22 px above that, each stem down to the track. When no layout in three rows is clean, the one with the fewest crossings. "Sunrise, 20 Jan" keeps its name at 768 px (read D2's frame 27 showed it as "20 Jan").
- **The lander's feet clear of the time bar.** The night opening on Earth of 16.3 keeps the lander's feet above the time bar and the row of buttons at every screen shape: the pitch is set from the view's height less the bar's and the row's, measured, not from a fixed 44° or 56°.
- **Skip** on a phone shows from the second screen on, never over the first screen's words.
- **Brighter picture.** A toggle in today's card (`aria-pressed`), "Brighter picture", doubles the camera's exposure for projectors and bright rooms, and is kept for the visit (session storage). Its words never change with its state.
- **"Your own lander."** "Change lander" joins the next step's links from 768 px, and a phone's card, and opens the forecast page's lander dialog in place: the lander chosen there changes the stand view's verdict without leaving the scene.

### 18.4 The scene

- **The frame rate.** The arrival's scroll keeps the D1 build's frame times on the laptop's Intel UHD 620, the 95th-percentile frame under 50 ms from quarter screen 2 to 8: the fix is the measured one among the flight level drawn at every fourth cell, its shadow march starting later, and whatever profiling finds.
- **A key light at night.** A faint directional light from 50° up and 90° round from the Sun's last azimuth lights the rocks and the lander at night beside the hemisphere's light, about a third of its strength, so the stones' facets show and none reads as a loaf; by day it is off.
- **The daytime ground's blotches.** The drawn patches of lighter and darker dust near the eye, about 5 m across, are halved in strength, so the ground reads as dust with stones on it, not noise.
- **The far hills in the opening frame.** The opening yaw turns up to 30° towards the skyline's highest point within that span, so a hill stands in the opening frame beside the lander where the terrain has one; the lander keeps its place against the Sun or Earth as 16.3 set it.

### 18.5 D3: done when

- Every rule above has a test that failed first.
- The stand view's frames at the sizes of 17.7 pass the measurements of 15.1; the phone's scene band stays at least 55 %.
- The arrival's frame times on the development laptop: the 95th-percentile frame under 50 ms through the descent.
- A blind read of the arrival and the stand view by the same two readers' roles passes the gate of 13.2.

### 18.6 D3 as built: where it differs from 18.2 to 18.4

D3 was built on `feat/immersive-d3`. Its ledger is beside its plan, at `docs/superpowers/plans/2026-10-06-immersive-d3-words-pages-scene.ledger.md`, with every ruling and what it costs if wrong. Where the build differs from 18.2 to 18.4, and what the checks measured:

- **The words.**
  - The Earthlight caption reads "Earthlight, sunlight bounced off Earth, tints this ground blue; the picture is brightened so you can see it." (108 characters), and the battery's flag at night with Earth up "The battery runs out at night. Only Earthlight lights the ground; the picture is brightened so you can see it." (110): 18.2's wordings ran to 122 and 115 characters, past the captions' limit of 112 (two lines on a wide screen).
  - The forecast page's ground panel keeps "the Sun is 1.6° above the horizon, but behind a hill to the west": in a full sentence with "but behind a hill" the phrase cannot read as the skyline, and the panel already named the hill's direction. The shadow map's labels say "Sun behind a hill, 2.4° up" without a direction: the map shows where.
  - The hill's direction on the stand view's labels is the ground panel's own eight-point word ("north-west"), so the label and the panel agree at every hidden hour (a test on a March month pins it).
  - The line on what to watch is rendered twice, whole, one copy shown per width ("…or a flag…" from 640 px, "…or a dot…" below), with no hidden copy for screen readers: display: none keeps the unshown one out of the accessibility tree. The time bar's hatched key does the same on a phone, where "radio, if the lander survives the cold" wrapped onto a third line and took 20 px from the scene: below 640 px it reads "radio if it survives the cold" (the final review kept "the cold", which is what the words are for).
- **The pages.**
  - The compass plate is 79 px tall (the compass 32, the facing line 24, the key 22, its bottom edge 1), so the caption's plate ends 93 px above the time bar, not 92; the two are two elements that read as one plate (the caption's bottom edge and corners dropped; the compass plate's top edge and corners dropped only while a caption sits on it, through a `docked` prop), and the compass plate is as wide as the caption's (460 px at most) at all times, so nothing jumps when a caption comes. Measured: a 0 px gap and equal widths at 1440, 1024 and 820 px.
  - The phone's chip sits 8 px under the status plate (the section's gap), 32 px tall at 14 px, inside the answer's section, so the view's measured top takes it in; its address keeps the better day's hour as the row's link does. The scene band by day: 55.5 % at 390 × 844, 50.1 % at 360 × 800 (D2: 60 % and 55 %): on the smallest phones the chip costs five points, accepted, as the readers' ask was the verdict on the first screen and D2 accepted 50 % there at night. At 768 × 1024 the band is 52 to 54 %, at 1024 × 768 44 % (D2: 50 %), as the row's links wrap under the longer gold button.
  - "Brighter picture" lives in today's card (More), not in the row: from 1280 px the row beside the plate has no room for a seventh button without narrowing the plate under the row's gold button. The renderer's `setBright` doubles the exposure through `toneExposure`, a pure rule the tests pin, as a `StandRenderer` needs WebGL 2 to build.
  - "Change lander" is a button in the row from 768 px and in a phone's card; it opens the forecast page's lander dialog (`LanderDialog`) over the view (900 × 528 at 1440 px, 358 × 714 on a phone), the store recomputes the power, and the focus returns to the button that opened it on Done. The new lander's scene is swapped into the renderer the view has (`setScene`, as the arrival's ground is), not drawn by a new one: the final review found each change rebuilding the renderer, its context and its programs, seconds on the laptop and on every valid keystroke in the custom fields.
  - The flags' third row: the layout is searched over every way of giving up to nine flags three rows (3^n, at most 19,683 layouts), a stem down behind another flag's words counting as 60 px of overlap when no clean layout exists; beyond nine flags the greedy rows of part A take over. The flags are measured after they render and again once the fonts arrive; in tests (no layout) the guess from the letters holds. Measured: no two flags over each other and no stem behind words at any of the seven sizes, three rows at 960, 820 and 768 px.
  - After Turn to Lander the view fits the lander's feet above the bar as the opening does, until the view is turned by hand (`LookTarget.fit`): 18.3's "measured, not a fixed 44° or 56°" was already how the opening worked (`fitPitch` reads the bar's and the row's boxes); what cut the legs was the turn to the lander, which did not fit them.
  - The status plate: 805 px wide beside the row at 1440 px and 860 px below 1280, 176 px tall by day and 196 at night at every hour (D2: 132 and 152, a width that followed the words), the row's links on a second line under the longer gold button.
- **The scene.**
  - The frame rate: the plan's two candidates (the flight mesh at every fourth cell; its march starting four cells out) were not the cost on their own (95th-percentile frames of 234 and 267 to 317 ms). A prototype traced the stutter to sub-pixel triangles under 4× MSAA: from the air the flight level's 480 m cells are a fifth to a half of a pixel, and with four samples a pixel the ground's long shader ran several times a pixel. The fix, in four parts: the flight mesh at 960 m cells (its light and shadows still from the 240 m heights per pixel); above 5 km, the fast setting's march and moving frames without MSAA (`aloft()`; a view at rest keeps its sharp frame with MSAA, so every still is as before); a moving frame's pixel ratio paced by the frames' times (`RatioPacer`: lowered by `movingRatio` of their mean after three slow frames in a row, aim 40 ms, floor 0.45, and raised a tenth after thirty fast frames in a row, up to the full ratio; the prototype's rule dropped on one slow frame and never rose again, which the final review found would leave a visit soft after one hitch); and the shaders compiled with the composer's read buffer bound, which took the first visit's 15 to 28 s freeze away (every program had been built again on its first draw). Measured on the final build at 1440 × 900 on the laptop's Intel UHD 620: 95th-percentile frame 16.9 and 17.0 ms, 821 and 823 frames in 14 s, worst frame 134 ms, 4 frames over 50 ms in each run (D2: 200 to 234 ms, 406 to 423 frames, 25 to 29 over 50 ms; D1: 50 ms, 584 frames, 30 over 50 ms). Cold loads of the stand view 34 to 38 s (D2: 53 to 64). While the page scrolls aloft the far skyline stair-steps about 2 px at ratio 0.45 without MSAA; the sharp frame replaces it 0.3 s after the scroll stops.
  - The key light is `NIGHT.KEY` = 0.55 against the sky fill's 1.6 (0.34 of it; 0.19 at full night, as the prototype measured it), from 50° up and 90° round from the Sun's azimuth, aimed at the site; the measured ground takes nothing from it (its shader lights itself). In the prototype's stills the stones' mean rose from 22 to 28 levels and their faces part; they stay darker than the dust round them (28 against 37).
  - The daytime blotches: the 5 m patches are halved as 18.4 says, but the prototype's stills show no visible change (0.09 levels): at a 3° Sun the near ground is mostly in shadow, and what reads as noise is the drawn craters' shadows, black pools with lit rims at one scale. That fix goes to 18.8.
  - The opening's turn: a turn to the right moves the Sun and the lander left in the frame, so on a wide screen the view may turn right up to 30° (the lander, 5° left of the middle, bounds it) and left only 3° (the Sun, 35° right of the middle, bounds it); on a tall screen the room is smaller both ways. The hill must stand 6° inside the frame's edge to count as in view. At de Gerlache Rim 2 the turn is zero at the period's first hour and not at every hour.
- **After the read (one bounded fix pass, as 17.8's).** On a phone Skip waits until the first screen has scrolled away whole (at three quarters of a screen the intro's last lines were still under it), and the chip waits while today's card is open (the card has the better day in full); the phone's card holds Change site, Change date and Compare sites (17.1), by the names both readers looked for, in place of "Open the full forecast" (the same address as Change date); the row's gold link ends in a chevron, as the chip does, so it reads as a way on; the compass key names the hollow dot ("below the horizon"); and "Brighter picture" redraws a resting view (the frames' ground went from 27 to 38 levels of mean brightness at night).
- **The checks.** The web suite: 130 files, 1,351 tests; TypeScript and the lint clean (one old warning). The 22 stand frames at 1440 × 900, 1279 × 800, 1024 × 768, 960 × 600, 820 × 1180, 768 × 1024, 390 × 844 and 360 × 800: no text under 13 px, none under 4.5:1, no sideways scroll, no page error.

### 18.7 D3: the blind reads

Two blind reads of the production build (commit `0065529`, then `ac7b362` after one bounded fix pass), by the judge's and the teacher's roles, each over 29 frames: the arrival wide (quarter screens 0 to 10) and on a phone (3 to 8), the stand view at 1440 × 900 by day, turned to the lander, at night, on Earth, with today's card and Brighter picture, with the lander dialog, at 1024 × 768, 820 × 1180, 768 × 1024, on a phone by day and at night with More, and at 360 × 800.

- **Read D3 (judge):** purpose 5, next step 4, look 4, room 3, readability 4; immersion 3. **Teacher:** purpose 4, next step 3, look 4, room 3, readability 3; immersion 3 (read D2-2: 4, 4, 4, 3, 4; 3). Both named: Skip over the intro's last lines on a phone three quarters of a screen in; "Try 20 January" twice with More open on a phone, and the card's last line under the toolbar; Change site, Change date and Compare sites not found on a phone; the hollow Earth dot on the compass unexplained; Brighter picture showing no change; the lander dialog's presets as raw numbers with Close beside Done; the Radio dish label over the panel; "Turn to" wrapping at 360 px; the survival hedge never answered. The judge: the gold box not looking clickable; the evidence (data, resolution, the check against NASA's map, what is not modelled) nowhere near the numbers, and no way to Accuracy from the stand view; the flight's near-identical frames. The teacher: the stand view's dozen controls alike, with "Press Play" and "Drag to look around" under More; small grey and blue text for a projector; UTC, °, W, kWh, m²; "Paths" and "Look up" unexplained.
- **The fix pass** (one, bounded, as 17.8's): Skip on a phone waits until the first screen has scrolled away whole; the chip waits while today's card is open; the phone's card holds Change site, Change date and Compare sites (17.1); the row's gold link ends in a chevron, as the chip does; the compass key names the hollow dot; Brighter picture redraws a resting view.
- **Re-read D3 (judge):** purpose 4, next step 4, look 4, room 3, readability 4; **immersion 4**: the whole gate of 13.2 met, the first immersion 4 from the judge since part A ("the Sun 2.4° up, the lander 16 m away, and Earth half-hidden behind real hills with stars out really do feel like being there"). Purpose fell one point: the stand view's first line is the moment's state, not the answer, and on a phone the answer is under More. **Teacher:** purpose 4, next step 3, look 4, room 3, readability 4; immersion 3: readability up one, next step still 3 ("Press Play" and "Drag to look around" under More; the dozen controls alike).
- **Ruling:** D3 closes on the re-read, as parts A, B and D2 closed on theirs: the judge passes the whole gate, the teacher passes purpose, look, room and readability, and the teacher's next step and immersion (3 and 3) go to 18.8 with both readers' three changes. The teacher's first change (the Play and drag hints on the first screen, the top panel cut to one sentence) runs against what the readers of C1 and D1 asked for and D1 built (the Moon given the screen, the words under More), so it is the user's call, not a fix pass's. Cost if wrong: a judge who reads like the teacher scores presentation on a stand view they find busy.

### 18.8 Asks carried on

From the reads of D3, for a later part or for the user to weigh:

- **The answer first, on every screen.** Both readers want one big line with both dates and both numbers at the top of the stand view, the moment's state moved down beside the time it describes, and the same line on a phone's first screen (the chip gives the better day alone). The judge's form: "Land 1 Jan: 3 days of power, no radio. Land 20 Jan: 12 days 15 hours of power, 3 days of radio [Switch]".
- **The first step on the stand view** (the teacher, twice): "Press Play to watch the month go by · drag to look around" shown on arrival rather than under More; the top panel cut to one sentence until asked. This runs against C1's and D1's declutter: the user decides.
- **The evidence beside the numbers** (the judge, twice): a slim header on the stand view (Earthrise · How it works · Accuracy); one line on the height data and its resolution, what the forecast was checked against and how far off it can be, and what is not modelled (cell efficiency, surviving the cold, relays); exact times on the flags; the panel efficiency in the lander dialog; a survival verdict in place of "if the lander survives".
- **A projector mode** (the teacher): a brighter default picture, bigger labels, key and flags, a bolder radio stripe, and a one-click class view (the scene, the date and Play alone). "Brighter picture" doubles the exposure, measured (the night ground from 27 to 38 levels), but both readers found the change slight: the night term's tone mapping compresses it.
- **Named landers** (both): "small, medium, large" with a picture in the dialog, in place of the panel, load and battery figures alone; Close and Done as one button.
- **Words** (both): "Paths", "Look up", "More", "Hide the words" and "Skip" named for what they do; "set" in "keep them set for weeks"; "cells"; "Night here" against "Ground at night" on a phone's arrival; "radio, if the lander survives the cold" with what surviving takes; UTC.
- **The scene.** The daytime ground's noise is the drawn craters' shadows at a low Sun (the prototype's finding: fewer or softer small craters near the eye, or their shadows faded looking across the Sun); the night stones darker than the dust (28 against 37 levels); the flight's black left half over five scrolls and its near-identical frames (set aside in 18.1, named again by both); the ground smeared on a phone's last flight frames; the arrival's labels pressing on the caption card on a phone (24); the Radio dish label over the panel; the flags "Sunrise, 20 Jan" and "Earth sets, 23 Jan" touching at 1440 px; "Turn to" wrapping at 360 px; the lander's look.
- **The pages.** A guided path through the five flags as a five-step lesson (the teacher); the links' rows that change with the width; the phone's More card over the scene.

## 19. Amendment: Part E, the answer first and the way to the evidence (20 October 2026)

Part E takes from 18.8 what a judge sees in the first second and what costs least: the answer first on every screen, the first step shown once, the way to How it works and Accuracy, named landers with one Close, the words both readers named, a brighter Brighter picture, and the cheapest of the final review's deferred minors. It leaves for later, named here so they are not lost: the crater shadows and the lander's look, the flight's black half, a projector mode beyond the brighter picture, the five-step lesson, a survival verdict in place of "if the lander survives", and exact times on the flags. The first-screen hint was the user's call (18.8): taken, shown once. This part runs with one blind read at the end, by both readers, and no mockup page: its changes are words and order, and the frames at the eight sizes stand for the mockup. Before it, a small pull request made the first deployment safe (the data base read as `/data` when empty and without a trailing slash; plain words on every page whose data did not load; `?bright=1`; the hosting and demo docs).

### 19.1 The answer first

From 768 px the status plate leads with the headline (the landing's verdict, 18 px display type, two lines at most from 768 to 1440 px), then the next step's row (the better day's gold link with its radio, Change site, Change date, Change lander, Compare sites), and last the moment's state: the tone dot, the lander's power and radio for the hour, and More. The judge's "one big line with both dates and both numbers" is the headline and the gold link read together. The state "moved down beside the time it describes" sits at the plate's foot rather than in the time bar: the bar is Explore's too, a line of 60 to 90 characters beside the date wraps on a phone and at 1024 px, and More stays where every read found it. On a phone the plate's first line is the headline's short form ("1 January: power for 3 days 4 hours, no radio": the day, the power and the radio, the night left to the card), More beside it, the chip beneath as in 18.3; the moment's state is the first line of today's card. The phone's band is unchanged: the plate keeps two 15 px lines, as the state took. The page's heading for screen readers keeps the full headline.

### 19.2 The first step

On arrival the line over the view (the caption plate, docked on the compass plate from 768 px) reads "Press Play to watch the month go by · drag to look around" (under 640 px: "Press Play · drag to look around"; with reduced motion, Play being off: "Drag to look around"). It stays until the first turn by hand, the first Play, a flag, Turn to or Look up, or a key moment's caption: then it goes for the visit, and the captions take the plate as before. It does not clear on the captions' 12 s timer, shows only once the ground has drawn, and adds no plate, so the phone's band is as in 18.3. This is the judge's "the drag and Play hints shown once on arrival" and the teacher's first change, inside D1's declutter: no card regrows, nothing fades by itself, and the words sit on a plate that was there.

### 19.3 The way to the evidence

A line of links, Earthrise (the home page), How it works and Accuracy, in 14 px at the right end of the plate's last line from 768 px, and at the foot of today's card on a phone. The judge's slim header without a header: from 768 px the links share the state's line, and a phone's band grows by nothing. The evidence itself (the height data and its resolution, what was checked and how far off it can be, what is not modelled) stays on Accuracy and How it works, one click away; the card's "Standing at …: hills from NASA height data, small craters and rocks added to look real" stays.

### 19.4 The lander and the words

- The ready-made landers are named: "Small lander: 4 m² panel, uses 200 W, 2 kWh battery", Medium and Large likewise; the dialog says "All three ready-made landers use a 30 % panel"; "Cell efficiency" becomes "Panel efficiency"; Done goes, the Modal's Close being the one way out besides Escape and the backdrop. No picture: it would be a drawing of a lander the scene does not have.
- "Paths" becomes "Show paths" and "Hide paths", a button whose words say what it does, with no pressed state (a pressed toggle's words never change); a phone keeps "Paths" for the row's width. "Skip" becomes "Skip to the answer" (a phone keeps "Skip"). "keep them set for weeks" becomes "keep them out of sight for weeks", on the home page and in the arrival's words. The arrival's shortlisted sentence takes the site's name from the data. "Look up", "More" and "Hide the words" stay: their captions and their state say what they do. "Night here" is already "Ground at night" in the app; the phone stills predate the rename and are recaptured on the laptop.
- Brighter picture triples the exposure (a stop and a half) in place of doubling it; the day frame keeps its own stopping down under it, and the clipped share is measured.
- From the final review's minors: 4 px between flags, and between a stem and another flag's words; the chip is a plate (`data-plate`, `min-h-8`); the card's gold link ends in a chevron as the row's does; the opening's turn is memoised.

### 19.5 E: done when

- Every rule above has a test that failed first; the suite, `tsc`, lint (the one old warning) and the build are clean; the badge is refreshed.
- The frames at 1440 × 900, 1279 × 800, 1024 × 768, 960 × 600, 820 × 1180, 768 × 1024, 390 × 844 and 360 × 800, by day and at night, with More open, on arrival with the first step, after Play, and with `?bright=1`: no text under 13 px, no sideways scroll, no page error, no two plates over each other (the caption docked with a 0 px gap), the phone's band at least 55 % at 390 px and 50 % at 360 px by day, the plate at 1440 px no more than 12 px taller than D3's, the flags 4 px apart at every size.
- One blind read by both readers, one bounded fix pass; the gate of 13.2 is the aim, and the scores are recorded either way.

### 19.6 E as built

(Filled when the part closes: where it differs from 19.1 to 19.4, the measurements, the read, and the asks carried on.)

## 20. Amendment: Part F, fewer words, a resident, and polish (11 November 2026)

The user's three asks after part E: the visitor is flooded with text, so cut it; hide an Easter egg on the Moon for a visitor who looks around; and improve the whole project where it is safe to, three days before the event. Photorealism waits until after the event: every known gap in the scene (the crater shadows by day, the lander's look, the flight's black half) took rounds of measurement on the laptop, and this pass must not move the frame rate D3 measured (p95 17 ms). So nothing in part F touches a shader, the terrain, the shadow march or the render loop.

### 20.1 Fewer words: fold, not delete

- Each first screen keeps one short answer and one action. The reasons, the explanations and the secondary links move one tap away, behind a disclosure the page already has ("More", "Why this happens", "Show the numbers") or a new one that works the same way (a button whose words say what it does, `aria-expanded`, the content in the page's order once open). No fact leaves the app: a fold moves it, a duplicate on the same screen goes.
- What the spec requires on a first screen stays: the answer first (19.1), the better day's gold action (18.3), the first step on arrival (19.2), the way to the evidence (19.3).
- A test caps the words each first screen shows before a tap, page by page, so the text cannot creep back.
- The stand view's next step, from 768 px: the links after the gold one (Change site, Change date, Change lander, Compare sites) become one "Change ▾" that opens them in a small plate under it, the judge's ask of 18.8 for one menu for site, date, lander and compare. This replaces the row of links of 17.1, 18.3 and 19.1; the gold link stays where it is, and a phone's card keeps its links. In today's card the line on what to watch and the help line wait until the first step has gone, as they repeat it, and with reduced motion the line on what to watch does not offer Play.

### 20.2 The resident

- A small creature with a rock for a back stands on the ground near the viewer, in a direction the opening never faces at any hour, so a visitor finds it only by turning round. When it first comes well into the view, the line over the view says so, and says what is real: like the rocks and the lander it is made up; the hills, the Sun and Earth are NASA data.
- It costs nothing to compile and almost nothing to draw: its shell shares a boulder's geometry and material instance (nothing uploaded, no new shader program, so no compile time), its body adds a few hundred triangles drawn with that same material, it is culled when off screen, and it adds no light, no pass and no per-frame work but the one projection that finds whether it is in view. Its shadow on the ground is one more sphere in the rocks' uniform (data, not code); if the laptop's frame probe moves, that sphere goes first.
- It never appears in the home page's arrival (the video's first 13 seconds), with `bare=1` or the capture hook, or in demo mode (`?demo=1`, the pitch's tabs): the pitch shows the forecast, and a judge who has not looked round sees nothing new.

### 20.3 Polish

The low-risk fixes the audit of the whole project found, each under two hours and test-first: listed in 20.5 as built.

### 20.4 F: done when

- Every rule above has a test that failed first; the suite, `tsc`, lint and the build are clean; the badge is refreshed.
- On the laptop: the frames of 19.5 again, the resident found at day and at night, and the arrival's and the stand view's frame times as D3's (p95 about 17 ms).

### 20.5 F as built

**Fewer words (20.1).** The words that show before a tap, at 1440 and on a phone (390), each now capped by a test:

| First screen | Before | After |
|---|---|---|
| Home (the first screen's words) | 136 / 82 | 100 / 69 |
| Explore: the answer | 152 | 107 |
| Explore: the numbers card | 73 | 38 |
| Explore: the chart above its plot | 100 | 30 |
| Explore: the ground panel | 156 | 107 |
| Sites (the heading down to the map) | 169 | 103 |
| Compare, empty | about 211 | 199 |
| Accuracy (heading, intro, verdict) | about 48 | 23 |
| How it works (the title block) | 100 | 46 |
| The stand view's plate, 1440 | 65 | 58 |

What folded, and behind what: Explore's reasons ("Why this happens", the stand view's words for the same thing), the chart's guide ("How to read the chart"), the ground panel's notes ("About this view"), Sites' method paragraph ("How these figures are counted", still one paragraph as 15.1 asks), the home band's reading guide ("How to read this"), How it works' projector tip (its question, "Showing it to a class?"). What went, as it repeated the same screen: the home page's first sentence (the flight's first and fourth lines say it), the header's tagline (the title and the home headline), the numbers card's data row (the answer's beside it), Compare's "Or add sites one by one below", How it works' second intro sentence and, on that page, the drawings' intro. What moved: Accuracy's test count to the error budget's foot, the brief's setting from under its name to its method (a move, as the brief is printed). The product sentence stays on the home page's first screen in a short form (15.1, 18.2). The stand view's links after the gold one became one "Change ▾" (20.1); today's card waits to repeat the first step until it has gone; reduced motion's lines do not offer Play.

**The resident (20.2).** Rocky stands at lander + 180° + δ (δ in [−25°, 0] from the site's seed), 8 to 10 m out, at least 56° outside the opening view at every hour and width (worst 60.1°, hour 468, a tall screen), stepped 5° at a time clear of the rocks. Its shell is `new THREE.Mesh(rock.geometry, rock.material)` of a boulder (a `rock-lump` where one exists); its body is one 260-triangle geometry with the rocks' attributes (position, normal, color), drawn with that material: two draw calls, no new program, culled, opaque, no light, no pass. Its shadow is a fifteenth rock sphere (`RESIDENT_SHADOW`, the first thing to drop if the frame probe moves). The line over the view, once it stands well inside the view, is "You found Rocky, the only animal here, made up like the rocks. The hills, Sun and Earth are NASA data." (102 characters), once a visit, and it waits while another caption shows (the "Sunrise, 20 Jan" flag turns the view to within 5° of it on a wide screen). It is never built in the arrival, in demo mode or with `bright=1`.

**Polish (20.3).** The forecast store: `/explore#ask` lands on the assistant once Explore has loaded; a period past the Sun and Earth table keeps the figures and says so in a plain sentence, the date box's latest start following the period and a year typed digit by digit kept as a draft; Explore's data loads once and in pairs; a clicked site's address opens it again. Accuracy's live re-check says in plain words why it could not run and that the stored comparison stands. The home page's forecast links carry their start and days. Compare's remove column has a name; the brief is a `main` with its way back in every state; the words follow the focus when they hide and show. A part that loads on its own (the arrival's stage, Explore's 3D tab) shows its fallback when its code fails to load (`ChunkBoundary`). The lint warning and the dead modules (`verdict`, `timeline`, `dome`) are gone; two timing tests have room. The pitch, the checklist, the storyboard, the READMEs and the submission match the app.

**Left for the laptop (20.4)** and for after the event: the frames of 19.5 with the folds and the one Change; Rocky's look, scale, eyes and shadow by day and at night, with `renderer.info.programs.length` unchanged; the frame probe (p95 about 17 ms); the stand view's blind read of part E. Photorealism (the crater shadows, the lander's look, the flight's black half) after the event.

## 21. Amendment: Part G, an easier player and a better Rocky (12 November 2026)

The user's asks two days before the event: the player (the time bar) more intuitive and less clunky, as it has too much on it, is hard to scrub, does not say what to do, and has no speed for Play; and Rocky better designed: cuter, easier to spot, more alien, and doing something when found. Nothing here may cost frame time at rest or build a shader program.

### 21.1 The player

A critique of the bar in use (the production build driven at 1440, 768 and 390 px with touch) found: Play slow and fixed (a month in 60 s, 33 s of it one night), a moment's line gone in 0.74 s, Play fighting the hand (it ran on while the track was held), the phone's "Next" chip a label that sent taps to the dots under it, a 32 px slider over a 47 px box whose lanes took no presses and no time shown under the pointer, a bar of 163 px and 54 words at 1440 (five boxed flags in two rows, three at 768), no key to a moment, nothing at the end. So:

- **Speed.** Play moves a day a second (`PLAY_HPS` 24: still 12 steps a second, 2 hours a step), with a speed button beside it that cycles 1×, 2× and 4×; off, with Play, under reduced motion. The view glides between steps at 7/6 of Play's pace (`glideStep`), so the light moves smoothly at any speed.
- **Holds.** No step jumps a moment: Play lands on each moment's hour and holds there (2.5 s on the stand view, 1 s on Explore), so its line can be read.
- **Play follows the story.** On the stand view each moment Play holds on turns the view to what it is about, as its dot does, until the visitor turns the view by hand or with Turn to or Look up; the next Play follows again.
- **Play gives way to the hand.** A press on the track, a dot or Next, or a key on the slider pauses Play. Space plays and pauses (on the stand view from anywhere but a button, a link, a field or a dialog). At the end Play reads "Replay" and starts again from the first hour.
- **One primary control.** Play has the ink fill and one width for Play, Pause and Replay; it keeps its word on a phone.
- **Next.** A button beside Play names the next moment ("Next: Sunset, 3 Jan") and takes the time there; Shift with an arrow on the slider steps between moments. After the last moment there is none.
- **Dots, not flags.** The moments are dots on the strip at every width, gold for the moment the time is on, each with a target of its own; their words move to Next, the readout and the dots' names. Explore's bar has them too, with Next.
- **One target and a readout.** The slider covers the strip and its lanes (47 px with the lanes). Under a mouse, or a finger held down, a plate over the track shows the date and hour there and, on the stand view, that hour's words from the key ("night · lander off · Earth in view"), or a dot's moment; it only previews. On Explore the date, the sentence and the chart's time line follow it.
- **On a phone the key folds** behind "Key ▾" after the date, so the scene keeps its room; from 640 px it shows as before.
- What to watch, in today's card, names the bar's two buttons: "Press Play, or Next on the time bar, to watch:" (with reduced motion, "Press Next on the time bar to see:").

This replaces 13.1's twelve hours a second and flags, 13.3 and 15.1's keys with no Key button on a phone, 15.1's 32 px slider, 18.3's flags in up to three rows, the phone chip that was a label, and plan B's rule that Play shows a moment's line without turning the view.

**As built.** Next keeps the width of the period's longest moment, its words centred, and the date that of its widest, so nothing beside them moves as the time does (sizers drawn by the stylesheet, so the page's words hold each name once); after the last moment its place stays, empty. On a phone Next starts a row of its own under Play with "Key ▾" at its end, in the room the three lines of keys took. The stand view's bar drops the chart's inset at every width (no chart above it); on Explore's phone the inset stays with the track alone, under the chart's plot, so the date keeps one line. Measured in the built app: the stand view's bar is 163 px at 1440 with 41 words (163 px and 54 words before), 203 px at 768 (227) and 203 px on a phone with 19 words (204 px, 49 words); Explore's is 124 px at 1440 (80) and 205 px on a phone (142), the cost of Next and the dots there. Explore's sentence can still take a second line at hours whose words are long, as before.

### 21.2 Rocky, redesigned

- A small moon tortoise. Its shell is a dome made as the rocks are (`rockDome`: a round top over a shallow belly, slow swells so it is a stone and not a ball, the rocks' patches and bumps), drawn in a boulder's own material, so from afar it still reads as one of them. Four stubby round feet peep out under its rim. A big, nearly round head, about half the shell's width, with two big eyes (each a third of the head's width), white with a dark pupil looking ahead and a white catchlight; two feelers from the head's top with round tips. A fifth bigger than F's: a shell 0.42 m wide, 0.30 m tall and 0.50 m long, the whole under 0.8 m long and 0.6 m tall, feelers and all.
- Easier to spot: a pale head and pale feet against the grey; eyes smoother than the rocks, so the Sun leaves a highlight, and faintly lit from within with their catchlights, so they catch the light at night too; the feelers' tips a pale sea green lit from within, more brightly; every glow under the bloom's threshold, which the Sun alone passes.
- It stands three quarters on (55° round from facing you), its head along its body and a little down, at the dust. Found, it turns its head to look at you: 1.1 s, a gentle start, about 5 % past and back, then still; at once with reduced motion; once a visit, with the line.
- Cost: no new program. Every material is a `MeshStandardMaterial` with the rocks' program settings (vertex colours, no maps, opaque, smooth shading, the front side), so only uniforms differ (colour, roughness, glow) and three reuses the rocks' program. Five small draw calls (shell, feet, face, eyes, tips), under 2,500 triangles, culled when off screen, no light, no pass. Per frame: the one projection for its spot and, for 1.1 s once found, its head's turn, which keeps the frames coming only while it moves. Its shadow stays one rock sphere.
- Never in the arrival, with `bare=1` or the capture hook, in demo mode or with `bright=1`, as before. The line is unchanged.

## 22. Amendment: Luna, the voice of the app (14 November 2026)

The owner's ask on the first day of the event: "a voice AI feature that can control the whole application, so you can speak in plain English and it will navigate the application properly; name it Luna, make it a toggle feature, and test it."

### 22.1 What Luna is

- A toggle named Luna, with a crescent, in the header of every page with the frame (before the theme switch), at the end of the view from the site's row from 768 px, and in today's card on a phone. Off at each visit; pressed, she listens; pressed again, she stops.
- While she is on, the browser's own speech recognition listens (continuous, English; Chrome, Edge and Safari have one, which may use its maker's servers; Firefox has none) and each phrase heard to the end is a command. Her reply is said aloud in the browser's own voice (a clear English one when the system has it) and shown in her panel, read out to screen readers as it comes. The recognition is stopped while she speaks, so she never hears herself, and a time limit stands in for a browser that never says its speech ended. A switch in her panel, "Say replies aloud" (on at first, and kept in the browser for the next visit), turns her voice off, as the owner asked on 14 November ("it's a toggleable mode"): every reply, heard or typed, then shows in the panel only while she goes on listening, turning it off mid-reply stops her at once, and "be quiet" and "speak again" do the same by voice.
- Her panel says what she is doing (listening, working, speaking), what she heard and what she said, gives a box to type to her (her only way in where the browser cannot listen, or the microphone is not allowed, and always there), and examples of what to say. On a phone it spans the screen under the header (or above the bar in the view from the site).

### 22.2 What she understands

In this order, so her own words come before the planner's ("show me the Sun" turns the view; it names no site):
- **Her own:** any page ("open the forecast", "compare sites", "accuracy", "how it works", "the brief", "go home"), the view from the site ("stand at the site", "land", "3D view"); the player ("play", "pause", "next", "previous", "faster", "slower", "replay"); the view ("turn to the Sun", "show me Earth", "where is the lander", "look up", "look ahead", "show the paths", "hide the words", "brighter picture"); the better day; the home page's flight ("fly to the south pole"); the theme ("dark mode"); help, hello, thanks; "stop listening", after which she says goodbye and turns herself off. "Please", "can you" and her name in front ("Luna, …", "Hey Luna, …") are let go.
- **The planner's phrasings,** the same the Ask box matches (a site, a comparison, a period, the lander, an explanation), with spoken numbers written as figures ("rim two", "fourteen days", "the twentieth of January twenty twenty seven") and the names speech mishears put right ("the Gerlache", "noble rim").
- **Comparisons** (15 November 2026, the owner: "compare this landing site to this landing site … compare this to any landing site"): two sites ("compare de Gerlache Rim 2 to Nobile Rim 1", with to, with, and, vs, versus or against, or "how does A compare to B"), the site shown and another ("compare this to Nobile Rim 1", "compare this site with …", "compare it with …", "how does this compare to …"), each a new comparison on Compare with the dates and lander chosen; and the site shown against every other ("compare this to any landing site", "compare this with all / other / every landing site", "how does this compare to other sites", "is there a better site", "which site is best for these dates"), which ranks the catalogue as the site list does, never names a site with incomplete terrain best, puts the best three beside the site shown, each landing at its own best time in the period as the site list's links do (so Compare's table shows the figures the reply quotes, and says once that each lands at its own best time), and says in two sentences, with the dates and the lander, which site ranks first, how long it keeps power from its best landing day and what the site shown keeps ("keeps power longest" only when no other site matches it). The chat route acts on these before any model; the model knows the two actions (compare_sites, compare_best) for freer words.
- **Anything else of three words or more** goes to the assistant's model, as a question in the Ask box does; a stray word or two is let go, as a room is never quite quiet.

### 22.3 How she does it

- The planner's actions, from the matcher or the model, are validated against the catalogue and applied as the Ask box applies them, and the exchange is logged where the Ask box shows its own. A new site or period on the view from the site lands the view there; from a page other than Explore and Compare it opens Explore on it.
- The pages lend her their controls while they are mounted (the time bar its player, the view from the site its turns and switches, Explore and the view the better day, the home page its flight), each doing what its own button does and saying what it did where it has something to say ("Next" names the moment; "faster" says "Twice as fast."). A control asked for on a page without it opens the page that has it (the view from the site for the player and the turns, the home page for the flight) and runs there once it is ready, within 15 s.
- Reduced motion: Play is off there as on its button, and she says why.

### 22.4 Tested

Each part test-first: the commands (every phrasing above, spoken numbers and names), the controls lent and kept for a page about to open, the runner (each command's effect and reply, the planner's actions applied and logged, the model's answer and its failure), the browser's voice (recognition under either name, the voice chosen, the time limit), the engine (listening only when on, acting, speaking without listening, listening again after the browser's silence, goodbye, typed words without voice input and with the microphone blocked), the button and panel, and each page's controls. End to end in the built app, with a stand-in speech recognition that hears scripted phrases and a stand-in voice (headless Chromium has no microphone): 18 checks pass, from turning her on through "open the forecast", a spoken comparison with mis-heard names and spoken numbers, "stand at the site", "turn to Earth", "next", "play", "faster", "pause", the theme, typed "go home" and "fly to the south pole" to "stop listening".

### 22.5 Amendment: Gemini's help (14 November 2026)

The owner asked for Gemini's help three ways. Each falls back to what Luna did before, quietly, and none is used in cached mode.

- **Her voice.** With "Say replies aloud" on, a reply of up to 500 characters goes to `/api/speak`, which has Gemini's speech model say it in one prebuilt voice and returns WAV (Gemini's raw 16-bit 24 kHz mono PCM with a RIFF header), and she plays it. She says it in the browser's voice instead on any failure, when the audio has not started within 4 s, and always for longer replies. When the route says Gemini is not available (no key, 503) she stops asking for the rest of the visit, and after two failures in a row too. The switch, a newer reply and turning her off stop the audio at once, as the switch did. The route keeps 64 recent phrases in memory (at most 12 MB), the page 16. Her button's press plays a moment of silence on her audio element, for Safari, which plays sound only during a press.
- **Her ears in every browser.** Where the browser has no speech recognition (Firefox, some Safari), her microphone records a phrase with MediaRecorder from one press to the next, at most 15 s, then lets the microphone go and sends the recording to `/api/transcribe`. Gemini writes the words down (the audio inline, JSON out, told the catalogue's names), and they go to her commands as a heard phrase does. The browser decodes its own recording into 16 kHz mono WAV, which Gemini documents, where it can, and else sends it as recorded: Firefox's Ogg Opus, Safari's MP4, Chromium's WebM. The route takes at most 1 MB, by its header and as it reads, and a WAV of at most 16 s by its own header. Turned on, she asks the route once whether it can transcribe; where it cannot, the microphone goes and she takes typed words. Chrome and Edge keep their own continuous listening, unchanged.
- **Her answers.** `/api/chat` asks Gemini with the system prompt and question the OpenRouter models get, asking for JSON where it expects JSON. Text goes to OpenRouter first for every asker, as the owner decided on 14 November (text to OpenRouter, speech to Gemini, so Gemini's quota is kept for Luna's voice): Luna, "Ask in plain words" and the brief all get the OpenRouter chain first and Gemini last, which may use what is left of the same budget (AI_MODEL_BUDGET_MS, each model at most AI_MODEL_TIMEOUT_MS). The source line names Gemini when it answered ("answered by Gemini 2.5 Flash").
- **Settings and limits.** The key is read on the server only, from `GEMINI_API_KEY`, and sent in the `x-goog-api-key` header; no `NEXT_PUBLIC_` variable holds it. `GEMINI_TEXT_MODEL` and `GEMINI_TRANSCRIBE_MODEL` default to gemini-3.5-flash-lite (since 15 November: gemini-2.5-flash is closed to new keys and gemini-3.8-flash did not answer inside the 10 s each model gets), `GEMINI_TTS_MODEL` to gemini-3.8-flash-tts and `GEMINI_VOICE` to Leda. Google renames its models, so these may need updating to the current names: the official SDK's model list of November 2026 no longer names gemini-2.5-flash-preview-tts. Each voice route has the chat route's limit per address (`AI_RATE_LIMIT_PER_MIN`). In cached mode (`NEXT_PUBLIC_AI_MODE=cached`, the offline venue build, or `?demo=1`) Gemini is never called: the routes answer 503 and her browser does not ask them.
- **What goes to Google.** Only with a Gemini key on the server and not in cached mode: the text of her replies, to be said aloud; her recordings, in browsers without speech recognition, from one press to the next; and the questions she and the Ask box pass to the assistant, with the app's summary of the site and figures on screen. Google's terms for the key's tier say how Google may use them. Chrome's and Edge's own recognition sends sound to their makers, as before.
- **By REST.** The routes call Gemini's generateContent (v1beta) with fetch. Each request and answer was checked against the types of Google's SDK, @google/genai 3.3.0, and the converter it uses for this API; the SDK itself, 41 packages and 32 MB with its dependencies, would weigh on every function.
- **Tested,** each part test-first, with fetch standing in for Gemini (94 new tests; the web suite then passed 2,337, with 5 skipped): the WAV header from a known PCM buffer; each route's request, missing key, upstream errors, caps and limit; her voice playing, falling back on failure and timeout, and stopping at once; a recording in a browser without speech recognition reaching the POST and then the command; the order of providers; and cached mode calling no route. In the built app, three browser journeys pass with the voice routes and the assistant answered by the journey: a recording from Chromium's stand-in microphone sent as 16 kHz WAV and acted on, the reply played; the fallback to the browser's voice for the rest of the visit; and demo mode calling neither route. Nothing here reached Gemini itself: this machine could not reach Google. `npm run check:voice -- https://<the deployment>` (`web/scripts/check-voice.mjs`) checks a deployment.

### 22.6 Amendment: Luna suggests (15 November 2026)

The owner saw that nothing on the pages says Luna finds the best landing date or the best site. So she says it herself.

- **Beside her.** Two seconds after a page opens, a small pane shows beside her 3D self, glass in look (the accent edge and glow; no backdrop blur, which spec 23 keeps to Choose a site and Compare): "Ask me" and two or three requests that fit the page, each a button. Home: "Which site is best for these dates?", "Plan a landing", "Fly to the south pole". Choose a site: the first two. Explore: "Find the best landing date for N days" (N is the period's length), "Compare this to every landing site", "Explain the longest night". Compare: "Compare this to every landing site", "Best N-day landing date across the compared sites". The view from the site, which has her button and not her 3D self: "When does Earth set?", "How long until sunset?", "When is the next radio window?", at the lower left over the time bar. How it works and Accuracy: the first two. The printable brief: none.
- **A press is a typed request.** It turns Luna on, opens her panel beside her (under her button in the view from the site; on a phone there, where her button is folded under More, in a panel of the suggestions' own with a cross that turns her off) and sends the words as if typed (`sendToLuna`), so the page changes and she answers. Every request is one of her own commands or the planner's phrasings (22.2), never a question for the model; a test parses each one against the catalogue.
- **Under Explore's answer.** "Ask Luna:" and the same three buttons, where the question arises.
- **Smooth.** Once per page in a visit (session storage, and memory where there is none). The cross closes the suggestions for good in this browser (`earthrise.luna.hints`, local storage, read and written inside try/catch: a convenience, per visitor). Not shown while Luna is on. On a phone it is one request above her, clear of Choose a site's bar, and it waits for the end of Explore's step-by-step tour, whose "Next" stands where she does. From 640 px it stands beside her, raised over a bar at the window's foot below 1280 px. Under reduced motion it shows without moving.
- **Accessibility.** A labelled region ("Suggestions from Luna") that takes no focus; each request a button named "Ask Luna: …"; a screen reader hears one polite line, once in a visit.

## 24. Amendment: terrain versions, shadows against pictures from orbit, and modelled cold traps (14 November 2026)

Three steps of the ML study (`docs/ml-feasibility.md`), built on their own branches on 14 November and merged with
Lea's frontend and Maroun's ranking. Each adds to the pages; none changes a figure of a verdict. The method and the
figures are in `docs/method.md` ("Terrain versions", Validation item 5, "Modelled cold traps").

### 24.1 Terrain versions

- `data/ensemble` holds the error model fitted to the app's LOLA heights minus PGDA product 90's (its size by slope
  and stated error, its correlation length per grid) and 32 versions of the ground for each of the 21 polar sites,
  each traced to a skyline with the pipeline's march. A worker runs the app's engine over each version for the chosen
  landing and period.
- Explore: a closed fold, "Terrain versions" (two words), after "Times ±N h". It gives how many versions keep the
  verdict or meet the requirements, the range of time with power, first sunset, longest night and contact while
  powered beside the app's figure ("outside every version" when so), what the versions assume and do not establish,
  and a link to `/validate#versions`.
- Requirements: an optional fifth one, "Holds in at least N % of terrain versions", ranking the period's landing
  times like any requirement. The brief and the view from the site rank by it as Explore does, working the versions
  out only while it is set; links and scenario files carry it with the others, as one set (`minhold`, in percent;
  `minTerrainVersionsHeldPercent` in a file, only when set). Places nearby, the 12-month search and Compare do not
  check it, and the note under its box says so.
- Compare: a "Terrain versions" row whose name is a switch, as the row of your requirements is: each scenario's
  versions open on a tap, so the example comparison keeps to its 750 words. The brief: "Across terrain versions".
  Accuracy: a "Terrain versions" part.
- The budget's terrain part takes the versions: an event's terrain spread is the larger of its shift under the
  stated-error skylines and the 95th percentile of its shifts over the versions that keep it. 68 margins grew and
  none shrank; the default landing (de Gerlache Rim 2, 1 January 2027) shows "Times ±8 h" where it showed ±4.5 h.
- Versions exist only for the polar catalogue sites at the 2 m mast. A share of versions rests on the error model
  and is not the chance that a landing works.

### 24.2 Where shadows fall in pictures from orbit

- Accuracy has a fourth check, "Where shadows fall in pictures from orbit", after "How much sunlight a site gets", in
  the same panel style as the other checks.
- Its mark is worked out from the rows of `data/validation/images.json`: "Passes: every picture meets the mark" or
  "Misses: N of M pictures fall short". It misses: 17 of the 20 pictures meet the mark, which was set after a first
  look at five pictures and not changed after. The three that fall short were all taken with the Sun 1.1° up or less.
- The figure is the typical picture's share of ground called alike. The sentence gives the share of the disagreement
  on shadows' edges and the control with the Sun turned a quarter round.
- "Show the numbers" lists every picture, how a picture is read, how the frames were picked, and the sources and
  the command. Without the file, the panel is left out.
- The page's verdict line counts it: "Three of four checks meet their criteria; past missions are context, not a
  check." The home page keeps its two checks and Blue Ghost as context, and says that a third, this one, misses its
  own mark; the assistant's rehearsed answer on Accuracy says so too.

### 24.3 Modelled cold traps

- For each polar catalogue site south of 80° S, beside power and radio, one line gives the ground within 5 km whose
  annual maximum surface temperature stays below 110 K in LRO Diviner's thermal model (Paige et al. 2010), the
  nearest such ground, and the steepest 20 m slope on a straight line to it, from PGDA product 90.
- The brief adds the ground where the model lets ice last at the surface or within 0.5 m. The site list gives the
  5 km figure on each row, across the whole row under its figures, in Lea's layout. The shadow map offers the cold
  ground as a layer, off by default, with a line in its key.
- The wording is always "modelled conditions where ice could last", never ice alone, a probability or a detection,
  and How it works says what the layer does not establish. Sites north of 80° S say the model does not reach them.
- The data lives in `data/coldtraps`, an optional part of the manifest.

## 25. Amendment: a calmer view from the site (15 November 2026)

The owner found the view from the site "extremely cluttered" at laptop sizes and on phones, though not on very large screens, and found that visitors took Earth in view, or power, for radio contact on its own. This amends 16.2, 17.1, 18.3, 19.1, 19.3 and 20.1 for the stand view; nothing is deleted, only folded, and every action keeps a button a keyboard reaches.

### 25.1 What shows at first glance

- **From 1800 px wide** the layout of 19.1 and 20.1 stays: the whole headline, the next step (the gold link and Change), the lander's state with the links to Earthrise, How it works and Accuracy, and the row of buttons at the top right.
- **From 768 px up to 1800 px** the plate keeps two things: the headline's short form ("16 January: power for 16 days 4 hours, radio for 8 days 11 hours", the phone's of 19.1) beside More, and the lander's state for the hour. The better landing day is the phone's one gold chip under the plate. The next step (Change site, Change date, Change lander, Compare sites, the better day in full), the whole headline, the links to the evidence, the compass's key and "Brighter picture" wait in today's card under More. The plate is no wider than leaves the compass clear.
- **The row of buttons** (Turn to Sun, Earth, Lander; Look up; Show paths; Hide panels; Luna) sits at the top right from 1800 px only. Narrower it is one small plate centred just above the time bar, and on a phone a strip on the bar, as before; "Turn to" is written from 1024 px.
- **The line over the view** (the first step, a key moment's why, Look up's) is its own plate above the time bar, above the row where the row sits there. It no longer docks on the compass.

### 25.2 The compass at the top

The compass strip with its facing line is a heading bar at the top edge, 320 px wide: centred from 1200 px, at the top right from 768 px (where the plate needs the left). Its key (Sun, Earth, lander, below the horizon) shows on it from 1800 px; narrower, today's card names the dots. A phone keeps its facing chip ("de Gerlache Rim 2, facing north"), now centred under the plate. Checked clear of the plate and the row at 390, 768, 1024, 1200, 1280, 1440, 1600, 1800 and 1920 px.

### 25.3 Hide panels

One control, "Hide panels" in the row at every width ("Hide" on a phone, its accessible name whole), takes away every plate over the view: the answer, the chip, the row, the compass, the line over the view and the names in the sky. The time bar keeps Play, the date and hour, the track and the moments' dots. "Show panels", at the top left, brings everything back as it was; the focus moves between the two. It takes the place of "Hide the words" (16.2, 18.3), which did the same under a name that read as hiding the labels only, so there are not two such buttons. Kept for the visit (session storage), as "Brighter picture" is. Luna's "hide the words" and "show the words" do the same.

### 25.4 Radio contact needs power and Earth

- **The key** names the green band "radio contact = power + Earth in view", after "lander off" (red) and "Earth in view" (blue), so the rule is read where the bands are.
- **The lander's state** names both conditions in every case: "Power on, battery 100 %. Radio contact: it has power and Earth is in view."; "Power on, battery 62 %. No radio contact: Earth is below the horizon." (or "behind a hill"); "Power off since 4 January. No radio contact: Earth is in view, but the lander is off."; "Power off since 4 January. No radio contact: the lander is off and Earth is out of view." The dot stays green only with contact, amber with power alone, red when off.
- **Today's card** says the rule once in full: "Radio contact needs both: the lander has power, and Earth is in view."
- The bands themselves are unchanged: the green is drawn only on hours with power and Earth in view, hatched after a night without power.

### 25.5 Kept

The facts and their limits (the measured note under "Why this happens", "if the lander survived the night", the hatched band), the page's heading with the whole headline for screen readers, Luna's button in the row and her controls, the horizon chart without WebGL 2 with the same words, and reduced motion.

### 25.6 Tested

The stand view's tests pin the tiers by their classes (what waits for 1800 px, what the card holds below it), the compass's place and key, "Hide panels" and "Show panels" with the focus and the session's memory, the state's four lines and the key's words; the browser journeys reach Compare sites through More at 1280 px by keyboard and by pointer.

### 25.7 Amendment: half the words (15 November 2026)

The owner asked for less text in the view where the lander touches down. The words on screen before a tap are cut by about half at every width, so the Moon and the landing are what is seen. This amends 25.1, 25.2 and 25.4 and 19.2; every fact, limit and the radio rule stays one press away, and every control keeps a keyboard's reach and an accessible name.

- **One plate at every width.** The 1800 px tier of 25.1 is gone: the plate is the one-line headline ("1 January: power for 3 days 4 hours, no radio") beside More and, from 768 px, the site's name and the state in a few words by its dot: "Power 100 % · no radio", "Power 87 % · radio contact", "Power off · no radio", and after a power cut "Power 40 %, if it survived · radio contact". "Radio contact" is written only with power and Earth in view. The whole sentence of 25.4 is there for a screen reader and is the first line of today's card at every width. The better day stays one gold chip under the plate, now the day alone ("Try 20 Jan instead ›") with why as its tooltip; the card says why in full.
- **Today's card** holds the rest at every width: the state in full, the radio rule, where you stand, the countdown, one line with the heights of the Sun and Earth, the lander's distance and "Dates and hours are Earth time (UTC).", the whole headline, the better day, Change site, Change date, Compare sites (gold when no day is better), Change lander, "Brighter picture", the compass's key and the links to Earthrise, How it works and Accuracy. The Change list of 20.1 is gone with the row it sat on.
- **The row of buttons** is signs: the Sun, Earth, the lander, look up (look ahead), paths, hide panels, then Luna. Each has its name as its accessible name and its tooltip ("Face the Sun", "Show paths", "Hide panels"); "Turn to" is no longer written.
- **The names in the sky** are a word or two: "Sun", "Earth, below" (under the horizon), "Sun, hidden" (behind a hill), "Lander". The pointers at the screen's edges say the same.
- **The compass** keeps its letters and "Facing north-west"; its key is in today's card at every width from 768 px.
- **The first step** is "Press Play · drag to look around" at every width ("Drag to look around" with reduced motion). It shows once a visit: it goes at the first step into the view, as in 19.2, or after ten seconds, and stays gone for the visit (session storage).
- **The time bar** (the `brief` prop, which Explore leaves off): the key waits behind the Key button at every width, with "radio contact = power + Earth in view" in it; Next shows the moment alone ("Sunset, 3 Jan ›") and keeps "Next: Sunset, 3 Jan" as its accessible name and tooltip; "(Earth time)" after the date goes to today's card.
- **Kept:** Luna, "Hide panels" and "Show panels", the compass at the top, reduced motion, the horizon chart without WebGL 2, the page's heading with the whole headline, and the copy guards.
- **Measured** (words in view before a tap, twelve seconds after the ground has drawn, Chromium with software WebGL, dark; before, then after): the default site at 1440 px 118, then 55; at 1920 px 144, then 55; at 390 px 64, then 41; Nobile Rim 1 on 19 January at 19:00 at 1440 px 112, then 55; at 1920 px 137, then 55; at 390 px 58, then 40. While the first step shows, six more.
- **Tested:** the stand view's tests pin the one plate (20 words at most at 1440 and 1920), the state's few words and its whole sentence, the signs' names and tooltips, the names in the sky, the card's lines, the first step and the folded key; the time bar's tests pin `brief` and that Explore's bar is as it was.
