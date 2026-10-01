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
| `--page` | `#dedcd6` | `#222220` | page (regolith grey; in the dark theme a grey one step above the stage) |
| `--surface` | `#ffffff` | `#2c2c2a` | panels, fields (sunlit white) |
| `--surface-2` | `#eceae5` | `#383835` | insets, tracks, hover |
| `--line` | `#c2bfb7` | `#444441` | hairlines |
| `--line-strong` | `#9f9c94` | `#5e5d57` | field borders, rules between list rows |
| `--ink` | `#000000` | `#f3f2ee` | text |
| `--ink-2` | `#33353a` | `#c6c5c0` | secondary text |
| `--ink-3` | `#55585e` | `#9c9b96` | tertiary text |
| `--sun` | `#f2b134` | `#f5b63a` | Sun fills, primary button |
| `--sun-ink` | `#6f4700` | `#f5b63a` | Sun-coloured text and icons |
| `--sun-on` | `#1a1407` | `#1a1407` | text on a Sun fill |
| `--earth` | `#2f6fdd` | `#6aa9ff` | Earth fills |
| `--earth-ink` | `#1b4fa8` | `#8dbdff` | Earth-coloured text and icons |
| `--good` | `#0c6a44` | `#46c98b` | keeps power |
| `--bad` | `#b02f22` | `#ff7d72` | loses power |
| `--good-bg`, `--bad-bg` | 10 % tints | 10 % tints | verdict panel fill |
| `--good-line`, `--bad-line` | 40 % tints | 40 % tints | verdict panel border |
| `--stage` | `#000000` | `#000000` | picture panels (the black of an airless sky) |
| `--stage-ink` | `#f3f2ee` | `#f3f2ee` | text on a stage |
| `--stage-ink-2` | `#c6c5c0` | `#c6c5c0` | secondary text on a stage |
| `--stage-edge` | `#33332f` | `#5a5a54` | the edge of a picture panel, lighter on the dark page |
| `--stage-line` | `#33332f` | `#33332f` | rules on a stage |
| `--hill` | `#6d6962` | `#6d6962` | terrain fill on a stage |
| `--hill-edge` | `#e9e3d7` | `#e9e3d7` | terrain outline on a stage |

The palette is the Moon's own three tones (shadow black, regolith grey, sunlit white); colour is reserved for the Sun and Earth. The text colours pass AA on the page and on a surface in both themes.

On a stage the Sun is always `#f5b63a` and Earth `#6aa9ff` (`--stage-sun`, `--stage-earth`), independent of the theme.

Gold and blue are identity colours with a fixed meaning (Sun, Earth). Green and red are status colours and are used only for the power verdict and the battery, always with an icon or words.

### 4.2 Type

Families stay: Bricolage Grotesque for display, IBM Plex Sans for text, tabular numerals. Display type is set at 87.5 % width and weight 700 with no extra tracking (class `display`; the font is loaded with its width and optical-size axes), so headlines are tall and compact without the letters closing up; titles of 23 to 26 px use weight 600. Scale in CSS pixels: 15 (secondary text, chart labels, table heads), 16 (body), 18 to 19 (lead paragraphs), 23 to 26 (panel and row titles), 32 to 34 (verdict, figures in tables), 40 (section and page titles), 72 (home headline; 56 under 1280 px, 44 on a phone). No text under 13 px anywhere, including text inside SVG charts after scaling; nothing on the home page is under 15 px.

### 4.3 Controls and panels

- Buttons 44 to 52 px tall. Primary: Sun fill with `--sun-on` text. Secondary: 1 px `--line-strong` outline. Play: ink fill. Links in running copy and at the end of a row are underlined.
- Fields and selects 52 px tall on `--surface` with a `--line-strong` border. Window length is a three-part segmented control.
- Radii follow the kind of thing: pictures (stages) 6 px, panels and controls 8 px, label plates 4 to 5 px, outcome tags fully round. Panels: 1 px `--line`, `--surface` fill, 20 to 24 px padding. No translucent glass, no blur, no shadows.
- A stage has a 1 px `--stage-edge` edge, so a black picture keeps its outline on the dark page.
- Focus: 2 px outline in `--sun-ink` (light) or `--sun` (dark), 2 px offset, on every interactive element.
- Chart labels that sit on a picture get a solid backing plate, never an outline stroke (outlined text read as "smudged" in the blind test).

### 4.4 Layout

- Content width up to 1280 px with 32 px gutters (16 px under 640 px).
- Header 68 px, not pinned: wordmark with a small mark (a blue disc above a curved horizon line), the line "sunlight and signal forecast for the Moon", four sections, theme switch.
- Footer on every page: data credits and the Space Apps line.
- Desktop-first as before. Under 1024 px two-column rows stack; no page scrolls sideways at any width.

### 4.5 Motion

The time playback, things that answer a user's action, and one moment on the home page: when it opens, the Sun's line in the forecast is drawn from left to right (about 2.5 s), then its labels appear. Nothing else moves by itself. Reduced motion shows the finished picture at once; Play is disabled under reduced motion, as today, with the same note.

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

1. **Hero.** The headline and its row sit on the page colour, so they follow the theme: "See when a Moon lander has sunlight and a signal.", the lead ("At the Moon's south pole the Sun and Earth never climb high. They skim the horizon, and one hill can hide them for weeks. Pick a landing site and a date: Earthrise shows the hours of sunlight, the hours of radio contact with Earth, and whether the battery survives the night."), and to its right the primary button "Explore a landing site" (to `/sites`), the secondary "See how it works" (to the next section) and the line "For mission planners, educators and anyone curious." Under them, edge to edge on a black band (a stage in both themes), a real forecast for de Gerlache Rim 2 in January 2027, drawn from a small precomputed file so the home page needs no data download:
   - a title ("A real forecast: de Gerlache Rim 2, January 2027"), a reading guide in 16 px full-strength type ("A ridge NASA shortlisted for astronauts. Read it from left to right, one day at a time. Heights are angles above the horizon: 5° is about the width of three fingers held at arm's length. The grey is not one mountain: it is how high the hills stand in the direction of the Sun, or of Earth, that day.") and a key of four marks;
   - two rows on one time axis and one height scale (a degree takes the same height in both): "Sunlight" (the whole of the hills is drawn, with height lines every 5° from the horizon) and "Contact with Earth"; a dot where a body goes behind the hills or comes back; words on every hidden stretch wide enough for them, the longest with its reason ("Night for 16 days 15 hours: the hills stand higher than the Sun"; "No contact for 9 days 3 hours: Earth is below the horizon", since the hills in Earth's direction are low) and the others with their length ("No contact for 7 days 9 hours"), each with the dates of its ends; the dates along the bottom. Chart labels are 16 px or more;
   - under the band's chart: that it is computed from NASA's elevation map and NASA's positions of the Sun and Earth, and the link "Explore de Gerlache Rim 2". On the first screen at 1440 by 900 the whole chart is visible.
2. **Why the south pole is hard.** Three drawings with a title and two sentences each: "The Sun never climbs", "The hills decide" (with the real pair, named as the page names them: the summit of de Gerlache crater's rim, sunlit all month; de Gerlache Rim 2, the site in the forecast, 12 km away, sunlit 45 % of the month), "Earth sets too" (Earth "hangs in nearly the same direction in the sky": there is no magnetic compass on the Moon). Every drawing carries its own title line; the two places of the middle drawing are large dots ringed in white. A line for teachers links to How it works. A number keeps its "%" on the same line.
3. **Start from a real place.** Left: the shadow map of de Gerlache Rim 2 on 2 January 2027 with a pin ("the landing site"), the labels "in shadow" and "in sunlight", a tag saying what and when, and a caption saying it is computed, not a photograph. Right: a ruled list of three places, each with an outcome tag, a name, two sentences and an outline button "Explore this site"; the companies and programmes are named in plain words (Intuitive Machines' Athena, Firefly Aerospace's Blue Ghost, the first crewed landing of NASA's Artemis programme): de Gerlache Rim 2 ("Shortlisted for a crewed landing"), the Athena lander of IM-2 ("Ended after one day"), the Blue Ghost lander ("Worked all 14 days"). Each opens Explore on that site and date.
4. **Checked against NASA.** A table of three checks with the columns "What we check", "Gap" (a pass mark and the figure), "Against" (the NASA source and what kind of gap it is) and "For scale" (a yardstick: "The Sun's disc is 20,000 times wider."; "Where NASA's map says 60 %, ours says 57 to 63 %."; "After 14 days on the surface."). The figures come from the validation tables through a small generated file, so they cannot drift. Link: "See every check and rerun one live".
5. **Try it on a landing site.** One sentence and the primary button again, "Explore a landing site", so the page ends with its action. The two gold buttons are never on one screen.
6. **Footer.** Who made it first ("Made by team Astroy/Ed for NASA Space Apps 2026 ... (CLPS: NASA's Commercial Lunar Payload Services). Not an official NASA product."), then the data credits. No faint grey (`--ink-3`) text on the home page: captions, table heads, the audience line and the footer use `--ink-2`.

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
- *Best landing date in the period*: among the hours of the chosen period at which any part of the Sun is visible (a lander arrives in daylight), the hour with the longest time with power, capped at the period length; ties go to more contact with Earth during that time, then to the earlier hour. The lander lands with the configured battery charge (full by default). This is the gold button on Explore and the last column of the site list.
- *Best date in the next 12 months*: the same measure on a six-hour grid over 365 days from the period start. It replaces the scoring inside `findBestWindow`, so the assistant's "best window" uses it, and Explore offers it as a link under the verdict. For compared sites the time with power is averaged and only hours at which every site is sunlit are candidates.
- Amended on 1 October 2026 by the plan for part 2. The first version searched 12 months for the gold button as well; a reference scan sent almost every site to October 2027, away from the period the user chose, and the approved mockup offered a date inside the period ("Land on 20 January instead").

### 7.2 Verdict wording

| State | Tone | Title | Sentence |
|---|---|---|---|
| power lasts the whole period | good | "Keeps power for all N days" | sunlight share and the longest night; "The Sun never sets in these N days." when there is no night |
| power ends before the period does | bad | "Power for D, then night" | when the Sun sets and for how long it stays hidden; that the battery covers the first H hours; when the lander is back |
| no sunlight in the period | bad | "No sunlight in these N days" | "This spot stays in shadow for the whole period. A solar lander cannot work here." |

D is the time with power from the period start. Durations are written "12 days 15 hours" in sentences and "12 d 15 h" in cards and tables, never in bare hours above 48.

Advice under the sentence: when the best landing date gives more power than the current start, the gold button reads "Land on DATE instead" and a note says how long power lasts from then, or that it lasts the whole period. When no date does better: "No landing date in these N days gives more power here", and the note suggests a shorter stay or a bigger battery.

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
- The fresh whole-branch review of part 1 was stopped by the user before it reported; part 1 is reviewed by its author against the same checklist, and the pull request says so.

## 15. Design-lead pass (amendment, 1 October 2026)

The user asked for the frontend-design process on top of the approved direction ("use the front end design command and continue your work on the parts"). The pass keeps the structure, the copy rules and the two themes of this document and changes how the pages look. Sections 4 and 6.1 above already carry the result; this section records the reasoning.

**What read as a default.** Checked against the usual output for "a clean landing page", the first build had: a cream page with near-black text and an amber accent; a hero with text on the left and a picture on the right; three sections of three equal cards; a row of three big numbers; tinted near-blacks standing in for black; one radius on everything. None of these came from the subject.

**Palette: the Moon's own three tones.** Shadow black `#000000` (an airless sky has no haze, so the stage is true black), regolith grey `#dedcd6` (the page), sunlit white `#ffffff` (panels). Colour appears only where it means something: Sun gold `#f2b134` and Earth blue `#2f6fdd`. Green and red stay status colours for the power verdict.

**Type.** Bricolage Grotesque at 87.5 % width and weight 700 for headlines; IBM Plex Sans for everything else. Three widths were rendered and compared: 75 % closed up and read as cramped (the user's word for the first UI was "condensed"), 100 % read as any grotesque; 87.5 % keeps the height and the legibility.

**Layout: the hero is the product.** The most characteristic thing in this subject is the Sun skimming the hills, so the page opens on the real forecast, edge to edge, instead of a decorative picture.

```
+----------------------------------------------------------------------+
| Earthrise  tagline        Explore  Compare  How  Accuracy     [L|D]  |
+======================================================================+
| See when a Moon lander                                               |  black
| has sunlight and a signal.                                           |
| lead paragraph (4 lines)               [Explore a landing site] [..] |
|                                        For mission planners, ...     |
| A real forecast: the Sun at ...        -- Sun   .. hidden   ## hills |
| . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5 deg up . |
|        ____________________     Night for 16 days 15 hours           |
| ~~~~~~/  .  .  .  .  .  .  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ |
| _/^^_/                      ^^_/^_/^^^_ level ground _/^^_/^_/^^^_/^ |
| 1 Jan      6 Jan      11 Jan      16 Jan      21 Jan      26 Jan     |
| what the site is; computed from NASA data     Open this site ...     |
+======================================================================+
| Why the south pole is hard        [drawing] [drawing] [drawing]      |  grey
| Start from a real place           [shadow map]  | place ........ link|
|                                                 | place ........ link|
| Checked against NASA   what | gap | against | for scale              |
+----------------------------------------------------------------------+
```

Shapes follow the content: three parallel facts are three drawings; three places are a picture and a ruled list; three checks are a table, because each has the same four attributes. Everything is left aligned on one edge.

**Principles of the pass.** One bold thing (the forecast as hero), everything else quiet. No gradients, shadows or blur as decoration; the only fade is on hills that run off the top of a chart, where it means "continues". One moment of motion (the Sun's line is drawn once). Structure carries information: rules separate rows, tags state an outcome, the pass mark sits beside the figure it certifies.

**What the first blind read of the built home page asked for, and where it went.** The chart had two unexplained horizontal scales and no height scale: the compass row is gone from the home page and two named height lines are in. Small labels: chart labels are 15 px. "2.6 points" and the three big figures: the table says what each gap is measured against and gives a yardstick. Two landers announced, three cards shown: the sentence now names the ridge and the two landers in the order of the list. The hero picture read as a stock photo: it moved beside the list with a tag and a caption that say it is computed. Audience unstated: one line under the buttons. Lower links looked like plain text: underlined. Dark theme: stages keep a 1 px edge and the page is a grey above black.

**Second blind read of the built home page (after the pass), and what changed.** Scores: judge 4, 4, 4, 3, 4; teacher 5, 4, 4, 4, 4 (purpose, next step, look, room, readability), so the gate held. Both still read the grey shape as one mountain on a calendar and took its faded top for a bug: the forecast now draws the whole of the hills with height lines every 5° and says in one sentence what the grey is and how big 5° is. Both said the headline promises a signal the first screen did not show: Earth's row joined the Sun's. Both found the theme switch invisible on a black first screen and the dark panels melting into the page: the headline area follows the theme, the dark page is a step lighter and picture panels have a lighter edge there. The judge counted four names for one action and none at the end: one verb ("Explore") throughout, and the page ends with the gold button. The teacher found "the rim" in the drawing at odds with "Rim 2" in the chart, and no way in for a class: both are named as in the chart, and a line points teachers to How it works.

**Third blind read, and the last fixes before the pull request.** Scores: judge 4, 4, 4, 4, 3; teacher 4, 4, 4, 4, 3. Room went up; readability went down to 3 for both, who found the chart's notes and the captions small and grey. Both counted two gaps in Earth's row but words on only one, and saw the same spacing mean 5° in one row and 10° in the other. Both met unexplained names (IM-2, Artemis, CLPS) and found the site explained only below the first screen. The teacher asked whether "eye level" and "horizon" are the same thing, pointed out that a compass does not work on the Moon, and read the shadow map's "in shadow" tag, level with the pin, as the site being dark; the judge found the middle drawing's label jammed against the peak. All of these are fixed: every gap has its words and dates, both rows share one height scale, the reading guide says what the site is and is set larger and brighter, chart labels are 16 px, no faint grey text remains on the page, one word ("horizon") is used throughout, names are spelled out, and the drawing and map labels moved. The battery both readers missed on the home page is added by part 2, which brings the time-with-power engine.
