# Demo checklist — Earthrise at the Beirut event (14–15 November 2026)

## The week before

- [ ] Feature freeze on 8 November; only bug fixes after.
- [ ] Offline build on both laptops: from `pipeline/` run `uv run python -m lunar_pipeline.cli sync-local --tiles`; from `web/` run `npm run build` and `npm start`; open `http://localhost:3000/?demo=1` with Wi-Fi off and walk the whole pitch.
- [ ] Copy the data zip (see `docs/hosting.md`, GitHub Release) to a USB stick as the third copy.
- [ ] Record the full demo (screen recording of the pitch, 5 minutes) as the backup; keep it on both laptops.
- [ ] Record the 30-second video v1 (`docs/video-storyboard.md`).
- [ ] Rehearse the pitch five times against the clock (`docs/pitch.md`); log the times.
- [ ] Test the live URL on a phone and on a laptop you did not develop on.
- [ ] Refresh the validation tables (`validate`, `sync-local`) and the test badge (`npm run validation:tests`); update the numbers in `docs/submission.md`.

## The night before

- [ ] Both laptops fully charged; chargers packed; HDMI and USB-C to HDMI adapters packed.
- [ ] Phone hotspot tested with the laptop (for the JPL re-check, if the venue Wi-Fi is down).
- [ ] Browser: kiosk or full-screen mode, zoom 100 % on the home page and the stand view (their layouts are measured at 100 %); 150 % on Explore, Compare, Accuracy and How it works if the back row cannot read them (spec 15.1; Ctrl+0 resets); bookmarks bar hidden, notifications off, screen saver and sleep off, night mode off.
- [ ] Open tabs in order: `/?demo=1` (home), `/sites?demo=1` (Choose a landing site), `/explore?site=de_gerlache_rim_2&demo=1` (Explore), `/compare?demo=1` (Compare sites), `/validate` (Accuracy), `/learn` (How it works), the recorded demo video. Demo mode is remembered per tab, so each tab needs its own `?demo=1`. Open the brief from Explore's "Printable brief" link rather than in a tab of its own: it keeps the tab's demo mode only that way.
- [ ] Project page draft, video and repository link ready to paste into the submission form.

## Ten minutes before the pitch

- [ ] Plug into the projector; check 1080p output and that the text is readable from the back of the room.
- [ ] Reload `/?demo=1`; confirm the home page's arrival draws (the Moon from space, not its still: scroll a little and it moves), "Fly to the south pole" plays it to landing and through the month at the site in about 21 s, then "Open the full forecast" on de Gerlache Rim 2 opens Explore with the answer, the shadow map and the 3D terrain.
- [ ] In the Explore tab open "Stand at the site", turn on Brighter picture under More (kept for that tab), check that the night at the flag "Earth rises, 10 Jan" reads from the back of the room, then "Change date" back to the forecast.
- [ ] Ask one rehearsed question in "Ask in plain words" and confirm "rehearsed answer" appears under the reply.
- [ ] Period from 1 January 2027 for 30 days; Lander on the small ready-made one (4 m² panel, 200 W, 2 kWh battery); Compare emptied.
- [ ] Phone on silent; second laptop on the same page, lid open.

## During the pitch

- Speak to the audience, not the screen; the clicks are in the script.
- If a step fails, use the fallback in `docs/pitch.md` ("If something breaks") and keep going; never debug on stage.

## Submission (by 15 November, 23:59 local)

- [ ] Submit early in the afternoon, not at the deadline.
- [ ] Project page: paste `docs/submission.md` sections into the form; fill the live URL, the video URL and the repository link.
- [ ] Confirm the AI-use and pre-existing-code disclosures are in the page.
- [ ] Push the final commits; tag the release `spaceapps-2026`.
