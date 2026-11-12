# Earthrise

See when a Moon lander has sunlight and a signal. Earthrise compares landing sites and dates near
the Moon's south pole: for each one it works out, hour by hour, when the Sun clears the hills and
when Earth is in view for radio, and how long a solar lander keeps power there. NASA Space Apps
2026, challenge "CLPS Lunar Mission Browser", team Astroy/Ed.

Everything is computed in the browser from NASA data (LRO LOLA elevation grids, the JPL DE440
ephemeris), so the app also runs on a laptop without Wi-Fi.

## A tour of the pages

- **Home** (`/`): what the tool answers, in one real month. It opens with the arrival, by scrolling
  or in 21 seconds with "Fly to the south pole": the whole Moon with Earth beyond its south pole,
  the pole from 900 km, the polar cap and the ridge, then landing beside a lander at de Gerlache
  Rim 2 and its January sped up (the Sun sets behind a hill, the battery runs out, Earth rises too
  late, the Sun rises again), with the answer for the site. The forecast band
  shows the Sun and Earth over de Gerlache Rim 2 in January 2027 and what that means for a small
  lander. Three drawings explain why the south pole is hard (the Sun never climbs, the hills decide,
  Earth sets too). "Start from a real place" pairs a computed shadow picture of the ridge with three
  places to open: the ridge, and the Athena and Blue Ghost landers of March 2025, which open Explore
  at the first whole hour after each one landed. The page ends with the three checks against NASA, then the ways on: compare sites, ask in
  plain words, print the brief, run it offline.
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
  hour with the hills in each direction, the ground at the time bar's hour (three tabs: a north-up
  shadow map, the same light in 3D from above, and a horizon chart), and where the site lies with
  its nearest neighbours. The time bar at the bottom plays the period hour by hour. The period is 14,
  30 or 90 days from a date you choose; the Lander dialog offers three ready-made landers or your
  own panel, load, battery and mast. `/explore?site=&start=&days=` links to one forecast.
- **Stand on the Moon** (`/explore/stand`, "Stand at the site" on Explore): the view from the landing
  site, full window, for Explore's site, period and hour. NASA's ground out to 125 km, lit by the hour's
  Sun with the shadows worked out from those heights; the Sun small and white in a black sky; Earth
  from NASA's Blue Marble, turned for the hour; the real stars, placed for the site and hour (by day
  they show once you look up, away from the bright ground). A lander stands 16 m away, with rocks and
  small craters around you: these are drawn, not measured, and the view says so. A plate at the top
  gives the answer first (power, radio contact, the days without power), the next step under it and
  the lander's state for the hour at its foot; "More" opens today's card; the time bar below plays the period and carries flags for its key moments (the
  Sun going behind the hills, the battery running out, Earth coming into view, the Sun coming back).
  `?hour=` sets the hour and `?quality=fast` lightens the drawing for weaker graphics; without WebGL 2
  the horizon chart stands in, with the same words.
- **Compare sites** (`/compare`): up to four sites in one table for the same days and lander:
  sunlight, Earth in view, longest night and time with power (and when the power comes back), with a small Sun and
  Earth strip per site and one sentence naming the best site for each measure. Empty, it offers two
  ready pairs that show how much a few kilometres change.
- **Accuracy** (`/validate`): three checks, each with its pass mark, its headline figure and its
  full table on request: the Sun's and Earth's directions against JPL Horizons (with a live
  re-check), sunlight against NASA's LOLA illumination map, and predicted sunsets against how three
  real missions ended. All three checks pass. Also the error budget and the count of automated tests.
- **How it works** (`/learn`): the three drawings, the science behind them for a class (the Moon's
  small tilt, libration, how to read the charts, the battery sum) and five steps through the pages, then how to run it offline.
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

## Before you start: Node.js and npm

The app needs Node.js and npm and nothing else: its native parts (Tailwind, Next's compiler, the
image tools) come prebuilt for Windows, macOS and Linux, so npm needs no Python, Visual Studio or
other build tools. (The pipeline needs Python; see `pipeline/README.md`.)

1. Install Node.js 22, the version the team works on. Node 20.9 or later up to 26 works too: a
   clean install, the tests and the production build were checked on Node 20, 22, 24 and 26, with
   npm 10 and 11.
   - Windows: the installer from https://nodejs.org (the LTS one is fine), or with nvm-windows:
     `nvm install 22`, then `nvm use 22`.
   - macOS or Linux: `nvm install 22`; in `web/`, `nvm use` reads the version from `web/.nvmrc`.
2. Close every terminal and VS Code, open a new terminal, and check:

       node --version              # v22.x, or v20.9 to v26
       npm --version               # 10.x or 11.x

3. Install the app's packages in `web/`, never in the repository's root, which has no
   `package.json`:

       cd web
       npm ci

   `npm ci` installs exactly what `package-lock.json` lists: about 500 packages, in 15 to 30
   seconds on a good connection. `npm install` works too, but it can rewrite `package-lock.json`;
   commit that file only when you have added a package.

### When `npm ci` or `npm install` fails

- `ENOENT: no such file or directory, open '...\Trinity\package.json'`: you are in the
  repository's root. Run `cd web` and try again.
- `'npm' is not recognized` or `npm: command not found`: Node.js is not installed, or the terminal
  was opened before it was. Install it, then open a new terminal.
- PowerShell says `npm.ps1 cannot be loaded because running scripts is disabled on this system`:
  run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once, or use Command
  Prompt, or type `npm.cmd ci`.
- `npm warn EBADENGINE Unsupported engine`: a warning, not an error. Check that `node --version`
  is between v20.9 and v26.
- `ERESOLVE unable to resolve dependency tree`: run npm in `web/`, whose `.npmrc` sets
  `legacy-peer-deps` (npm's peer resolver stumbles on vitest 5's peers without it).
- `EPERM: operation not permitted` or `EBUSY: resource busy or locked` on Windows: another program
  holds the files. Stop `npm run dev`, close VS Code's terminals, pause OneDrive or move the clone
  out of a OneDrive folder (Desktop and Documents often are one) to a short path such as
  `C:\dev\Trinity`, then delete `node_modules` and run `npm ci` again.
- `ETIMEDOUT`, `ECONNRESET` or `self-signed certificate in certificate chain`: the network blocks
  or inspects npm's downloads, as campus Wi-Fi often does. Try a phone's hotspot, and check that
  `npm config get registry` prints `https://registry.npmjs.org/`.
- `Cannot find module '@tailwindcss/oxide-...'`, `lightningcss...node` or `@next/swc-...` when the
  app starts: `node_modules` came from another computer or from an install that was cut short.
  Delete it and run `npm ci` on this computer; never copy `node_modules` between computers.
- An error about a path that is too long, on Windows: clone to a short path such as
  `C:\dev\Trinity`, and run `git config --global core.longpaths true`.

A clean start, when nothing else helps (in `web/`):

    # PowerShell
    Remove-Item -Recurse -Force node_modules
    npm cache verify
    npm ci

    # macOS, Linux or Git Bash
    rm -rf node_modules && npm cache verify && npm ci

Then `npm run dev` and open http://localhost:3000. Until the data files are in `web/public/data`
(next section), the pages that need them say "The data could not be loaded." and, in development,
name the command that copies them; the home page's words still show.

## Run it

The pipeline turns NASA data into the files the app reads; the commands are in
`pipeline/README.md` (the elevation tiles alone are about 240 MB). Then copy them into the app and
start it:

    cd pipeline
    uv sync
    uv run python -m lunar_pipeline.cli sync-local --tiles
    cd ../web
    npm ci
    npm run dev                 # http://localhost:3000

For the venue laptop, build once and serve the build with the Wi-Fi off: `npm run build` then
`npm start`, and open `http://localhost:3000/?demo=1`. The JPL re-check on the Accuracy page needs
the internet; without it the page keeps the stored comparison and says so.

Tests: `npx vitest run` in `web/` and `uv run pytest -q` in `pipeline/`; tests that need the large
data files skip when they are missing.

## Hosting

The app deploys to Vercel (root `web/`); the data files are published to a Cloudflare R2 bucket with `uv run python -m lunar_pipeline.cli publish-r2` and fetched from `NEXT_PUBLIC_DATA_BASE`. Steps, environment variables, CORS, the offline venue mode and a go-live checklist are in `docs/hosting.md`.
