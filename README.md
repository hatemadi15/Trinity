# Earthrise

See when a Moon lander has sunlight and a signal. Earthrise compares landing sites and dates near
the Moon's south pole: for each one it works out, hour by hour, when the Sun clears the hills and
when Earth is in view for radio, and how long a solar lander keeps power there. NASA Space Apps
2026, challenge "CLPS Lunar Mission Browser", team Astroy/Ed.

Everything is computed in the browser from NASA data (LRO LOLA elevation grids, the JPL DE440
ephemeris), so a laptop prepared with the data and a build runs it with no network at all; the
hosted site needs one ([Run it offline](#run-it-offline-demo-mode)).

## A tour of the pages

- **Home** (`/`): what the tool answers, in one real month. It opens with the descent, by scrolling
  or in 11 seconds with "Fly to the south pole": the whole Moon, beside the title and never under
  it, with Earth beside it, turns, tips its south pole towards you and comes closer, down to the
  500 km relief map of the pole and to de Gerlache Rim 2's 20 km shadow picture, with the answer for
  the site; a rail at the side jumps to any stage. Then five numbered sections: 01 the Sun and Earth
  over de Gerlache Rim 2 in January 2027, read in three steps and hour by hour under the pointer,
  and what that means for a small lander; then on paper, 02 three drawings of that month that play
  and explain why the south pole is hard (the Sun never climbs, the hills decide, Earth sets too).
  03 "Start from a real place" pairs a computed shadow picture of the ridge with three
  places to open: the ridge, and the Athena and Blue Ghost landers of March 2025, which open Explore
  at the first whole hour after each one landed. 04 gives two checks against NASA and one real
  mission as context, and says that a third, where shadows fall in pictures from orbit, misses its
  own mark; 05 gives the ways on: compare sites, ask in plain words, print the brief, run it
  offline.
- **Choose a landing site** (`/sites`): the 34 places in the catalogue (the nine Artemis III candidate regions, the landing
  spots of three commercial landers and two coming ones, the six Apollo landings, the landers of
  India, China and Japan and Luna 25's target, and high points and crater floors), each marked with
  what kind of point it is (a lander found in orbital images, a landing target, a region's centre
  with its radius, a derived high point never checked for landing, or a reference); Chang'e 4,
  Chang'e 6 and CP-12's basin, on the far side, sit under a heading of their own: Earth never rises
  there, sorted by how long a lander keeps power from its best landing day in the chosen period (a site whose elevation map
  is incomplete comes after the others, marked, and is never named best),
  with their sunlight and contact with Earth, on a relief map of the pole. Any other point south of
  60° S can be worked out in the browser.
- **Explore** (`/explore`): the answer for one site and one landing date, first. "Landing at de
  Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night", with the reason, how sure its
  times are ("Times ±8 h", one tap away), the time
  Earth is in view while the lander has power, a better landing day or a better place nearby, ranked against
  mission requirements you can set and then by the longest time with power, or by priorities you choose
  under "Then rank by" (balanced, mostly power, mostly Earth in view, mostly shorter gaps, or your own
  weights, weighed by the stated rule in [docs/recommendation-model.md](docs/recommendation-model.md)), with
  every option's checks, trade-offs, score and reason under "Options", and the places nearby saying when
  they are still being worked out or which were left out and why; a search of the next 12 months every 6 hours; and, for a region centre known to about
  5 km, the same result at 8 points round it. Below it: the
  numbers, with the Sun's height at the time bar's hour and its highest (every figure under "All numbers"), a chart of the Sun,
  Earth and the battery hour by hour with the hills in each direction, the radio windows (each
  stretch with Earth in view, in UTC, which of them the lander has power for, and the longest time
  without Earth: geometric visibility, not a scheduled contact), every landing day of the
  next 12 months (a calendar coloured by power, then radio contact, the order the best-date search
  uses by default; pressing a day lands the period there; Luna opens it with "show me the year"), the ground at the time bar's hour (three tabs: a north-up
  shadow map, the same light in 3D from above, and a horizon chart), and where the site lies with
  its nearest neighbours. The time bar at the bottom plays the period hour by hour and counts down to the next sunset or
  sunrise and to Earth's next rising or setting. The period is a landing date and hour in UTC (whole hours, as the Sun and Earth table
  is hourly) and a length of 2 to 90 days, with steps of an hour and a day either way and a shift by
  any number of days or hours ("our landing slipped by five days"); the Lander dialog offers three
  ready-made landers or your own panel, load, battery and mast. A new mast height works out the hills again for every
  site shown, and each page says which sites are still waiting. Explore's address is its share link: `/explore?site=&start=&days=` (for example
  `start=2027-01-20T17:00&days=7`) plus every setting that differs from the defaults (`panel`, `facing`,
  `area`, `efficiency`, `load`, `battery`, `charge`, `mast`, `earthmin`) and any requirements you set (`minpower`, `earthby`, `maxgap` and
  `mincontact` in hours, `minhold` in percent of terrain versions), then the ranking when it is not the default (`rank=balanced`, `power`, `contact`, `gap`, or three
  weights such as `rank=1,7,3`), so a reload or a copied link opens the same figures and the same better date in any browser. Share, on the numbers card, copies it and downloads the
  figures: hour by hour, all numbers and the radio windows as CSV, with the settings, versions and
  sources in a JSON file beside them.
- **Stand on the Moon** (`/explore/stand`, "Stand at the site" on Explore): the view from the landing
  site, full window, for Explore's site, period and hour. It opens with the lander coming down in
  front of you (an eased descent, its plume and dust, touchdown), except with reduced motion. NASA's ground out to 125 km, lit by the hour's
  Sun with the shadows worked out from those heights; the Sun small and white in a black sky; Earth
  from NASA's Blue Marble, turned for the hour; the real stars, placed for the site and hour (by day
  they show once you look up, away from the bright ground). A lander stands 16 m away, with rocks and
  small craters around you: these are drawn, not measured, and the view says so. A plate at the top
  gives the answer first (power, radio contact, the days without power), the next step under it and
  the lander's state for the hour at its foot; "More" opens today's card, which counts down to the next sunset or sunrise and to Earth's next
  rising or setting; the time bar below plays the period at a day a second (2× and 4× on its speed button), stops on each
  of its key moments and turns the view there (the Sun going behind the hills, the battery running out,
  Earth coming into view, the Sun coming back), which show as dots on the bar, and Next steps to them.
  `?hour=` sets the hour and `?quality=fast` lightens the drawing for weaker graphics; without WebGL 2
  the horizon chart stands in, with the same words.
- **Compare sites** (`/compare`): a baseline and up to three scenarios, each with its own site, UTC
  landing hour, stay, lander, mast and Earth clearance, worked out on its own. "Compare from here"
  under Explore's answer makes the landing shown the baseline; each scenario can be slipped (five
  days later in one press), given a nearby alternative (the best catalogue site within 30 km for its
  own settings) or changed. The page says what changed at the original site and why, which
  alternative works better and the trade-offs, then gives every setting and figure side by side
  with the signed change from the baseline, and says when the scenarios share a landing time. The
  address carries the whole comparison; scenario files save and reopen one or many with the app and
  data versions; `/compare/brief` prints it. With requirements set, a row checks every
  scenario against them (one tap shows each with its margin); the comparison's address, its brief and its
  files carry them. Empty, it offers the five-day slip at de Gerlache Rim 2
  and two ready pairs.
- **Terrain versions** (on Explore, Compare, the brief and Accuracy): NASA's two generations of
  south-pole maps, made from the same laser shots, differ by about 1.4 m, 6 to 14 times the error the
  newer one states, grid by grid. Earthrise fits an error model to those differences and draws 32
  versions of the ground at each of the 21 polar sites, each traced to a skyline with the pipeline's
  own code. On Explore, a fold beside the margins shows how the landing's time with power, first
  sunset, longest night and contact with Earth move across the versions, and in how many it still
  meets your requirements. Compare shows it per scenario (one tap on the row's name), the brief
  prints it, and the Accuracy page explains the fit and its limits. A requirement can ask that a
  choice hold in at least N % of versions, and the margins now include the versions' spread. A share
  of versions is not the chance a landing works.
- **Modelled cold traps** (on Explore, the brief, the site list and the shadow map): beside the power
  and radio results of each polar site south of 80° S, Explore, the brief and the site list say how
  much ground within 5 km stays below 110 K all year in NASA's Diviner temperature model, how far the
  nearest is and how steep the straight way there; the shadow map can show that ground as a layer.
  These are modelled conditions where ice could last, not a finding of ice (How it works explains).
  To rebuild: `cd pipeline && uv run python -m lunar_pipeline.cli coldtraps` (it downloads the
  117 MB Diviner zip into `data_raw/diviner` the first time), then `manifest` and `sync-local`.
  Method and figures: `docs/method.md`, "Modelled cold traps".
- **Accuracy** (`/validate`): five kinds of evidence, each saying what it shows, what it was tested
  on and what it leaves out, with its full table on request. Four are checks with a pass mark: the
  Sun's and Earth's directions against JPL Horizons (with a live re-check), sunlight and Earth in
  view against NASA's LOLA illumination maps worked out the maps' way (from the ground, any part of
  the disc, hourly over 18.6 years, 60 m terrain), the app's shadows laid over 20 pictures from
  LRO's cameras at seven featured sites, at the moment each was taken (92 % of the ground called
  alike in the typical picture), and the power and battery sums against worked answers, run in the
  browser. The shadows check misses its own mark: 17 of the 20 pictures meet it; the three that do
  not were all taken with the Sun 1.1° up or less, and in them the app puts a fifth to a quarter of
  the ground the camera saw lit in shadow. The fifth kind of evidence, predicted sunsets beside how
  three real missions ended, is context, not a check. The page opens with "Three of four checks meet
  their criteria; past missions are context, not a check." Then how sure the times are: the margin
  each event carries at four kinds of site, measured against one-minute steps, NASA's adjusted
  south-pole maps (PGDA product 90) and their terrain versions, and JPL Horizons, with each source
  apart and the ground at each site; then the terrain versions themselves (the error model's fit,
  what the versions show and what they cannot show); then the error budget and the automated tests'
  last run: what passed, was skipped and failed, when, on which commit and with which data.
- **How it works** (`/learn`): the three drawings, the science behind them for a class (the Moon's
  small tilt, libration, how to read the charts, the battery sum) and five steps through the pages, then how to run it offline.
- **The brief** (`/brief`): one printable page with Explore's answer, five numbers, the Sun's and
  Earth's rows over the period, each of its times with its measured margin, the lander and what its
  power figures assume (electrical energy only, not keeping warm through the night or starting
  again), the method, the ground at the site and the data, the settings, sources and versions behind the figures (every
  setting, the period in UTC, the skyline and its LOLA grids and mast, the ephemeris and its span,
  the app's commit and the data version), what the figures take as given, the link that opens them
  again, and the same downloads as Explore; its address opens the same brief in any browser, and an optional narrated paragraph checked claim by claim against the figures
  (each number on its measure, unit, site and sign, and no cause or survival claim the figures do
  not give); when it fails, the app's own paragraph stands and the page says what did not match.
- **Ask in plain words** (on Explore and Compare): an assistant that turns a typed question
  ("Compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days", "Find the best landing date for 14
  days", "Explain the longest night") into the same controls a person would use. It never computes
  a number itself, and every answer says where it came from: a model on OpenRouter's free tier, a
  rehearsed answer, or a matched phrase. `?demo=1` uses the rehearsed answers only, for the pitch.
- **Luna** (the "Luna" button in the header, or the robot rabbit at the lower left of every page, and in the row of the view from the site): a voice
  assistant, off until you turn it on. Say what you want to see ("open the view from the site",
  "play", "next", "turn to Earth", "compare de Gerlache Rim 2 and Nobile Rim 2 for fourteen days", "compare with a five-day delay",
  "dark mode") and she does it and answers aloud; she knows the site names as speech tends to write
  them. She uses the browser's own speech recognition: Chrome and Edge send the sound to their
  makers' servers, so voice needs the internet there, and Firefox has none. Her panel is a chat that
  keeps the conversation from page to page; it always takes typed words, its microphone button
  pauses and restarts the listening, and its "Say replies aloud" switch (on at first, remembered in the
  browser) keeps her answers to the chat when off; "be quiet" and "speak again" do the same by voice.
  What she does not know goes to the same assistant as "Ask in plain words".
  The code is in `web/src/lib/luna` and `web/src/components/luna`.
- **Plan a landing** (`/plan`, "Plan a landing" in the header): say or type what the mission needs,
  for example "at least five days of power, Earth in view when we land, no radio gap longer than three
  days, a 300 W load and a 3 kWh battery, landing between March and June 2027, near the Artemis III
  regions". The planner shows what it heard as fields you can change, then tries every site and every
  hour of the window with the app's own engine. It ranks the landings that meet every requirement
  first and gives each one's landing time (UTC), its margins, why it ranks above the next, and how
  sure it is; the result is the best among the sites and times tried, under those settings. After the
  requirements it ranks by the longest time with power (the default), the most Earth contact while
  powered, the earliest landing, or your priorities, by the same rule as Explore. "Ranking and dates"
  states the rule, gives each result's score and its three parts when ranked by priorities, and the
  best landing in each month of the window (each week of a short one) at the first three sites, each
  opening that landing in Explore: several sites against the dates, which the year view of one site
  does not show. "Plan this landing" sets Explore; "Compare these sites" opens them as scenarios. Luna
  does the same by voice: say "plan a landing", then the specification, then "search".

## The challenge

Earthrise answers NASA Space Apps 2026's "CLPS Lunar Mission Browser" challenge. The brief, as NASA
wrote it:

<details>
<summary>The challenge brief, in full</summary>

Missions to the Moon’s south pole face extreme lighting and communication constraints, and planning
them takes careful coordination between science and engineering teams. Tools for determining Sun and
Earth positions at candidate landing sites exist, but their complicated interfaces make it difficult
to evaluate critical information with efficiency. Your challenge is to create an intuitive tool or
application that lets mission planners, educators, and the public compare landing sites and dates
quickly, visualizing Sun and Earth positions relative to the horizon to assess power generation
potential and direct-to-Earth communication windows.

**Background**

NASA’s Commercial Lunar Payload Services (CLPS) program and other lunar missions depend on careful
selection of landing sites and dates that balance the needs of both science and engineering teams.
One of the most significant challenges in this process is understanding the local lighting and
communication environment at a potential landing site. The position of the Sun determines power
availability for solar arrays and thermal conditions for equipment, while the position of Earth
determines whether direct communication is possible without relay satellites.

This challenge is particularly acute at the Moon's south pole, where many future missions are
planned due to the presence of water ice and other scientifically valuable resources. The south
pole's geometry creates extreme variations in solar illumination and Earth visibility across
different lunar days and seasons. Small changes in landing location or date can dramatically affect
both power generation potential and communication windows, making rapid site evaluation critical.

In practice, mission development rarely proceeds on a fixed timeline. Hardware development
challenges, launch delays, or other factors often force mission planners to reconsider their
original landing date and location. When this happens, engineers need to quickly evaluate
alternative sites in the same region, or alternative dates at the same site, to understand how these
changes impact mission feasibility. A tool that enables rapid, intuitive comparison of multiple
scenarios would accelerate this decision-making process and help teams identify viable alternatives
when constraints shift.

Tools that provide this information — such as NASA's Quickmap, Moon Trek, and the JPL Horizons
System — are built for detailed analysis and are often difficult for non-specialists to use
effectively for rapid scenario comparison. Evaluating each site-data combination means navigating
multiple interfaces and interpreting raw data. This leaves a gap between the technical data
available and the accessible tools needed to support agile mission planning. An intuitive interface
that translates complex ephemeris and topographic data into clear, comparable visualizations could
help bridge that gap.

**Objectives**

Your challenge is to create a tool or application that enables rapid evaluation of lunar landing
site options. Your solution may include:

- Interactive site selection and comparison: You may consider allowing users to choose from a
  curated list of notable landing sites – such as past Apollo missions, future CLPS mission targets,
  targets of other commercial lunar missions, or landing sites from other countries' lunar programs –
  as well as the ability to input custom lunar coordinates. You may also consider enabling
  side-by-side or sequential comparison of multiple sites to help users quickly assess trade-offs.
- Date and time flexibility: You may consider allowing users to select landing dates and times, and
  providing tools to explore how conditions change across different lunar days or seasons. This
  enables users to understand how mission schedule adjustments affect feasibility.
- Sun and Earth position visualization: Display the positions of the Sun and Earth relative to the
  horizon at a selected landing site on a chosen date. You may consider showing how much time
  remains before sunset or Earthset, as this directly impacts mission operations and power
  generation windows.
- Power and communication assessment: You may consider highlighting key metrics such as solar
  elevation angle (which affects power generation efficiency), duration of sunlight, and Earth
  visibility windows. These metrics help mission planners quickly assess whether a site-date
  combination is viable.
- Multiple visualization approaches: You may explore 2D maps, 3D surface visualizations, or other
  creative representations that help users understand the spatial relationships between the landing
  site, Sun, and Earth.
- Temporal dynamics: You may consider creating animations or timeline views that show how Sun and
  Earth positions change over a lunar day or across multiple days, helping users understand the
  duration and timing of operational windows.
- Accessibility across skill levels: Your tool could serve mission planners seeking detailed
  technical information for rapid decision-making, as well as educators and the general public
  curious about why the Moon presents such distinct engineering challenges.

You are encouraged to be creative in how you present this information. Your solution might be a web
application, a mobile app, an interactive visualization, an educational game, or another format
entirely — as long as it makes rapid site evaluation clear and efficient.

**Potential Considerations**

You may (but are not required to) consider the following:

Technical approach:

- Ephemeris data – the positions and motions of celestial bodies – can be calculated using tools
  like the JPL Horizons System, or you may consider using pre-computed datasets.
- Lunar topography data from sources like the Lunar Orbiter Laser Altimeter (LOLA) can help create
  realistic surface visualizations and accurate horizon calculations.
- Consider how to handle the Moon's lack of atmosphere when calculating horizon positions. Without
  atmospheric refraction, the horizon is determined by local terrain and the edge of the lunar
  sphere as seen from the landing site.
- Solar elevation angle is a key metric for power generation, and you may consider calculating and
  displaying this prominently.

User experience:

- Your interface could prioritize rapid scenario comparison, allowing mission planners to evaluate
  multiple site-date combinations efficiently.
- Consider how to clearly communicate time remaining before sunset or Earthset, as this is critical
  operational information.
- Think about how to make the extreme differences between lunar and terrestrial conditions
  apparent—they can be compelling when visualized effectively.
- You may consider features that help users understand why small location or date changes have
  large impacts on mission feasibility.

Data and accuracy:

- Consider accounting for the Moon's actual topography, as terrain elevation can significantly
  affect horizon positions and visibility windows.
- Consider whether your tool will account for factors like Earth's libration (wobble) or the Moon's
  orbital variations.
- South pole terrain is particularly complex, and you may consider how to represent steep slopes and
  deep craters that create extreme shadow conditions.

Engagement and impact:

- Your solution could support mission planners in coordinating between science and engineering
  teams during mission development.
- It could help teams respond quickly when schedule changes or hardware development challenges
  require landing date or location adjustments.
- It could also serve as an educational tool to help students and the public understand lunar
  exploration challenges and why mission planning is so complex.

For data and resources related to this challenge, refer to the Resources tab at the top of the
page. More resources may be added before the hackathon begins.

</details>

### How Earthrise answers it

| The brief asks for | How Earthrise answers it |
|---|---|
| Site selection and comparison | A catalogue of 34 places: the south pole's nine Artemis III candidate regions, crater-rim high points and floors, three CLPS landers that landed and two coming ones, the six Apollo landings, and the landers of India, China and Japan and Luna 25's target, each saying what kind of point it is (surveyed, a target, a region's centre with its radius, or a derived high point never checked for landing), with the polar ones on a relief map of the pole; and any other point south of 60° S worked out in the browser from LOLA heights. Compare puts a baseline and up to three scenarios side by side, each with its own site, landing hour, stay and lander, with the change from the baseline: the original landing, the same site five days later and a nearby alternative, in three presses. |
| Dates and times | Any landing date and hour (UTC) the ephemeris covers (2024 to 2036), for 2 to 90 days, with steps and shifts by hours or days; a better landing day inside the period and a search of the next 12 months, both ranked by any requirements you set and then by the longest time with power from landing (ties: Earth contact while powered) or by priorities you choose, weighed by a stated rule; the planner's months of the window for its best sites; and a year at a glance: every landing day of the next 12 months coloured by power and radio contact, one press to land on it. |
| The Sun and Earth against the horizon | A horizon chart with the hills in every direction and the Sun's and Earth's paths over them; the view from the site in 3D (NASA's ground out to 125 km, the Sun, Earth turned for the hour, the stars); the time bar stops on the key moments (the Sun going behind the hills, the battery running out, Earth coming into view, the Sun coming back) and counts down to the next sunset or sunrise and to Earth's next rising or setting. |
| Power and communication | Time with power from a battery model, with three ready-made landers or your own panel, load, battery and mast; the Sun's height above the horizon at any hour and its highest; hours of sunlight; the radio windows with their UTC times, which of them the lander has power to use, and the longest time without Earth (geometric direct-to-Earth visibility, not a booked antenna); the longest night; every figure under "All numbers". |
| Several ways to see it | A relief map of the pole, a north-up shadow map and the same light in 3D from above, the horizon chart, an hour-by-hour chart of the Sun, Earth and the battery, the view from the site, and the descent from the whole Moon on the home page. |
| Time and change | The time bar plays the period hour by hour at a day a second (2× and 4× on its speed button), with dots for the key moments and Next to step between them; the chart and every view follow it. |
| Every skill level | Plain words first and every number a click away; a Learn mode with a guided story for classes; the printable brief; an assistant for typed questions and Luna for spoken ones; keyboard use, phone layouts, light and dark themes, and an offline mode for the venue. |
| Ephemeris data | The Sun's and Earth's positions are pre-computed hourly for 2024 to 2036 from JPL's DE440 ephemeris with NASA's SPICE toolkit, in the Moon's own frame (MOON_ME), and checked against JPL Horizons on the Accuracy page; every event time carries a measured margin (hourly steps, terrain and ephemeris kept apart, the terrain part taking 32 terrain versions at the polar sites). |
| Topography and the horizon | LOLA elevation grids at 20, 80 and 240 m per pixel. The horizon is the terrain itself over the curved Moon, with no atmosphere to bend the light. |
| Libration | The ephemeris carries the Moon's real orientation, so Earth wanders in the sky over the month and the year; How it works explains why. |
| Slopes, craters and shadow | Crater floors in permanent shadow and rim high points are in the catalogue; each polar site shows its slope, how well its heights are known and its distance to permanently shadowed ground, from NASA's adjusted maps (PGDA product 90), and, south of 80° S, the modelled cold traps within 5 km from LRO Diviner's temperature model (modelled conditions where ice could last, not a finding of ice); the shadow map and the view from the site show the shadows the hills cast, and the shadow map can show the cold ground as a layer. |

## Run it on your computer

Earthrise runs on Windows, macOS and Linux. You need Git, Node.js and uv (uv brings its own
Python), an internet connection for the setup, and free disk space: about 2 GB for the app with
the committed data, about 3 GB with the full NASA data. Once set up, with the data and a production
build on the computer, it runs with no network (the assistant's model, Luna's voice in Chrome and
Edge, and the JPL re-check need one, and say so without it).

Where the commands differ, each step gives them for Windows PowerShell, for Windows Command Prompt
(only where it differs from PowerShell) and for macOS and Linux (bash or zsh; Git Bash on Windows
takes these too). A block marked "any shell" is the same everywhere. The blocks hold commands
only, so each line can be typed or pasted as it is.

The times below were measured on a 4-core Linux computer with a fast connection (about 40 MB/s).
On a slower connection the downloads take longer: 335 MB at 10 Mbit/s is about 5 minutes.

### 1. Install Git, Node.js 22 and uv

- Node.js 22 is the version the team works on; 20.9 or later up to 26 works too (`engines` in
  `web/package.json` accepts `>=20.9.0 <27`, and `web/.nvmrc` says 22). On 12 November a clean
  install, a slice of the tests and the production build passed on Node 20, 24 and 26 and the full
  suite on 22, with Next 16.3.6; since the bump to Next 16.4.6 (14 November) only Node 22 with npm
  10 has been checked.
- uv runs the Python pipeline. The first `uv sync` downloads Python 3.12 when the computer has no
  3.12 (`pipeline/pyproject.toml` asks for 3.12 or later and `pipeline/.python-version` pins
  3.12), so you do not install Python yourself.
- Nothing is compiled: the app's native parts (Tailwind, Next's compiler, the image tools) and the
  pipeline's packages (numpy, rasterio with GDAL, SpiceyPy) come prebuilt, so you need no Visual
  Studio, Xcode or GDAL. The pipeline's prebuilt packages cover Windows 10 and 11 on x64 (SpiceyPy
  has no build for Windows on ARM), macOS 14 or later on Apple silicon, macOS 15 or later on Intel,
  and Linux with glibc 2.28 or later (Ubuntu 20.04, Debian 10 and newer).

**Windows**, with winget (part of Windows 11 and of an up-to-date Windows 10), in PowerShell or
Command Prompt:

```powershell
winget install --id Git.Git -e
winget install --id CoreyButler.NVMforWindows -e
winget install --id astral-sh.uv -e
```

Close the terminal and open a new one (winget's changes to the PATH reach new terminals only), then:

```powershell
nvm install 22
nvm use 22
```

`nvm use` may ask for administrator permission; accept it. Instead of nvm-windows,
`winget install --id OpenJS.NodeJS.LTS -e` installs the current LTS release of Node.js, which works
too while it is 26 or older. Without winget: Git from
https://git-scm.com/download/win, Node.js from https://nodejs.org/en/download (pick v22; the LTS
offered there works too), and uv with its installer, in PowerShell or Command Prompt:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**macOS**, with Homebrew (https://brew.sh):

```bash
brew install git node@22 uv
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
```

Homebrew does not put `node@22` on the PATH; the second line does, for zsh, the default shell (on an
Intel Mac the folder is `/usr/local/opt/node@22/bin`). Open a new terminal afterwards. nvm, as for
Linux below, works on macOS too.

**Linux** (Debian or Ubuntu; on Fedora, `sudo dnf install git curl`):

```bash
sudo apt install git curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Open a new terminal, then:

```bash
nvm install 22
```

In `web/`, `nvm use` reads the version from `web/.nvmrc`.

**Check**, in a new terminal (any shell):

```
git --version
node --version
npm --version
uv --version
```

`node --version` should print v22 (v20.9 to v26 works) and `npm --version` 10 or 11. If a command
is not found, see [When something fails](#when-something-fails).

### 2. Get the code and the app's packages

Any shell:

```
git clone https://github.com/hatemadi15/Trinity.git
cd Trinity
cd web
npm ci
cd ..
```

Run npm in `web/`, never in the repository's root, which has no `package.json`. `npm ci` installs
exactly what `web/package-lock.json` lists: 505 packages, about 300 MB to download and 860 MB in
`web/node_modules`. It took 55 seconds here with an empty npm cache and 15 with a warm one.
It prints deprecation warnings and a count of vulnerabilities; neither stops it. On 14 November `npm
audit` reports 13 (10 moderate, 3 high), all in the development tools (vitest, vite, ESLint's
packages) or reached only while building (source-map-js, through PostCSS): none in what the browser
runs since `next` went to 16.4.6. `npm audit fix --force` would rewrite the lock file across major
versions, so leave it. `npm install` works too,
but it can rewrite `package-lock.json`; commit that file only when you have added a package. npm
may offer a newer major version of itself; the setup was checked with npm 10 and 11.

### 3. Put the data in `web/public/data`

The app reads its data files from `web/public/data`, which git ignores. Until they are there, the
pages that need them say "The data could not be loaded." (Accuracy: "The checks could not be
loaded."); the home page's words still show. In development the pages also give the command that
fills the folder, `sync-local` below, which works on a fresh clone. There are two ways to fill the
folder, and a command that checks it against the list of every file the app reads.

#### The committed data (7 MB, a minute)

Any shell, from the repository's root:

```
cd pipeline
uv sync
uv run python -m lunar_pipeline.cli sync-local
cd ..
```

`uv sync` downloads Python 3.12 (about 30 MB, only when the computer has no 3.12) and the
pipeline's packages (65 to 85 MB, by system) into `pipeline/.venv`; it took 5 seconds here.
`sync-local` copies the committed `data/` (6.8 MB: the site catalogue, the hourly Sun and Earth
table, the horizon masks of the catalogue sites, the sky, the validation tables, the margins and the
terrain versions, the modelled cold traps and the test fixtures) into `web/public/data` in under a
second.

With this data every page opens and works for the 34 places in the catalogue: the site list,
Explore's answer, numbers, chart and horizon chart, Compare, Accuracy, How it works, the brief and
the assistant. What needs the full data:

- Explore: the "Shadow map" and "3D from above" tabs say "This copy of Earthrise has no terrain
  files, so the ground cannot be drawn here. The Horizon chart tab works without them."
- Stand on the Moon: the view draws flat ground under the real skyline, with the lander, instead of
  NASA's measured ground and its shadows, and its card says "Ground drawn flat: this copy of
  Earthrise has no terrain files."
- Choose a landing site, "Somewhere else": computing a place that is not in the catalogue says
  "That place cannot be worked out here: this copy of Earthrise has no height tiles. The places in
  the list work without them."
- Explore, Lander dialog: a mast other than 2 m needs the same tiles; without them the app keeps
  the featured 2 m skylines, says the elevation map tiles are not on this server, and the figures
  stay at 2 m.

The home page needs none of it: the descent's pictures ship with the app. The browser's console
then lists 404s for `/data/terrain/manifest.json`; they are expected.

#### The full data (335 MB to download, 600 MB on disk)

Any shell, from the repository's root, after the block above:

```
cd pipeline
uv run python -m lunar_pipeline.cli fetch --group lola --group textures
uv run python -m lunar_pipeline.cli tiles
uv run python -m lunar_pipeline.cli terrain
uv run python -m lunar_pipeline.cli sync-local --tiles
cd ..
```

| Command | Reads or downloads | Writes | Time here | What it gives the app |
|---|---|---|---|---|
| `fetch --group lola` | 335 MB: LOLA heights of the south pole at 20, 80 and 240 m | `data_raw/lola` | 9 s | the input of `tiles` and `terrain` |
| `fetch --group textures` | 0.45 MB: the LROC colour map of the Moon | `data_raw/textures` | 1 s | the colour of Explore's 3D globe |
| `tiles` | `data_raw/lola` | `data_out/tiles`: 706 tiles, 238 MB | 12 s | "Somewhere else" and other mast heights |
| `terrain` | `data_raw/lola`, `data_raw/textures` | `data_out/terrain`: 27 MB | 2 s | the shadow map, the 3D view, the stand view's ground |
| `sync-local --tiles` | `data/`, `data_out/` | `web/public/data`: 282 MB, 889 files | under 1 s | all of the above, in the app |

`terrain` needs about 0.5 GB of memory.

`sync-local --tiles` copies what the other commands made; it does not generate tiles. The
downloaded sources in `data_raw/` and the generated files in `data_out/` are gitignored, so they are
absent from a fresh checkout. If you see `data_out/tiles missing; run the tiles command first`, run
the `fetch` and `tiles` commands above before syncing. If the sources are already downloaded, start
with `tiles`: `fetch` skips files it already has, and run again after a cut-off download it resumes
where it stopped. The `--tiles` option also copies the terrain when the `terrain` command has made
it. Run `sync-local` (with `--tiles` once you have built them) again
after a `git pull` that changes `data/`. Every pipeline command is in
[pipeline/README.md](pipeline/README.md).

Three parts of the committed data are made from further NASA downloads, by commands of their own
(each followed by `manifest` and `sync-local`), and need running only to make them again: the
terrain versions (`error-model`, `ensemble`, then `uncertainty` and `ensemble --index-only`, about
35 minutes, with product 90's files from `pgda90-fetch`), the shadows check against camera pictures
(`images`, about 10 minutes the first time and 16 seconds from its cache in `data_raw/images`) and
the modelled cold traps (`coldtraps`, about 40 seconds; it downloads the 117 MB Diviner zip into
`data_raw/diviner` the first time).

#### Check what the folder holds

Any shell, from `pipeline/` (or `npm run data:check` from `web/`):

```
uv run python -m lunar_pipeline.cli check-data
```

It compares `web/public/data` with `data/manifest.json`, the list of every data file the app reads
(888 files in eight parts, each file with its size and SHA-256, under a data version such as
`2026-11-14-730a29df`), and says part by part what is complete, missing, incomplete or different,
what the app does without each part and the commands that get it. With the committed data alone it
names the tiles and the terrain and ends "Every page opens: the required files are all here. 2
optional parts are not complete; the pages named above fall back."; with the full data it
ends "The full demo is here." It exits with 1 only when a required file is missing or differs (run
`sync-local` again). `--root <folder>` checks another copy, such as an unzipped data release, and
`--json` prints the report for scripts. After a change to `data/`, `uv run python -m
lunar_pipeline.cli manifest` rewrites the manifest; a pipeline test fails until it is in step. An
older copy may still hold the globe that the home page's arrival drew until 14 November
(`data_raw/globe`, `data_out/globe`, `web/public/data/globe`) and that arrival's 240 m flight level
(`de_gerlache_rim_2.flight.u16` and `.json` in `data_out/terrain` and `web/public/data/terrain`).
Nothing reads them now, `check-data` lists the copies in `web/public/data` as not in the manifest,
and all of them can be deleted.

### 4. The environment file (optional)

The app runs without one: every variable has a default. To set one, copy the example from the
repository's root.

PowerShell:

```powershell
Copy-Item web\.env.example web\.env.local
```

Command Prompt:

```bat
copy web\.env.example web\.env.local
```

macOS and Linux:

```bash
cp web/.env.example web/.env.local
```

`web/.env.local` is gitignored; keep keys out of every other file.

| Variable | What it does | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | The OpenRouter key for the assistant and the brief's narrated paragraph. Read by the server only (`web/src/app/api/chat/route.ts`); the browser never sees it. A free key from https://openrouter.ai is enough: the models below are its free ones. | empty: no model |
| `OPENROUTER_MODELS` | The models asked in turn, comma-separated; the first good answer wins. | the four free models in `web/src/lib/ai/openrouter.ts` |
| `AI_MODEL_TIMEOUT_MS` | How long one model may take before the next is asked. | 10000 |
| `AI_MODEL_BUDGET_MS` | The total model time for one question, a retry included, kept under the browser's 30 s wait. | 24000 |
| `AI_RATE_LIMIT_PER_MIN` | Questions per minute from one address before the server answers 429. | 30 |
| `NEXT_PUBLIC_AI_MODE` | `live`: ask the model when a key is set. `cached`: rehearsed answers only, never a model, as `?demo=1` does for one tab. | `live` |
| `NEXT_PUBLIC_DATA_BASE` | Where the browser fetches the data files, with no trailing slash. | `/data`, which is `web/public/data` |
| `NEXT_PUBLIC_SITE_URL` | The address the share image links to. Set it on a deployment: the default is an unrelated site. | `https://earthrise.vercel.app` |

Without a key the assistant ("Ask in plain words" on Explore and Compare) still answers the
phrasings it knows, from its phrase matcher and its twelve rehearsed answers, for example "compare de
Gerlache Rim 2 and Nobile Rim 2 for 14 days", "make it 90 days" or "set the load to 300 W". Anything
else gets "I could not understand that." with five phrasings that work. The brief's paragraph is
then written from a template. Nothing else changes: no number in the app comes from a model.

`npm run dev` and `npm start` read the file when they start, so restart them after an edit. The
`NEXT_PUBLIC_` variables are built into the pages: after changing one, run `npm run build` again
before `npm start`. A variable set in the terminal wins over the file.

### 5. Start it

Any shell:

```
cd web
npm run dev
```

Open http://localhost:3000. The first visit to a page compiles it (8 seconds for the home page
here, 1 to 2 seconds for the others). Ctrl+C stops the server.

The production build, as the hosting runs it (any shell, in `web/`):

```
npm run build
npm start
```

`npm run build` took 18 seconds here on a quiet machine, 56 seconds from an empty `web/.next` while
other jobs shared the 4 cores, and about 1.3 GB of memory. It needs no connection: the app's two
fonts are in the repository (`web/src/app/fonts`, both under the SIL Open Font License), and on 14
November a build from an empty `web/.next` succeeded with the network cut off (Linux, `unshare -n`).
`npm start` serves the build at http://localhost:3000 and needs no connection either.

On another port, when 3000 is taken (any shell, in `web/`):

```
npm run dev -- --port 3005
npm start -- --port 3005
```

Without `--port`, `npm run dev` takes the next free port when 3000 is busy and prints it
(`Local: http://localhost:3001`); `npm start`, and `npm run dev` with `--port`, stop with
`Error: listen EADDRINUSE: address already in use` and the port. To find what holds the port, see
[The port is taken](#the-port-is-taken).

### Run it offline (demo mode)

For a talk or a classroom without Wi-Fi, prepare the laptop: fill `web/public/data` with the full
data (step 3), check it (`check-data` should end "The full demo is here."), then build and serve.
Neither the build nor the server needs a network: on 14 November the build from an empty
`web/.next` and `npm start` ran in a Linux network namespace with no network at all, and Chromium
opened the home page (the live flight), Explore, the view from the site, a place outside the
catalogue and Accuracy there, with no request leaving the computer. That is the prepared laptop.
The hosted site is not offline: it has no service worker or offline cache, so it needs the network
(`docs/hosting.md`). `NEXT_PUBLIC_AI_MODE=cached`
makes the assistant use its rehearsed answers and never call a model; it is built into the pages,
so set it before `npm run build`. In `web/`:

PowerShell:

```powershell
$env:NEXT_PUBLIC_AI_MODE = "cached"
npm run build
npm start
```

Command Prompt:

```bat
set NEXT_PUBLIC_AI_MODE=cached
npm run build
npm start
```

macOS and Linux:

```bash
NEXT_PUBLIC_AI_MODE=cached npm run build
npm start
```

In PowerShell and Command Prompt the variable stays set in that window; `Remove-Item
Env:NEXT_PUBLIC_AI_MODE` (PowerShell) or `set NEXT_PUBLIC_AI_MODE=` (Command Prompt) clears it
before a normal build. Instead of the terminal you can write `NEXT_PUBLIC_AI_MODE=cached` in
`web/.env.local`; a value set in the terminal wins over the file. Keep `NEXT_PUBLIC_DATA_BASE`
unset or `/data` for this build.

Then open http://localhost:3000/?demo=1. `?demo=1` switches the assistant to the rehearsed answers
in that browser tab whatever the build says, and the tab remembers it (`?demo=0` switches back).
The JPL re-check on the Accuracy page needs the internet; without it the page keeps the stored
comparison and says so. The venue steps are in `docs/hosting.md` (section 4) and
`docs/demo-checklist.md`.

## Before you push

From `web/` (any shell):

```
npx vitest run
npm run lint
npx tsc --noEmit
npm run build
npm run validation:tests
```

From `pipeline/` (any shell):

```
uv run pytest -q
```

- `npx vitest run` (also `npm test`) runs the app's tests: on 14 November 1,583 in 146 files, all
  passed with the full data (165 seconds with `--maxWorkers=2` while other jobs shared the 4 cores;
  72 to 110 seconds on a quiet machine when there were 1,514). With only the committed data, the
  ones that need the tiles or the terrain skip (23 of the 1,514 then). On a computer with few cores
  or little memory, `npx vitest run --maxWorkers=2` runs two test files at a time. The tests print
  warnings and stack traces from the components they exercise; the result is the `Test Files` and
  `Tests` lines at the end.
- `npm run lint` (ESLint, 16 seconds) and `npx tsc --noEmit` (the type check, 11 seconds) print
  nothing when all is well. `npm run build` (18 seconds) checks the types again and builds.
- `npm run validation:tests` runs both suites (the pipeline's needs uv) and writes
  `web/public/validation/tests.json`, which the Accuracy page shows: passed, skipped and failed on
  each side, the start of the run (UTC), the commit and whether the tree had other changes, and the
  data present (each part of `web/public/data`, and the pipeline's NASA downloads). Arguments after
  `--` go to vitest (`npm run validation:tests -- --maxWorkers=2`). It took 189 seconds here on 14
  November. Run it on a clean tree and commit the file; it exits with 1, after writing the report,
  when a test failed.
- `uv run pytest -q` runs the pipeline's 147 tests. With no NASA files downloaded, 121 pass and the
  26 that need them skip (8 seconds here on 14 November, with other jobs running). With `fetch
  --group kernels --group lola --group illumination` (525 MB) all 147 run (20 to 32 seconds). A
  partial download works too: a test whose files are missing skips. The tests write only to
  temporary folders, so a run leaves the tree as it was, and they pass in a clone of any name.

### Browser journeys

From `web/`: `npx playwright install chromium` once, then `npm run e2e`. It builds, serves the build on port
3032 and runs the journeys in Chromium: the planning journey, a landing slipped by five days, keyboard only,
touch on a phone, reduced motion, every page at 390 px, no WebGL, and missing data. `npm run e2e:run` reuses
the last build; to test a server already running, set `E2E_BASE_URL` (bash or zsh:
`E2E_BASE_URL=http://localhost:3000 npm run e2e:run`; PowerShell:
`$env:E2E_BASE_URL="http://localhost:3000"; npm run e2e:run`). The results go to
`web/public/validation/e2e.json` (passed, skipped with reasons, failed, date, commit, build and data). The
usability tasks for planners, educators and the public are in `docs/usability-tasks.md` and are still
pending: none has been run with real people yet.

## When something fails

### `npm ci` or `npm install`

- `ENOENT: no such file or directory, open '...\Trinity\package.json'`: you are in the
  repository's root. Run `cd web` and try again.
- `'npm' is not recognized` or `npm: command not found`: Node.js is not installed, or the terminal
  was opened before it was. Install it, then close every terminal and VS Code and open a new
  terminal.
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

A clean start, when nothing else helps, in `web/`:

PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules
npm cache verify
npm ci
```

Command Prompt:

```bat
rmdir /s /q node_modules
npm cache verify
npm ci
```

macOS and Linux:

```bash
rm -rf node_modules
npm cache verify
npm ci
```

### uv, Python and the pipeline

- `'uv' is not recognized` or `uv: command not found`: the installer puts uv in
  `%USERPROFILE%\.local\bin` on Windows and `~/.local/bin` on macOS and Linux and adds that folder to
  the PATH of new terminals. Open a new terminal. On macOS and Linux, `source $HOME/.local/bin/env`
  also works in the open one.
- PowerShell refuses the uv installer with `running scripts is disabled on this system`, or a
  policy set by your organisation: use the installer line exactly as in step 1 (its
  `-ExecutionPolicy ByPass` covers that one run), or `winget install --id astral-sh.uv -e`.
- `ModuleNotFoundError: No module named 'lunar_pipeline'`: the command ran outside `pipeline/`.
  Run `cd pipeline` first; every `uv run` line in this README runs from there.
- `uv sync` fails while building `rasterio` or `spiceypy` (it tries to compile them): the system
  is one the prebuilt packages do not cover (Windows on ARM, macOS before 14 on Apple silicon or
  before 15 on Intel, Linux with glibc older than 2.28). The app alone does not need them: copy the
  committed data by hand, from the repository's root, as `sync-local` would.

  PowerShell:

  ```powershell
  New-Item -ItemType Directory -Force web\public\data | Out-Null
  Copy-Item -Recurse -Force data\* web\public\data
  ```

  Command Prompt:

  ```bat
  xcopy data web\public\data\ /E /I /Y
  ```

  macOS and Linux:

  ```bash
  mkdir -p web/public/data
  cp -R data/. web/public/data/
  ```

- Downloads cut off, `Connection reset`, `IncompleteRead`, or `OSError: ... expected N bytes, got
  M`: run the same `fetch` command again; it skips finished files and resumes the cut one from its
  `.part` file. `uv sync` can be run again the same way; on a slow connection set `UV_HTTP_TIMEOUT`
  to 120 first (`$env:UV_HTTP_TIMEOUT = 120` in PowerShell, `set UV_HTTP_TIMEOUT=120` in Command
  Prompt, `export UV_HTTP_TIMEOUT=120` in bash or zsh). If a proxy inspects HTTPS, `uv sync
  --system-certs` uses the system's certificates; otherwise try another network, such as a phone's
  hotspot.
- The LOLA files come over plain HTTP from `imbrium.mit.edu`. If your network blocks it, download
  the same six files over HTTPS from NASA's PDS (same names, lower case) into `data_raw/lola/`, then
  skip `fetch --group lola` and run `tiles`. In `pipeline/`:

  PowerShell (`curl.exe` comes with Windows 10 and 11):

  ```powershell
  New-Item -ItemType Directory -Force ../data_raw/lola | Out-Null
  foreach ($f in "ldem_875s_20m.lbl", "ldem_875s_20m.img", "ldem_80s_80m.lbl", "ldem_80s_80m.img", "ldem_60s_240m.lbl", "ldem_60s_240m.img") { curl.exe -L -o "../data_raw/lola/$f" "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/$f" }
  ```

  macOS and Linux:

  ```bash
  mkdir -p ../data_raw/lola
  for f in ldem_875s_20m.lbl ldem_875s_20m.img ldem_80s_80m.lbl ldem_80s_80m.img ldem_60s_240m.lbl ldem_60s_240m.img; do curl -L -o "../data_raw/lola/$f" "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/$f"; done
  ```


### The port is taken

`npm start` says `Error: listen EADDRINUSE: address already in use` with port 3000, often because
an `npm run dev` is still running in another terminal or in VS Code. Start on another port (step
5), or find the process and stop it: replace 12345 with the number the first line prints.

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
Stop-Process -Id 12345
```

Command Prompt:

```bat
netstat -ano | findstr :3000
taskkill /PID 12345 /F
```

macOS and Linux:

```bash
lsof -i :3000
kill 12345
```

### Disk space and long paths

- The full setup takes about 3 GB: `web/node_modules` 860 MB, `web/.next` up to 420 MB,
  `pipeline/.venv` 250 MB, the data about 890 MB (`data_raw/` 335 MB, `data_out/` 275 MB,
  `web/public/data` 282 MB), plus npm's and uv's caches (about 300 and 250 MB) and uv's Python
  (about 100 MB). After `sync-local --tiles`, deleting `data_out/` frees 275 MB (later syncs then
  run without `--tiles`; the tiles already copied stay in `web/public/data`), and `data_raw/` 335 MB
  more if you will not build again; `npm cache clean --force` and `uv cache clean` empty the
  caches.
- Windows limits paths to 260 characters unless long paths are turned on, and the deepest file the
  app writes (in `web\.next\dev\cache\images\`) sits 168 characters below the clone's folder. An
  error about a path that is too long, `ENAMETOOLONG` or git's `Filename too long`: clone to a short
  path such as `C:\dev\Trinity`, and run `git config --global core.longpaths true`.

## NASA data and credits

Every dataset, what the app uses it for, where it comes from and how to cite it is in
[docs/data-credits.md](docs/data-credits.md). In short:

- LRO LOLA's elevation grids of the south pole at 20, 80 and 240 m and its polar illumination maps
  (https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/,
  https://pgda.gsfc.nasa.gov/products/69).
- PGDA product 90, "A New View of the Lunar South Pole from LOLA" (Barker et al. 2023,
  https://pgda.gsfc.nasa.gov/products/90): the adjusted heights and their stated error, for the
  margins, the terrain error model and its terrain versions, the ground at each polar site, and the
  slopes and permanent shadow beside the modelled cold traps.
- LRO's camera, LROC: 18 frames of the Wide Angle Camera's south polar movie
  (https://pds.mcp.nasa.gov/data/store/img/lunar_reconnaissance_orbiter/pds4/lroc/lro-l-lroc-5-rdr/LROLRC_2001/DATA/BDR/WAC_POLE/WAC_POLE_MOVIE_SOUTH/)
  and two Narrow Angle Camera pictures from product 90 (https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/),
  timed through the PDS Orbital Data Explorer (https://oderest.rsl.wustl.edu/live2/), for the
  shadows check.
- LRO Diviner's Polar Resource Product (Paige et al. 2010,
  https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/), for
  the modelled cold traps.
- JPL's DE440 ephemeris through NAIF's SPICE kernels (https://naif.jpl.nasa.gov/pub/naif/generic_kernels/),
  and JPL Horizons (https://ssd-api.jpl.nasa.gov/doc/horizons.html) for the directions check.
- NASA's CGI Moon Kit (https://svs.gsfc.nasa.gov/4720) and Blue Marble (https://visibleearth.nasa.gov)
  for the Moon and Earth, the Yale Bright Star Catalogue through NASA HEASARC for the stars, and
  NASA's Artemis III regions and the CLPS mission records for the catalogue.

## Where things are

- `web/`: the Next.js app. `src/app/` holds the pages and the two server routes (`api/chat`, the
  assistant; `api/horizons`, the JPL re-check), `src/components/` the pages' parts,
  `src/lib/engine/` the TypeScript port of the pipeline's science (pinned to it by golden
  fixtures), `src/lib/sky/` the stand view, `src/lib/ai/` the assistant,
  `src/lib/store/` the state the pages share, `src/workers/` the web workers, and `scripts/` the
  engine demo and the test count. `public/` holds the static files; `public/data` is the data
  mirror, filled by `sync-local` and gitignored. [web/README.md](web/README.md) explains the
  engine, the routes, the stand view, the descent, the themes and the assistant.
- `pipeline/`: the offline Python pipeline (NASA SPICE kernels, LOLA elevation grids and
  illumination maps), the reference implementation of the science; it writes `data/`. The commands
  are in `pipeline/lunar_pipeline/cli.py` and [pipeline/README.md](pipeline/README.md).
- `data/`: the committed outputs (the site catalogue, the hourly Sun and Earth table, the horizon
  masks of the catalogue sites, the sky, the validation tables with the pictures from orbit, the uncertainty budget with each polar site's skylines
  from NASA's adjusted maps, the terrain error model and each polar site's 32 terrain versions (`ensemble/`), the
  modelled cold traps (`coldtraps/`), and the golden fixtures).
  `data_raw/` (downloads) and `data_out/` (generated files) appear beside it once you run the
  pipeline; both are gitignored.
- Tests: the web's sit beside the code as `*.test.ts` and `*.test.tsx` (vitest; shared helpers in
  `web/src/test/`, the engine's parity tests in `web/src/lib/engine/__tests__/`); the pipeline's are
  in `pipeline/tests/` (pytest).
- `docs/`: `method.md` (the science), `recommendation-model.md` (the ranking rule, and why there is no
  trained model), `ml-feasibility.md`, `data-credits.md`, `hosting.md` (Vercel, Cloudflare R2, the
  offline venue mode), `demo-checklist.md`, `usability-tasks.md`, the pitch, the submission and the video
  storyboard; `handouts/` holds a two-page guide for visitors as Markdown and Word
  (`python3 docs/handouts/create_project_guide.py` writes both). The
  spec is in `docs/superpowers/specs/`: the first plan (2026-09-28), the UI redesign (2026-10-01),
  the immersive design that the stand view follows, with its amendments (2026-10-02;
  the section numbers the code and `web/README.md` cite; its section 24 has the terrain versions, the
  shadows check against pictures from orbit and the modelled cold traps), Moonstone, the redesign of
  the look, the home page's descent and Luna's chat (spec 23, 2026-11-14), and a C++ core design that
  was not built.
  The implementation plans and their ledgers are in `docs/superpowers/plans/`, the design mockups in
  `docs/design/`.

## Hosting

The app is meant to deploy to Vercel (root `web/`), with the data files published to a Cloudflare R2 bucket with `uv run python -m lunar_pipeline.cli publish-r2` and fetched from `NEXT_PUBLIC_DATA_BASE`. Steps, environment variables, CORS, the offline venue mode and a go-live checklist are in `docs/hosting.md`, which also says what was run on 14 November (the build, `npm start`, the offline laptop, the publisher's dry run, which needs no keys) and what needs the team's accounts and keys (the bucket, the upload, the Vercel project; none was deployed then). `data/manifest.json` lists every data file with its size and SHA-256, and `check-data` checks a copy against it.
