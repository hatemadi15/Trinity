# Demo checklist — Earthrise at the Beirut event (14–15 November 2026)

## The week before

- [ ] Feature freeze on 8 November; only bug fixes after.
- [ ] Offline build on both laptops. The fonts are in the repository (`web/src/app/fonts`), so the build needs no network (checked on 14 November with the network cut off). Keep `NEXT_PUBLIC_DATA_BASE` unset or `/data` in `.env.local` for the venue build; it is baked in at build time. From `pipeline/` run `uv run python -m lunar_pipeline.cli sync-local --tiles`, then `uv run python -m lunar_pipeline.cli check-data`: it must end "The full demo is here." (anything it names as missing, the pitch would show without it: without the terrain, flat ground in the view from the site and no shadow map or 3D ground in Explore; without the tiles, no place outside the catalogue). From `web/` run `npm run build` and `npm start`; open `http://localhost:3000/?demo=1` with Wi-Fi off and walk the whole pitch.
- [ ] Copy the data zip (see `docs/hosting.md`, GitHub Release) to a USB stick as the third copy.
- [ ] Record the full demo (screen recording of the pitch, 5 minutes) as the backup; keep it on both laptops.
- [ ] Record the 30-second video v1 (`docs/video-storyboard.md`).
- [ ] Rehearse the pitch five times against the clock (`docs/pitch.md`); log the times.
- [ ] Test the live URL on a phone and on a laptop you did not develop on.
- [ ] Refresh the validation tables (`validate`, `sync-local`) and the test report (`npm run validation:tests` on a clean tree with the full data: it records passed, skipped and failed, the commit and the data present, and the Accuracy page shows them); commit `web/public/validation/tests.json` and update the numbers in `docs/submission.md`.

## The browser journeys

- [ ] From `web/`, run `npm run e2e`: it builds, starts the build on port 3032, runs the journeys in Chromium and stops the server. `npm run e2e:run` runs them against the last build. Once per machine first: `npx playwright install chromium`. Stop `npm start` before `npm run e2e`, since the build rewrites `.next`.
- [ ] Every journey passes, the one for a missing horizon file included (it was skipped until the page said so in plain words). The results go to `web/public/validation/e2e.json` (commit it with the test report), the screenshots to `web/test-results/shots/`, and a failure's picture and error to `web/test-results/e2e/`.
- [ ] The usability tasks in `docs/usability-tasks.md` stay marked pending until they are run with real people; never present them as done.
- [ ] If there is time for people before the deadline, run the short three-person check in `docs/usability-tasks.md` (P2, P4, P5, E3 and the two questions on what the figures assume) and record what happened, with the number of people; three people are not a validation.

## The planner and the ranking

- [ ] On Choose a site, "Plan a landing" in the bar (or `/plan`, which leads there), "Try the example" then "Search 9 sites": the answer lists the sites that meet every requirement, each with its landing time in UTC and why it comes before the next; "Ranking and dates" states the rule and shows the best landing in each month (March to June 2027) at the first three sites, and a cell opens that landing in Explore. Check it at 390 px wide: no sideways scroll.
- [ ] Under More settings, set "Then rank by" to "Priorities: mostly Earth in view" and search again: the reasons give two scores and the main gain, and "Ranking and dates" gives each result's score and its three parts. Say "a preference between choices", never "a chance of success", and never call it AI or a trained model: it is the stated rule in `docs/recommendation-model.md`.
- [ ] On Explore, under Options, set "Then rank by" to a priority: the options show their scores, the better landing day follows the rule, and the address gains `rank=`; open that address in a fresh private window and check the ranking, the lander and the period came through.

## The night before

- [ ] Both laptops fully charged; chargers packed; HDMI and USB-C to HDMI adapters packed.
- [ ] Phone hotspot tested with the laptop (for the JPL re-check, if the venue Wi-Fi is down).
- [ ] Browser: kiosk or full-screen mode, zoom 100 % on the home page and the stand view (their layouts are measured at 100 %); 150 % on Explore, Compare, Accuracy and How it works if the back row cannot read them (spec 15.1). The browser keeps one zoom for the whole site, not per tab: Ctrl+Plus three times on Explore, Ctrl+0 before the stand view; bookmarks bar hidden, notifications off, screen saver and sleep off, night mode off.
- [ ] Open tabs in order: `/?demo=1` (home), `/sites?demo=1` (Choose a landing site), `/explore?site=de_gerlache_rim_2&demo=1` (Explore), `/compare?demo=1` (Compare sites), `/validate` (Accuracy), `/learn` (How it works), the recorded demo video. Demo mode is remembered per tab, so each tab needs its own `?demo=1`. Open the brief from Explore's "Printable brief" link rather than in a tab of its own: it keeps the tab's demo mode only that way.
- [ ] Project page draft, video and repository link ready to paste into the submission form.
- [ ] The OS's animations on (Windows: Settings, Accessibility, Visual effects, Animation effects; macOS: Reduce motion off). With reduced motion the home page's descent lands at once and Play is off on Explore and the stand view.

## Ten minutes before the pitch

- [ ] Plug into the projector; check 1080p output and that the text is readable from the back of the room.
- [ ] Reload `/?demo=1`; confirm the home page's descent draws (the Moon beside the title, never under it: scroll a little and it turns), "Fly to the south pole" plays it down to the pole and to de Gerlache Rim 2 in about 11 s, ending on the answer, then "Open the full forecast" opens Explore with the answer, the shadow map and the 3D terrain.
- [ ] In the home tab: Open the full forecast, then Stand at the site, then More, then Brighter picture; check the night at "Earth rises, 10 Jan" reads from the back of the room; Change, then Change date; reload `/?demo=1` in that tab (the setting survives the reload).
- [ ] On the stand view, with the speed button at 1×, press Play once from 1 January: it stops on "Sunset, 3 Jan" and turns to the Sun, then on "Battery runs out, 4 Jan" (the lander), then on "Earth rises, 10 Jan" (Earth), about 14 s in all; Pause, then back to the first hour with the slider's Home key. A drag stops the turning until the next Play.
- [ ] Ask one rehearsed question in "Ask in plain words" and confirm "rehearsed answer" appears under the reply.
- [ ] Luna (spec 22), in Chrome or Edge with the sound on: press Luna in the header (or the robot rabbit at the lower left), allow the microphone once, say "open the forecast" and hear "Opening the forecast." (her panel shows both lines as a chat); then "stop listening". Chrome's voice input needs the internet: with the Wi-Fi off her panel says so, and typing to her in the panel does the same. If she answers in the chat but not aloud, "Say replies aloud" at the foot of her panel is off (the browser remembers it from the last visit): turn it on.
- [ ] Period from 1 January 2027 for 30 days; Lander on "Small lander: 4 m² panel, uses 200 W, 2 kWh battery"; Compare emptied.
- [ ] Phone on silent; second laptop on the same page, lid open.
- [ ] The stand view's Easter egg (Rocky, opposite the lander) stays out of demo-mode tabs; to show it, use a tab without `?demo=1` and look round.

## During the pitch

- Speak to the audience, not the screen; the clicks are in the script.
- If a step fails, use the fallback in `docs/pitch.md` ("If something breaks") and keep going; never debug on stage.

## Submission (by 15 November, 23:59 local)

- [ ] Submit early in the afternoon, not at the deadline.
- [ ] Make the repository public (it was private on 14 November), or the judges cannot open the link.
- [ ] Project page: paste `docs/submission.md` sections into the form; fill the live URL, the video URL and the repository link, and settle its two "To confirm" statements.
- [ ] Confirm the AI-use and pre-existing-code disclosures are in the page.
- [ ] Push the final commits; tag the release `spaceapps-2026`.
