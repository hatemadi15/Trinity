# Pitch script — Earthrise (5:00)

Setup before walking up: laptop on `http://localhost:3000/?demo=1` (offline build, rehearsed planner answers), browser in kiosk mode, second laptop on the same URL as backup, the recorded demo video open in another tab. Speaker lines are in plain text; clicks are in brackets. Times are cumulative.

## 0:00 — Hook (30 s)

In March 2025 two landers reached the Moon two weeks apart. Blue Ghost, on a flat plain in Mare Crisium, worked for fourteen days and switched off a few hours after sunset, as planned. IM-2, on a ridge near the south pole, was dead within a day: it came to rest on its side in a crater with the Sun low on the horizon, and its batteries never charged. Same Moon, same month. The difference was light and line of sight to Earth.

[Landing page is on screen: the pitch line and the three mission cards.]

## 0:30 — Problem (30 s)

Everyone who plans a south-pole mission has to answer two questions: when is the Sun above the local horizon, and when can a radio see Earth? The answers depend on terrain a few kilometres away and change hour by hour. The tools that answer them exactly, SPICE and GIS stacks, take a specialist a day per site. Earthrise answers in a minute, in a browser, and shows its checks.

## 1:00 — Live demo (2:00)

[Click the de Gerlache Rim 2 card.] This is an Artemis III candidate region. The terrain is NASA LOLA elevation data, the shadows are real: the light is the Sun's computed position. [Drag the date scrubber across January.] Watch the skyline: the Sun skims the ridge, the timeline goes dark, Earth dips behind the rim, and the verdict flips red. With this battery the lander does not survive the night.

[Type in the planner strip: "compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days". Enter.] The planner turned that sentence into actions and opened Compare. [Compare page.] Two candidates, same window, same settings: sunlit fraction, longest night, Earth in view, longest gap, both at once, lowest battery. [Click "Best 14-day window".] It scans the next year and moves the window to the span that keeps both sites lit and in contact, opening at sunrise. Green.

[Back to Explore. Type "explain the longest night".] The assistant explains, but it never computes: every number on this screen comes from the engine, and the line under the answer says who answered.

[Click "Export brief".] One page, printable: the verdict, the numbers, the charts, the method, the data. [Click "Write the brief".] The narrated paragraph is checked number by number against the figures; if the model invents a number, the template wins.

## 3:00 — Validity (45 s)

[Open Validate.] Three tables anyone can rerun. Our Sun and Earth directions against JPL Horizons: 300 rows, worst difference 0.00003 degrees, and [click "Re-check with JPL now"] this button asks JPL live. Our sunlit fractions against NASA's LOLA illumination map: eleven of fifteen sites within five points; the misses are 20-metre peaks sampled by a 60-metre map. And the backcast: Blue Ghost ended two hours after our predicted sunset; IM-1 and IM-2 ended early, for the reasons written under the table.

## 3:45 — Impact and next (35 s)

Planners get a first answer in a minute and a brief they can hand to engineering. Educators get the same screens in plain words: Learn mode. The public can replay real missions from the landing page. Next: NAC imagery per site, standing on the surface in first person, relay passes, and a public API for the tables.

## 4:20 — Data and team (20 s)

NASA data: LRO LOLA elevation models and illumination maps, JPL DE440 through SPICE, JPL Horizons, the CGI Moon Kit, the Artemis III regions and the CLPS mission records. Everything runs in the browser; the Python pipeline is the reference implementation, pinned by three hundred automated tests. Team Astroy/Ed.

## 4:40 — Close (20 s)

When is the Sun up, and can Earth hear you? Earthrise answers in a minute, shows its checks, and runs on this laptop with the Wi-Fi off. Thank you.

## If something breaks

- Planner strip does not answer: the page falls back to rehearsed answers on its own; say "rehearsed answer" and continue.
- 3D view is black: press "Globe", then "Terrain"; if still black, the sky dome and timeline carry the same story.
- Page does not load: switch to the backup laptop (same URL), or play the recorded demo from the second tab and narrate over it.
- JPL re-check fails (no internet): the page shows the stored comparison and says so; the point stands.

## Timing rehearsal log

| Run | Date | Time | Notes |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
