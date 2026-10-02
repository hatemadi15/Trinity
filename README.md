# Earthrise

See when a Moon lander has sunlight and a signal. Earthrise compares landing sites and dates near
the Moon's south pole: for each one it works out, hour by hour, when the Sun clears the hills and
when Earth is in view for radio, and how long a solar lander keeps power there. NASA Space Apps
2026, challenge "CLPS Lunar Mission Browser", team Astroy/Ed.

Everything is computed in the browser from NASA data (LRO LOLA elevation grids, the JPL DE440
ephemeris), so the app also runs on a laptop without Wi-Fi.

## A tour of the pages

- **Home** (`/`): what the tool answers, in one real month. The forecast band shows the Sun and
  Earth over de Gerlache Rim 2 in January 2027 and what that means for a small lander. Three
  drawings explain why the south pole is hard (the Sun never climbs, the hills decide, Earth sets
  too). "Start from a real place" pairs a computed shadow picture of the ridge with three places to
  open: the ridge, and the Athena and Blue Ghost landers of March 2025, which open Explore at the
  first whole hour after each one landed. The page ends with the three checks against NASA.
- **Choose a landing site** (`/sites`): the 19 places in the catalogue (the nine Artemis III
  candidate regions, the landing spots of three commercial landers, and high points and crater
  floors), sorted by how long a lander keeps power from its best landing day in the chosen period,
  with their sunlight and contact with Earth, on a relief map of the pole. Any other point south of
  60° S can be worked out in the browser.
- **Explore** (`/explore`): the answer for one site and one landing date, first. "Landing at de
  Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night", with the reason, the time
  Earth is in view while the lander has power, a better landing day inside the period ("Land on 20
  January instead") or a better place nearby, and a search of the next 12 months. Below it: the
  numbers (every figure under "All numbers"), a chart of the Sun, Earth and the battery hour by
  hour with the hills in each direction, the ground at the time bar's hour (a north-up shadow map,
  the same light on the terrain in 3D, and the view all round), and where the site lies with its
  nearest neighbours. The time bar at the bottom plays the period hour by hour. The period is 14,
  30 or 90 days from a date you choose; the Lander dialog offers three ready-made landers or your
  own panel, load, battery and mast. `/explore?site=&start=&days=` links to one forecast.
- **Compare sites** (`/compare`): up to four sites in one table for the same days and lander:
  sunlight, Earth in view, longest night and time with power (and when the power comes back), with a small Sun and
  Earth strip per site and one sentence naming the best site for each measure. Empty, it offers two
  ready pairs that show how much a few kilometres change.
- **Accuracy** (`/validate`): three checks, each with its pass mark, its headline figure and its
  full table on request: the Sun's and Earth's directions against JPL Horizons (with a live
  re-check), sunlight against NASA's LOLA illumination map, and predicted sunsets against how three
  real missions ended. Also the error budget and the count of automated tests.
- **How it works** (`/learn`): the three drawings, the science behind them for a class (the Moon's
  small tilt, libration, how to read the charts, the battery sum) and five steps through the pages.
- **The brief** (`/brief`): one printable page with Explore's answer, five numbers, the Sun's and
  Earth's rows over the period, the lander, the method and the data, and an optional narrated
  paragraph checked number by number against the figures.
- **Ask in plain words** (on Explore and Compare): an assistant that turns a typed question
  ("Compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days", "Find the best landing date for 14
  days", "Explain the longest night") into the same controls a person would use. It never computes
  a number itself, and every answer says where it came from: a model on OpenRouter's free tier, a
  rehearsed answer, or a matched phrase. `?demo=1` uses the rehearsed answers only, for the pitch.

## Repository

- `pipeline/`: the offline Python pipeline (NASA SPICE kernels, LOLA elevation grids and
  illumination maps), the reference implementation of the science; it writes `data/`.
- `web/`: the Next.js app with the TypeScript engine, pinned to the pipeline by golden fixtures.
- `data/`: the committed outputs (the site catalogue, the hourly Sun and Earth table, the horizon
  masks of the catalogue sites, the validation tables and the golden fixtures).
- `docs/`: method notes, data credits, hosting, the submission and pitch drafts, the design spec
  and the implementation plans.

## Run it

The pipeline turns NASA data into the files the app reads; the commands are in
`pipeline/README.md` (the elevation tiles alone are about 240 MB). Then copy them into the app and
start it:

    cd pipeline
    uv sync
    uv run python -m lunar_pipeline.cli sync-local --tiles
    cd ../web
    npm install
    npm run dev                 # http://localhost:3000

For the venue laptop, build once and serve the build with the Wi-Fi off: `npm run build` then
`npm start`, and open `http://localhost:3000/?demo=1`. The JPL re-check on the Accuracy page needs
the internet; without it the page keeps the stored comparison and says so.

Tests: `npx vitest run` in `web/` and `uv run pytest -q` in `pipeline/`; tests that need the large
data files skip when they are missing.

## Hosting

The app deploys to Vercel (root `web/`); the data files are published to a Cloudflare R2 bucket with `uv run python -m lunar_pipeline.cli publish-r2` and fetched from `NEXT_PUBLIC_DATA_BASE`. Steps, environment variables, CORS, the offline venue mode and a go-live checklist are in `docs/hosting.md`.
