# 30-second video storyboard — Earthrise

Global judges see the project page, the demo link and this video. No voice-over: captions only, so it reads with the sound off. Record the app at 1360×900 in a clean browser window (kiosk mode, no bookmarks bar), 1080p output, 30 fps, screen capture with OBS or the OS recorder; add captions and cuts in a simple editor. The first 15 seconds are the home page's arrival down to landing, the flight that "Fly to the south pole" plays in exactly that time before the month at the site; they are captured frame by frame through its capture hook rather than screen-recorded (see the notes). Two iterations are planned: v1 by 8 November, v2 after the rehearsals.

| Time | Shot | On screen | Caption |
|---|---|---|---|
| 0–3 s | The whole Moon | The arrival's first frames: the whole Moon with Earth just beyond its south pole, both labelled; the camera closes in over the pole | "Every south-pole landing site lives or dies by two questions." |
| 3–8 s | Over the pole | Straight down on the pole from 900 km, lit from the side by the low Sun, its pointer at the edge; then down towards the polar cap | "At the south pole the Sun never climbs: it circles the horizon once a month." |
| 8–15 s | Down to the ridge, then standing | The polar cap from 90 km, lit from the side, the pole and de Gerlache Rim 2 labelled; the ridge from 2 km, the site labelled; then down beside the lander, the small white Sun just over the hills with its label ("Sun 2.4° up"), its path for the month and the date bar at the top | "One hill can hide it for weeks." then, from 11.5 s, "When is the Sun up? When can Earth hear you?" |
| 15–21 s | A better place, then Compare | `/explore` on de Gerlache Rim 2: click "Explore de Gerlache rim summit" under the answer: "power for all 30 days" in green; cut to `/compare` with the two sites in the table and the sentence naming the best site for each measure | "Twelve kilometres decide. Compare sites, find the best landing day." |
| 21–26 s | Assistant and brief | Type "explain the longest night" in "Ask in plain words"; the answer appears with its source line; cut to `/brief` printing to one page | "Ask in plain words. Print the brief. Every number checked against NASA." |
| 26–30 s | Logo card | "Earthrise" wordmark, then a line of data credits, then the URL | "NASA LRO LOLA. JPL DE440 and Horizons. Runs in your browser." then the live URL |

## Notes for the recording

- Use `?demo=1` so the assistant answers instantly from the rehearsed transcripts.
- Shots 1 to 3 are the arrival, captured frame by frame so every frame is sharp. On the demo laptop (discrete graphics), serve the production build (`npm run build`, then `npm start`) and open `/?arrival=0&bare=1` in a 1920×1080 view: `?arrival=` holds the flight at a progress from 0 to 5, and `&bare=1` leaves the page's words out (the captions carry them). Let the page finish loading so the measured ground is in, scroll the arrival to the top of the window (the scroll no longer moves the flight) and wait until `window.__arrival` exists. For each of the 450 frames (15 s at 30 fps), set the progress Play reaches at that time with `window.__arrival.setProgress(p)` (`playProgress` in `web/src/lib/sky/arrivalTiming.ts`: 3, 3.5, 2, 3 and 3.5 seconds from stop to stop), await `window.__arrival.sharp()`, which resolves once that frame is drawn at full sharpness, then screenshot the stage. Join the frames at 30 fps.
- For shot 4, open Explore with "Open the full forecast" on the arrival's answer (or the home page's de Gerlache Rim 2 place), so the period is 30 days from 1 January 2027 and the lander is the small default one, and add de Gerlache rim summit and de Gerlache Rim 2 to Compare beforehand (the ready pair "A ridge and the summit 12 km away" does it in one click).
- Keep the mouse out of frame between actions; move it only for the click that the caption describes.
- Captions: white on a dark band, one line, 44 px; hold each at least two seconds.
- Export at 1920×1080, H.264, under 50 MB; check it plays on a phone with the sound off.

## v2 changes after rehearsal

Fill in what the rehearsal audience missed (which caption needed more time, which shot was unclear) and cut v2 with those changes.
