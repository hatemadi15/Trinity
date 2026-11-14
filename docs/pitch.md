# Pitch script — Earthrise (5:00)

Setup before walking up: laptop on `http://localhost:3000/?demo=1` (offline build, rehearsed assistant answers), browser in kiosk mode, second laptop on the same URL as backup, the recorded demo video open in another tab. Speaker lines are in plain text; clicks are in brackets. Times are cumulative. Say only what has been measured: no claim that Earthrise is faster than other tools (no timed comparison has been run), and a ranking score is a stated preference between choices, not a chance that a landing works.

## 0:00 — Hook (30 s)

[Home page at the top. Click "Fly to the south pole" as you begin.] In March 2025 two landers reached the Moon four days apart. Blue Ghost, on a flat plain in Mare Crisium, worked for fourteen days and switched off a few hours after sunset, as planned. Athena, near a mountain close to the south pole, had lost power within a day: it came to rest on its side in a crater with the Sun low on the horizon, and its batteries never charged. Same Moon, same month. The difference was light and line of sight to Earth.

[On screen: the headline "See when a Moon lander has sunlight and a signal." beside the whole Moon, Earth beside it; then the descent plays for 11 seconds: the Moon turns, tips its south pole towards us and comes closer, down to the pole's relief map and de Gerlache Rim 2's shadow picture, ending on the answer "Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days without power". It holds there to the end of the hook.]

## 0:30 — Problem (30 s)

Everyone who plans a south-pole mission has to answer two questions: when is the Sun above the local horizon, and when can a radio see Earth? The answers depend on terrain a few kilometres away and change hour by hour. The tools that answer them exactly, SPICE and GIS stacks, are slow to set up and run once for every site and date. Earthrise answers in seconds, in a browser, and shows its checks.

## 1:00 — Live demo (2:00)

[Click "Open the full forecast" under the descent's answer.] This ridge is one of the nine regions NASA shortlisted for the first crewed Artemis landing. The page opens on the answer, in one sentence: a small solar lander landing on 1 January has power for 3 days 4 hours, then night. [Point at the chart "Why: the 30 days, hour by hour".] Here is why: the gold line is the Sun, skimming the hills; on 3 January it drops behind them and stays there for more than two weeks, and the battery runs out. [Press Play on the time bar.] The shadow map is computed from NASA's elevation data for each hour, with north up: watch the ridge go dark. [Press Pause once the ridge is dark, then drag the time bar's handle back to the start.]

[Click "Stand at the site".] And this is the same hour standing on the ridge: NASA's ground out to 125 kilometres, the shadows worked out from those heights, a small white Sun low in a black sky, and a lander beside you for scale. The plate at the top says it first, as the forecast did: landing on 1 January, power for 3 days 4 hours, no radio contact, then 16 days without power. Earth is below the horizon; the pointer at the edge of the screen says by how much. [Press Play.] Watch the shadows sweep across the ground; Play stops on each key moment and turns to it. The Sun drops behind the hills on 3 January; the battery runs out the next day; and on 10 January Earth comes over the hills, but by then the lander has no power to call it. [Press Pause.] [Click "Change", then "Change date", under the answer.]

[Point at the line under the answer.] Twelve kilometres away, the rim summit, a high point not yet checked for landing, keeps power for all 30 days from the same landing day. [Click "Explore de Gerlache rim summit".] Green. A few kilometres decide whether a lander keeps its power.

[Click "Or ask in plain words" under the answer; the box takes the cursor. Type "compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days". Enter.] The assistant turned that sentence into actions and opened Compare sites. [Compare page.] Two candidates, same days, same lander, one row each: sunlight, Earth in view, longest night, time with power, and a sentence that names the best site for each. [Click "Find the best landing day for these sites in the next 12 months".] It searches the year and moves the period to the landing day that keeps the site that does worst powered longest, giving each site's own time with power.

[Type "explain the longest night".] The assistant explains, but it never computes: every number on these pages comes from the engine, and the line under each answer says who answered.

[Click the "Printable brief" link.] One page, printable: the answer, five numbers, the Sun and Earth over the period, the method, the data. [Point at the paragraph.] Offline, the app writes this from the figures; online a model may write it, and any number not in the figures sends it back to the app's own words.


[Optional, if the room is quiet and the laptop online: press Luna in the header and say "stand at the site", then "turn to Earth".] And everything here also answers to plain English: Luna, the app's voice, opens any page, plays the month and turns the view for you; where there is no microphone you can type to her.

[Optional, if the time allows: open Plan a landing, press "Try the example", then "Search 9 sites".] The planner tries every site and every hour of the landing window and ranks them, the ones that meet every requirement first, and says why each comes before the next.

## 3:00 — Validity (45 s)

[Open Accuracy.] Three of four checks meet their criteria, and each says what it leaves out. Where the Sun and Earth are: our directions against JPL Horizons, worst gap 0.00003 degrees over 300 cases, and [click "Re-check with JPL now"] this button asks JPL live. How much sunlight a site gets: against NASA's LOLA sunlight maps, a typical gap of 0.9 points at fifteen sites; the power sums are checked against worked answers. The fourth, our shadows over 20 pictures from orbit, misses its own mark in three, all with the Sun barely up. As context, not a check: Blue Ghost's last signal came 2.4 hours after our predicted sunset.

## 3:45 — Impact and next (35 s)

Planners get a first answer in a minute and a brief they can hand to engineering. Students and the public get the same pages in plain words, and How it works gives teachers the science behind them, with sums a class can check. Anyone can replay real missions from the home page. Next: more pictures from orbit per site, the descent for every site, relay passes, and a public API for the tables.

## 4:20 — Data and team (20 s)

NASA data: LRO LOLA elevation models and illumination maps, NASA Goddard's adjusted south-pole maps, LRO's camera pictures and Diviner's temperature model, JPL DE440 through SPICE, JPL Horizons, the CGI Moon Kit, the Blue Marble, the Yale Bright Star Catalogue through NASA HEASARC, the Artemis III regions and the CLPS mission records. Everything runs in the browser; the Python pipeline is the reference implementation, and about 2,500 automated tests keep the two in step. Team Astroy/Ed.

[The Accuracy page shows the last recorded run of the tests; refresh it with `npm run validation:tests` before the pitch and say the number it shows, if it is not about 2,500.]

## 4:40 — Close (20 s)

When is the Sun up, and can Earth hear you? Earthrise answers in a minute, shows its checks, and runs on this laptop with the Wi-Fi off. Thank you.

## If something breaks

- The assistant does not answer: the page falls back to rehearsed answers on its own; say "rehearsed answer" and continue.
- The 3D view is black: stay on the Shadow map tab; it shows the same light from above.
- The stand view is slow or black: add `&quality=fast` to its address, or skip it and stay on Explore's shadow map.
- The descent stutters: press "The answer" on the rail at the right. If its live view cannot draw, the page shows its stills and says so.
- Page does not load: switch to the backup laptop (same URL), or play the recorded demo from the second tab and narrate over it.
- JPL re-check fails (no internet): the page says so and keeps the stored comparison; the point stands.

## Timing rehearsal log

| Run | Date | Time | Notes |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
