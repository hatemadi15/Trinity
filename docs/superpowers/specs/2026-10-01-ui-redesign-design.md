# Earthrise UI redesign: design

Date: 1 October 2026. Status: direction approved by the user on 1 October 2026 ("go with this direction, make a light/dark mode"). Supersedes the visual and layout parts of `2026-09-28-clps-lunar-mission-browser-design.md` (sections 4 and 7); the engine, data and AI architecture of that spec stand.

Reference images of the approved mockup: `docs/design/redesign-2026-10/design-home-light.jpg`, `design-sites-light.jpg`, `design-explore-light.jpg`, `design-explore-dark.jpg`.

## 1. Why

The user's verdict on the first UI: "not so easy to use", "not very professional and very condensed", "people who see this for the first time have no idea what it's about". The challenge statement asks for an *intuitive* tool for planners, educators and the public, so this is a relevance problem, not only a polish problem.

Evidence gathered before any redesign:

- Two blind first-impression reads (a hackathon judge and a school teacher, screenshots only, no project knowledge) scored the live UI: purpose clear 3 of 5, knows what to do next 3, professional look 3 and 4, breathing room 3, readability 2. Both called the largest picture on every page a "dark smear", could not read the sky dial, found the time slider hidden at the bottom edge and listed the same unexplained words (LOLA, DE440 ephemeris, CLPS, skyline).
- On the first Explore screen 46 % of the visible text was under 14 px and all 26 controls were under 32 px tall.

Three mockup rounds were tested the same way. The last round scored 4, 4, 4, 3, 3 from both reviewers. What they still marked down is listed in section 12 and is part of this design.

## 2. Outcome and success criteria

1. A first-time visitor can say what the product does within ten seconds of opening the home page, and can read the answer for a site without help.
2. The blind read (same two personas, same questions, screenshots of the built app) is the gate for each pull request: no score below the mockup's last round (4, 4, 4, 3, 3), and the final build aims for 4 or better on all five.
3. On the first screen of every page: at most 15 % of the visible text is under 14 px and none is under 13 px; every button, field, select and slider is at least 40 px tall (links inside text are exempt).
4. Light and dark themes both meet WCAG AA contrast for text.
5. Nothing the product computes changes except where section 7 says so. Every existing capability stays reachable: custom site, lander settings, compare up to four sites, best date, brief, live JPL re-check, plain-words assistant, demo mode.
6. Gates stay green: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build` in `web/`; `uv run pytest -q` in `pipeline/`.

## 3. Principles

1. **Answer first, in words.** The first thing on Explore is a sentence a teenager can read, with the reason and the better date.
2. **Time runs left to right.** Charts on the first screen share one time axis. The 360° horizon picture, on which the Sun travels right to left, is an optional second view and never sits directly under a time chart.
3. **One primary action per screen.** One gold button; everything else is an outline or a link.
4. **Plain words in primary copy.** Instrument and dataset names (LOLA, DE440, Horizons, CLPS) appear only in credits and on the Accuracy page.
5. **Pictures that read at a glance.** Terrain is shown as a sharp shadow map computed from the height grid; the 3D view uses the same computed light.
6. **Room.** Body text 16 px, controls 44 to 52 px, pages scroll; only the time bar is pinned.
7. **Evidence over taste.** Layout and copy questions are settled by the blind read, not by preference.

## 4. Visual system

### 4.1 Themes

- Two themes, light and dark. Light is the default (it reads better on a projector in a lit room and stands apart from the usual dark space dashboard). A switch in the header changes it; the choice is stored in `localStorage` under `earthrise.theme`. `?theme=light|dark` in the URL sets it for the visit (used for screenshots and the video).
- The theme is the `data-theme` attribute on `<html>`, set before first paint by a small inline script so the page never flashes the wrong theme.
- The operating system's preference is not followed. Ruling: a fixed default keeps the pitch, the video and the judges' first view identical.
- Picture panels (charts drawn on black, shadow map, 3D, relief maps) use the same dark "stage" colours in both themes: they are windows onto the Moon.

Tokens (CSS custom properties):

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f3f2ee` | `#0b0d11` | page |
| `--surface` | `#ffffff` | `#14181e` | panels, fields |
| `--surface-2` | `#efede7` | `#1c2129` | insets, tracks |
| `--line` | `#dfdcd4` | `#272d37` | hairlines |
| `--line-strong` | `#c4c0b5` | `#3b4350` | field borders |
| `--ink` | `#15181d` | `#f4f1ea` | text |
| `--ink-2` | `#414752` | `#cbc5b9` | secondary text |
| `--ink-3` | `#636b79` | `#9e998f` | tertiary text |
| `--sun` | `#f2b134` | `#f5b63a` | Sun fills, primary button |
| `--sun-ink` | `#8a5a00` | `#f5b63a` | Sun-coloured text and icons |
| `--sun-on` | `#1a1407` | `#1a1407` | text on a Sun fill |
| `--earth` | `#2f6fdd` | `#6aa9ff` | Earth fills |
| `--earth-ink` | `#1f57b8` | `#8dbdff` | Earth-coloured text and icons |
| `--good` | `#11794f` | `#46c98b` | keeps power |
| `--bad` | `#bf3a2c` | `#ff7d72` | loses power |
| `--good-bg`, `--bad-bg` | 8 % tints | 10 % tints | verdict panel fill |
| `--good-line`, `--bad-line` | 35 % tints | 40 % tints | verdict panel border |
| `--stage` | `#050608` | `#050608` | picture panels |
| `--stage-ink` | `#f4f1ea` | `#f4f1ea` | text on a stage |
| `--stage-ink-2` | `#c9c3b7` | `#c9c3b7` | secondary text on a stage |
| `--hill` | `#6d6962` | `#6d6962` | terrain fill on a stage |
| `--hill-edge` | `#e9e3d7` | `#e9e3d7` | terrain outline on a stage |

On a stage the Sun is always `#f5b63a` and Earth `#6aa9ff` (`--stage-sun`, `--stage-earth`), independent of the theme.

Gold and blue are identity colours with a fixed meaning (Sun, Earth). Green and red are status colours and are used only for the power verdict and the battery, always with an icon or words.

### 4.2 Type

Families stay: Bricolage Grotesque for display, IBM Plex Sans for text, tabular numerals. Scale in CSS pixels: 13 (chart ticks only), 14 (secondary), 15, 16 (body), 17 to 18 (lead paragraphs), 23 (panel titles), 32 to 34 (verdict, page titles inside the app), 40 (page title), 58 (home headline). No text under 13 px anywhere, including text inside SVG charts after scaling.

### 4.3 Controls and panels

- Buttons 44 to 52 px tall. Primary: Sun fill with `--sun-on` text. Secondary: 1 px `--line-strong` outline. Play: ink fill.
- Fields and selects 52 px tall on `--surface` with a `--line-strong` border. Window length is a three-part segmented control.
- Panels: 16 px radius, 1 px `--line`, `--surface` fill, 20 to 24 px padding. No translucent glass, no blur.
- Focus: 2 px outline in `--sun-ink` (light) or `--sun` (dark), 2 px offset, on every interactive element.
- Chart labels that sit on a picture get a solid backing plate, never an outline stroke (outlined text read as "smudged" in the blind test).

### 4.4 Layout

- Content width up to 1280 px with 32 px gutters (16 px under 640 px).
- Header 68 px, not pinned: wordmark with a small mark (a blue disc above a curved horizon line), the line "sunlight and signal forecast for the Moon", four sections, theme switch.
- Footer on every page: data credits and the Space Apps line.
- Desktop-first as before. Under 1024 px two-column rows stack; no page scrolls sideways at any width.

### 4.5 Motion

Only the time playback and things that answer a user's action. Play is disabled under reduced motion, as today, with the same note.

## 5. Structure

| Route | Nav label | Purpose |
|---|---|---|
| `/` | (wordmark) | what this is and why it matters |
| `/sites` | Explore a site | choose a landing site (new) |
| `/explore` | Explore a site | the answer for one site and period |
| `/compare` | Compare sites | up to four sites side by side |
| `/learn` | How it works | the three facts and five steps |
| `/validate` | Accuracy | the checks against NASA |
| `/brief` | (linked from Explore) | printable one-page brief |

"Explore a site" in the header opens `/sites`. `/explore` keeps accepting `?site=&start=&days=`; without a site it shows the last selected site, or the default. The default site becomes `de_gerlache_rim_2` (ruling: it is the site on the home page and shows night, the instructive case).

The Planner/Learn switch is removed. Plain language is the default for everyone; the full set of numbers sits behind "All numbers" on Explore and in the tables on Accuracy.

## 6. Screens

### 6.1 Home

1. **Hero** on a dark stage in both themes. Headline: "See when a Moon lander has sunlight and a signal." Lead: "At the Moon's south pole the Sun and Earth never climb high. They skim the horizon, and one hill can hide them for weeks. Pick a landing site and a date: Earthrise shows the hours of sunlight, the hours of radio contact with Earth, and whether the battery survives the night." Primary button "Explore a landing site" (to `/sites`), secondary "See how it works" (to the next section). Small line: "Built on NASA's elevation map of the Moon and NASA's positions of the Sun and Earth. Free to use." Picture: the shadow map of de Gerlache Rim 2 on 2 January 2027 with a pin "A possible landing site" and two labels, "in shadow" and "in sunlight"; caption says what it is and that it is computed from NASA elevation data.
2. **Why the south pole is hard.** Three drawings with a title and two sentences each: "The Sun never climbs", "The hills decide" (with the real pair: crater rim, sunlight all month; 12 km away, 45 %), "Earth sets too".
3. **See it at a real site.** One sentence and the Sun row of the time chart for the hero site (January 2027), drawn from a small precomputed file so the home page needs no data download. Link: "Open this site and play the month".
4. **Start from a real mission.** Three cards with an outcome tag: IM-2 Athena ("Ended after one day"), Blue Ghost Mission 1 ("Worked all 14 days"), de Gerlache Rim 2 ("Shortlisted for a crewed landing"). Each opens Explore on that site and date.
5. **Checked against NASA.** Three figures with a pass mark, a plain title and one sentence: the largest gap to NASA's position calculator, with a yardstick ("the Sun's disc is 20,000 times wider"); the typical gap to NASA's sunlight map (median over the covered sites, not "11 of 15", which read as four failures); the hours between our predicted sunset and the real end of Blue Ghost. The figures come from the validation tables through a small generated file, so they cannot drift.
6. **Footer.**

### 6.2 Choose a landing site (`/sites`)

- Title "Choose a landing site" and one sentence that states the period and the lander the figures assume.
- Left: a relief map of the south pole (500 km across, pole at the centre, a static image rendered by the pipeline) with one pin per polar site. Pins are links with the site name as accessible name; the pin of a row under the pointer is highlighted and the other way round. Every pin has a name on hover and focus. Sites with two weeks or more of power are green.
- Right: the catalogue in three groups with plain headings ("Shortlisted by NASA for a crewed Artemis landing", "Where commercial landers touched down", "High points and crater floors"). Columns: site name with a one-line description; sunlight (bar and percent); Earth in view (percent); longest time with power and the landing date that gives it (the best landing date of section 7.1). Rows are links to Explore and show a chevron. Within a group rows are sorted by longest time with power. A site with no contact with Earth or no sunlight says so in words in that cell.
- The period controls (From, For) sit above the list, so the ranking can be redone for other dates.
- "Somewhere else": latitude and longitude fields that compute a custom site, as today.
- Site display names and one-line descriptions are data: two new fields per site in `data/sites.json`, carried into the bundled catalogue.

### 6.3 Explore

Top to bottom:

1. **Period band.** Landing site (shows the name, opens `/sites`), From (date), For (14, 30 or 90 days), Lander (shows the preset name, opens the settings dialog). The lander dialog has three presets named by their numbers and the existing fields under "Custom".
2. **Answer row.**
   - *Verdict panel* with an icon, a title, one or two sentences and the actions. Wording in section 7.2. The gold button is the better landing date when there is one, otherwise "Compare sites".
   - *Numbers card*: sunlight share, contact-with-Earth share, and the lander line with how long the battery lasts in the dark. A link "All numbers" opens the full table (longest night, longest Earth gap, both at once, lowest battery, mean power, mast, minimum Earth elevation, skyline source, site height).
3. **Why: the N days, hour by hour.** One chart, three rows, one time axis running left to right:
   - *The Sun*: its height as a gold line, solid while it is up and dotted while hidden, against a grey shape that is the height of the hills in the Sun's direction at that hour. Where the grey stands above the line it is night. Sunset and sunrise are labelled with their dates. Along the top, the compass direction the Sun is in.
   - *Earth*: the same for Earth in blue.
   - *Battery*: charge as a green area; a red base line and the words "battery empty, lander off" during an outage.
   - A short key above the chart explains the grey shape, the dotted line and the top row in one sentence. Pointing at the chart shows that hour in the time bar; clicking or dragging moves the time.
4. **The ground and the place** (two columns).
   - *The ground*: a panel with three tabs. "Shadow map" (default): the terrain from above with the shadows of that hour, a pin, a scale bar and arrows to the Sun and to Earth. "3D": the same terrain in perspective with the same light, orbit and zoom, a 1× or 3× height switch and a full-screen button. "Horizon": the 360° picture of the skyline with the Sun's and Earth's paths; its caption says the Sun moves right to left.
   - *Where on the Moon*: the relief map with this site highlighted, one sentence about the site, and nearby sites with their sunlight share as links.
5. **Ask in plain words.** The assistant panel, open, with example chips and the line "The assistant moves the controls for you. It never invents numbers."
6. **Time bar**, pinned to the bottom of the window: Play or Pause, the date and time with a status sentence ("Sun up, Earth behind the hills, battery 100 %"), and a slider whose track is the sunlight strip of the period with day ticks.

On the first screen at 1440 by 900 the period band, the answer row, the whole time chart and the time bar are visible.

### 6.4 Compare sites

A table instead of columns: one row per site with a small Sun and Earth strip, sunlight, Earth in view, longest night, longest time with power and the verdict. Above it one sentence naming the best site for sunlight, for contact with Earth and for time with power. Add-site control, remove buttons, the period band and the lander setting stay. The empty state offers two ready pairs to compare.

### 6.5 Accuracy

Three checks, each with a pass mark, a headline figure, one plain sentence and "Show the numbers" for the existing table. The live JPL re-check stays in the first check. Error budget and the test count stay.

### 6.6 How it works

The three drawings from the home page, then five steps rewritten for the new screens, then the button to `/sites`.

### 6.7 Brief

Same one-page print layout. The sky dial is replaced by the Sun and Earth rows of the time chart, and the verdict uses the new wording.

## 7. Logic changes

Everything here is pure and unit tested.

### 7.1 Time with power

- An hour is *powered* when the battery walk did not brown out in it. `PowerResult` gains a per-hour flag array.
- *Longest time with power* for a landing date is the number of hours from that date to the first brownout.
- *Best landing date*: over the next 12 months from the period start, in six-hour steps, the date with the longest time with power, capped at the period length; ties go to more contact with Earth during that time, then to the earlier date. The lander lands with a full battery, as today. This replaces the scoring inside `findBestWindow` for a single site, so the assistant's "best window" and the gold button agree. For compared sites the same measure is averaged.

### 7.2 Verdict wording

| State | Tone | Title | Sentence |
|---|---|---|---|
| power lasts the whole period | good | "Keeps power for all N days" | sunlight share and the longest night; "The Sun never sets in these N days." when there is no night |
| power ends before the period does | bad | "Power for D, then night" | when the Sun sets and for how long it stays hidden; that the battery covers the first H hours; when the lander is back |
| no sunlight in the period | bad | "No sunlight in these N days" | "This spot stays in shadow for the whole period. A solar lander cannot work here." |

D is the time with power from the period start. Durations are written "12 days 15 hours" in sentences and "12 d 15 h" in cards and tables, never in bare hours above 48.

Advice under the sentence: when the best landing date gives more power than the current start, the gold button reads "Land on DATE instead" and a note says how long power lasts from then, or that it lasts the whole period. When no date does better: "No landing date in the next 12 months gives more power here", and the note suggests a shorter stay or a bigger battery.

### 7.3 Status sentence

One sentence for the hour under the time cursor, used in the time bar and as the chart's accessible description: "Sun up", "Sun setting" or "Sun behind the hills"; "Earth in view" or "Earth behind the hills", and when the lander is off, "but the lander is off"; "battery NN %" or "battery empty".

### 7.4 Site overview

For the site list: sunlight share, Earth share, best landing date and time with power for every catalogue site over the chosen period, computed site by site without blocking the page.

## 8. Terrain

### 8.1 Shadow map

For a height grid, a Sun direction and a Sun elevation, a pixel is lit when no terrain towards the Sun rises above the line from that pixel to the Sun. Heights are first lowered by r²/2R (r from the site, R the Moon's radius) so sight lines are straight; then one sweep along the Sun's direction keeps the running maximum of `height − distance × tan(elevation)` and marks each pixel lit or not. This is exact on the grid and costs one pass over the pixels (measured: about 25 ms for 1024 by 1024 in browser JavaScript).

- Two grids per site: the detailed window, and a wider, coarser context that seeds the running maximum at the window's sunward edge, so hills outside the window still cast their shadows into it.
- Brightness: lit pixels are shaded by the angle between the ground and the Sun; shadowed pixels keep a faint shape from a fixed soft fill, so dark ground is still readable.
- The sweep runs in a worker: half resolution while the time is moving, full resolution when it rests.
- Acceptance: at the site's own pixel the map agrees with the engine's "Sun visible" for at least 97 % of the hours of a test month, and disagrees only within three hours of a sunrise or sunset.
- The Python pipeline carries the same sweep as the reference and renders the home page picture; a parity test runs both on the same small grid.

### 8.2 3D

The terrain mesh is textured with the shadow map's brightness instead of being lit by GPU shadow maps, so 3D and map show the same light and the 3D view is as crisp as the map. Sun and Earth markers, the site marker, orbit controls and the height switch stay. A full-screen button is added. Non-polar sites keep the globe in the 3D tab; their shadow-map tab explains that the site has a flat assumed horizon.

### 8.3 Data

- The pipeline cuts a detailed window for every polar site in the catalogue (20 m inside 87.55° S, 80 m elsewhere); today only seven of eighteen have one.
- Sites with a 20 m window also get an 80 m context grid. All sites use the existing south-cap grid beyond that.
- The relief map of the pole is rendered once by the pipeline and committed as a web asset.

## 9. Assistant

Actions and replies stay. `set_audience` remains accepted and does nothing visible until the cleanup removes it from the schema, the intent matcher, the rehearsed answers and the prompt. `open_page` gains `sites`. "Best window" uses the best landing date of section 7.1.

## 10. Accessibility

Landmarks and one `h1` per page; every control labelled; visible focus; charts carry a text description and the numbers are available as a table; colour is never the only carrier (the verdict has an icon and words, chart rows are named); both themes pass AA for text; the time bar works from the keyboard (arrow keys one hour, Page Up and Page Down one day); reduced motion disables playback.

## 11. Out of scope

- Phone-first layouts. Pages must not break on a phone, but the product is still designed for a laptop.
- Choosing the best-lit point inside each NASA region. Region centres stay; the list says "Each figure is for the centre of the region" and Mons Mouton Plateau's description says the centre sits in shadow. Follow-up work.
- New physics, new data sources.

## 12. What the last blind read still marked down

These are requirements of the build, not of a later polish:

1. Rival actions on Explore: the gold button, Play and the selectors competed. One gold button per screen; Play is ink, not gold.
2. The time chart needs its one-sentence key (grey shape, dotted line, compass row), and degree marks only where they are explained.
3. The 360° picture ran mirrored right under the time chart: it moves behind a tab.
4. Outlined chart labels looked smudged and some collided: backing plates, and a collision rule for date labels.
5. On the site list a site with 0 % contact with Earth ranked second without a flag, and most map pins had no name: the cell says "no contact with Earth" and every pin gets a name on hover and focus.

## 13. Delivery

Four pull requests, each with its own plan, test-first tasks, a fresh review, one fix pass and the blind read:

1. Themes, shell, shared controls, home page.
2. Site list, Explore answer page, time chart, time bar, verdict logic.
3. Shadow map, 3D with the computed light, horizon tab, terrain for every polar site.
4. Compare, Accuracy, How it works, brief, assistant cleanup, removal of the old components and tokens, documents.

## 14. Rulings

- Light is the default theme; the system preference is not followed (section 4.1).
- The shadow map opens before 3D: blind reviewers could not read the old 3D view, and the map is guaranteed sharp. One constant flips the default.
- The verdict says "Power for D, then night", not "would not survive": a lander may sleep through a night and wake.
- A fixed 30-day survival test failed 17 of 19 catalogue sites in January 2027 (any 30 days holds a lunar night), which read as a wall of red. Lists and verdicts therefore report the time with power and the best landing date.
- The default site is de Gerlache Rim 2.
