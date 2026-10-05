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
