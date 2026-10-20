# Pitch script — Earthrise (5:00)

Setup before walking up: laptop on `http://localhost:3000/?demo=1` (offline build, rehearsed assistant answers), browser in kiosk mode, second laptop on the same URL as backup, the recorded demo video open in another tab. Speaker lines are in plain text; clicks are in brackets. Times are cumulative.

## 0:00 — Hook (30 s)

[Home page at the top. Click "Fly to the south pole" as you begin.] In March 2025 two landers reached the Moon four days apart. Blue Ghost, on a flat plain in Mare Crisium, worked for fourteen days and switched off a few hours after sunset, as planned. Athena, near a mountain close to the south pole, was dead within a day: it came to rest on its side in a crater with the Sun low on the horizon, and its batteries never charged. Same Moon, same month. The difference was light and line of sight to Earth.

[On screen: the headline "See when a Moon lander has sunlight and a signal." over the whole Moon, Earth just beyond its south pole; then the arrival plays for 21 seconds: over the pole from 900 km, the polar cap, the ridge, landing beside a lander at de Gerlache Rim 2, and its January sped up (the Sun sets behind a hill on 3 January, the battery runs out on 4 January, Earth rises on 10 January, the Sun rises again on 20 January), ending on the answer "Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days without power". It holds there to the end of the hook.]

## 0:30 — Problem (30 s)

Everyone who plans a south-pole mission has to answer two questions: when is the Sun above the local horizon, and when can a radio see Earth? The answers depend on terrain a few kilometres away and change hour by hour. The tools that answer them exactly, SPICE and GIS stacks, take a specialist a day per site. Earthrise answers in a minute, in a browser, and shows its checks.

## 1:00 — Live demo (2:00)

[Click "Open the full forecast" under the arrival's answer.] This ridge is one of the nine regions NASA shortlisted for the first crewed Artemis landing. The page opens on the answer, in one sentence: a small solar lander landing on 1 January has power for 3 days 4 hours, then night. [Point at the chart "Why: the 30 days, hour by hour".] Here is why: the gold line is the Sun, skimming the hills; on 3 January it drops behind them and stays there for more than two weeks, and the battery runs out. [Press Play on the time bar.] The shadow map is computed from NASA's elevation data for each hour, with north up: watch the ridge go dark.

[Click "Stand at the site".] And this is the same hour standing on the ridge: NASA's ground out to 125 kilometres, the shadows worked out from those heights, a small white Sun low in a black sky, and a lander beside you for scale. The card says what the forecast said: power for three days, no radio contact, then sixteen days without power. Earth is below the horizon; the pointer at the edge of the screen says by how much. [Press Play.] Watch the shadows sweep across the ground and the Sun drop behind the hills on 3 January; the battery runs out the next day. [Click the flag "Earth rises, 10 Jan".] Earth comes over the hills on 10 January, but by then the lander has no power to call it. [Click "Change date" under the answer.]

[Point at the line under the answer.] Twelve kilometres away, the rim summit keeps power for all 30 days from the same landing day. [Click "Explore de Gerlache rim summit".] Green. A few kilometres decide whether a lander lives.

[Type in "Ask in plain words": "compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days". Enter.] The assistant turned that sentence into actions and opened Compare sites. [Compare page.] Two candidates, same days, same lander, one row each: sunlight, Earth in view, longest night, time with power, and a sentence that names the best site for each. [Click "Find the best landing day for these sites in the next 12 months".] It searches the year and moves the period to the landing day that keeps them powered longest on average.

[Type "explain the longest night".] The assistant explains, but it never computes: every number on these pages comes from the engine, and the line under each answer says who answered.

[Click the "Printable brief" link.] One page, printable: the answer, five numbers, the Sun and Earth over the period, the method, the data. [Click "Let the assistant write it".] The narrated paragraph is checked number by number against the figures; if the model invents a number, the template wins.

## 3:00 — Validity (45 s)

[Open Accuracy.] Three checks, each against an independent NASA source, each with a pass mark. Where the Sun and Earth are in the sky: our directions against JPL Horizons, worst gap 0.00003 degrees over 300 test cases, and [click "Re-check with JPL now"] this button asks JPL live. How much sunlight a site gets: against NASA's LOLA sunlight map, a typical gap of 2.6 points, eleven of fifteen sites within five. And when night falls on a real mission: Blue Ghost's last signal came 2.4 hours after our predicted sunset. [Click "Show the numbers" under the third check.] Athena and IM-1 ended early, for the reasons written here.

## 3:45 — Impact and next (35 s)

Planners get a first answer in a minute and a brief they can hand to engineering. Students and the public get the same pages in plain words, and How it works gives teachers the science behind them, with sums a class can check. Anyone can replay real missions from the home page. Next: NAC imagery per site, the arrival from orbit for every site, relay passes, and a public API for the tables.

## 4:20 — Data and team (20 s)

NASA data: LRO LOLA elevation models and illumination maps, JPL DE440 through SPICE, JPL Horizons, the CGI Moon Kit, the Blue Marble, the Yale Bright Star Catalogue through NASA HEASARC, the Artemis III regions and the CLPS mission records. Everything runs in the browser; the Python pipeline is the reference implementation, and about 1,500 automated tests keep the two in step. Team Astroy/Ed.

[The Accuracy page shows the exact count: 1,356 tests in the web app and 134 in the pipeline on 6 October. Refresh it with `npm run validation:tests` before the pitch.]

## 4:40 — Close (20 s)

When is the Sun up, and can Earth hear you? Earthrise answers in a minute, shows its checks, and runs on this laptop with the Wi-Fi off. Thank you.

## If something breaks

- The assistant does not answer: the page falls back to rehearsed answers on its own; say "rehearsed answer" and continue.
- The 3D view is black: stay on the Shadow map tab; it shows the same light from above.
- The stand view is slow or black: add `?quality=fast` to its address, or skip it and stay on Explore's shadow map.
- The arrival stutters: press Skip to land on the answer, or reload `/?demo=1&quality=fast`. If its live view cannot draw, the page shows its stills on its own.
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
