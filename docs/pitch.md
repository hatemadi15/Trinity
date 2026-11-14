# Earthrise pitch — one planning decision (4:30, plus 30 seconds reserve)

Prepare `/plan` with the original site and arrival, a seven-day delay, and a nearby alternative on the delayed date. Keep the mission duration and lander the same. Set explicit operating-hour, powered Earth-visibility-hour and maximum Earth-gap requirements. Read out only the numbers computed by the current build; rehearse the actual case before using it. Do not promise every alternative improves every metric.

## 0:00–0:30 — The problem

[Open the saved comparison, not the cinematic arrival.]

“Our lunar landing date moved seven days. Can we still operate at our original site, or should we choose another location? Near the south pole, the Sun stays low, hills can block it, and Earth can disappear behind the terrain. A good monthly sunlight percentage does not tell us whether our battery lasts until Earth is in view.”

## 0:30–2:00 — Make the decision

[Point to the original and delayed scenarios.]

“Earthrise preserves the original plan while we change the arrival. Each scenario keeps its coordinates, UTC arrival, mission duration, panel, load, battery, mast and Earth-clearance assumptions.”

[Read the computed change in continuous powered duration and Earth visibility while powered.]

“These are the hours before the first modeled power loss, and the hours within that time when Earth is in view. The longest Earth-visibility gap is separate: a large total can still hide a long interruption.”

[Point to the nearby candidate on the delayed arrival.]

“Here is another location for the same delayed arrival. The comparison shows which selected requirements each option meets, with reasons. These are screening requirements, not a flight-safety approval.”

## 2:00–2:45 — Explain why

[Open the relevant scenario in Explore and show the horizon or shadow map; optionally enter Stand at the site if it loads promptly.]

“The Sun and Earth follow these paths against the hills in their directions. This terrain is why nearby locations can behave differently. Change the hour to see the battery, sunlight and Earth visibility together.”

“If this is an approximate Artemis region coordinate, it is an illustrative point within that region, not a forecast for every landing spot in it.”

## 2:45–3:30 — Show the evidence and limits

[Open Accuracy.]

“Our celestial directions are compared with JPL Horizons: the stored table reports a worst elevation difference of about 0.00003 degrees across 300 cases. That checks directions, not the complete mission prediction.”

“Our illumination comparison has 11 of 15 sites within five percentage points, with a largest difference of 10.8 points. Resolution, mast height and averaging dates differ. We show those differences rather than calling them an exact validation.”

“Events are estimated hourly, and terrain uncertainty can shift them further. The battery calculation does not model thermal survival or restart. Earth visibility is geometric line of sight; antennas, radio link budget and ground-station availability remain separate.”

## 3:30–4:00 — Share the decision

[Return to Plan, copy the full comparison link, or show its printable comparison.]

“Science and engineering teams can inspect the same scenarios and assumptions. Students can follow the same answer back to the horizon and the NASA data.”

## 4:00–4:30 — Close

“Earthrise helps you compare how a change in lunar landing location or arrival time affects sunlight, modeled power, and direct visibility to Earth. NASA LRO LOLA terrain and JPL DE440 positions drive the calculations in the browser. The next step is testing this workflow with planners and educators and improving terrain validation under matched conditions.”

## Rehearsal and fallback

- Time three runs; aim for 4:30 so a slow page does not consume the close.
- Test the exact shared comparison URL in a fresh browser tab. Confirm all lander and mast settings match.
- Keep a recording of this same case, a printable comparison, and a screenshot of the validation table.
- Cache the required data on the presentation laptop and test without Wi-Fi. Offline use depends on assets being locally available.
- If the immersive view fails, use the horizon chart. If the live JPL check is unavailable, show the stored comparison and say so. Never debug during the pitch.
- State only measured results. Do not claim a speed advantage over other tools without a recorded comparison task.

| Run | Date | Duration | Confusing step or failure |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
