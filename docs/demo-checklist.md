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
- [ ] Browser: kiosk or full-screen mode, zoom 100 %, bookmarks bar hidden, notifications off, screen saver and sleep off, night mode off.
- [ ] Open tabs in order: `/?demo=1`, `/explore?demo=1`, `/compare?demo=1`, `/validate`, `/brief`, the recorded demo video.
- [ ] Project page draft, video and repository link ready to paste into the submission form.

## Ten minutes before the pitch

- [ ] Plug into the projector; check 1080p output and that the text is readable from the back of the room.
- [ ] Reload `/?demo=1`; confirm the landing page, then the de Gerlache card opens Explore with terrain.
- [ ] Ask the planner one rehearsed question and confirm "rehearsed answer" appears.
- [ ] Set the start date to 2027-01-01, 30 days, planner settings at defaults.
- [ ] Phone on silent; second laptop on the same page, lid open.

## During the pitch

- Speak to the audience, not the screen; the clicks are in the script.
- If a step fails, use the fallback in `docs/pitch.md` ("If something breaks") and keep going; never debug on stage.

## Submission (by 15 November, 23:59 local)

- [ ] Submit early in the afternoon, not at the deadline.
- [ ] Project page: paste `docs/submission.md` sections into the form; fill the live URL, the video URL and the repository link.
- [ ] Confirm the AI-use and pre-existing-code disclosures are in the page.
- [ ] Push the final commits; tag the release `spaceapps-2026`.
