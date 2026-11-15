# Spec 23: Moonstone, the redesign (14 November 2026)

Built on the `lea` branch with the UI UX Pro Max skill (`.claude/skills/ui-ux-pro-max`): its design system for
"space science data visualisation, dark, monochrome, editorial" gave Dark Mode (OLED), a monochrome palette with
one blue accent, minimal glows, visible focus and reduced-motion support. This spec supersedes the look of spec 6
(no glows, no gradients, no motion); the tests in `web/src/app/look.test.ts` and `globals.test.ts` hold the new rules.

## Look
- **Colour.** Ink on a deep blue-grey, with one colour that pops: moonstone blue (`--accent`, `#7fa9ff` dark,
  `#2f62e0` light), which is also Earth. The Sun is drawn warm white. Green and red stay for the power verdict only.
  Glows are the accent's own light: `rgb(var(--glow) / a)`. The dark theme is not black (15 November, owner review:
  "things are a bit too black", sections could not be told apart): the page is `#0f141c`, a band `#151b26`, a panel
  `#19202b`, a raised panel `#232c39`, with edges `#364152` and `#7f8a99`; pictures keep true black, so they stand
  out on it. The home page's dark bands take the page's tone in both themes (`--stage-band`), with figures on
  `--stage-raised`. Explore, Compare and Accuracy frame each section as a panel; How it works alternates a band
  shade (`.band`) between its sections. Body text stays 7:1 and secondary text 4.5:1 on every one of these.
- **Type.** One face for the whole site (15 November, owner review: a simple, clear, consistent font): IBM Plex
  Sans, the only font loaded. Titles (`.display`) are semibold with a line height of 1.2, and a stressed word stands
  upright in the accent, never in italics; reading text has a line height of 1.6 and the face's own letter spacing;
  labels in capitals (`.eyebrow`) are tracked 0.06em; figures keep one width (`tabular-nums`) where the monospace
  face lined them up. Instrument Serif, Pixelify Sans and IBM Plex Mono are gone, with their files and licences.
- **Theme switch.** One round toggle; the new theme opens as a circle from it (view transitions), or the colours
  cross-fade in 0.5 s (`theme-fading`). Reduced motion switches at once.
- **Motion.** Defined once in `globals.css` and all stopped under reduced motion: headings come into focus as they
  scroll into view (`Reveal`), drawings play on hover, a live dot pulses, Luna breathes and blinks.

## Pages
- **Home.** The descent (23.1) from the first screen to the answer: the whole Moon beside the title, Earth beside
  it (NASA Blue Marble with clouds, night lights, ocean glint and air glow; LRO's Moon with its relief), and under the
  lede the audience line, "For planners of NASA's commercial Moon landers, teachers (start with How it works) and
  anyone curious.", with the title in two lines where the first screen is short (a phone, a landscape window under
  880 px tall) so the buttons stay clear of Luna. Then five
  numbered sections in one line (`SectionHead`) that alternate in both themes, dark (the dark page’s blue-grey) then paper, each with the same
  room above and below and one clean edge between: 01 the forecast on black, which reads hour by hour under the
  pointer or the arrow keys (`ForecastHover`); 02 why the south pole, in questions and answers (23.3), on paper (`.theme-light`); 03 real
  places as whole-row links on black (`.theme-dark`); 04 the checks on paper; 05 where to go next, over the halftone
  nebula, black in both themes after 04's paper. No folds. The words under the descent were cut (15 November, owner
  review) from 914 words of text to about 620, and outside 02's questions from 653 to about 430, held by caps in
  `page.test.tsx`.
- **Choose a site.** The map is the page (15 November, owner review): the south pole's relief fills the window under
  the header, with an inset of the whole Moon for the sites far from the pole. Every site is a marker whose mark says
  its group (NASA's Artemis shortlist, landers, high points and crater floors, with a small key); no name is written
  until a marker is pointed at, focused or tapped, when a card names it with its figures and every other marker greys
  out. Close markers are moved apart. A click opens Explore filled in for the site; on a phone the first tap shows the
  card and the card opens the site. The bar at the foot holds the dates behind one button (with what the figures count
  from), "List" (the same sites for the keyboard and screen readers) and the primary "Choose your own site", which
  opens Explore with nothing filled in (`/explore?own=1`); the "Somewhere else" form is gone. The first screen is held
  to 48 words (`SitesView.test.tsx`). The page is a night sky in both themes, from the header to the footer (15 November, owner
  review: it must read as space and as glass at a glance): on the stage's black, one still canvas at the back of the
  page (`NightSky.tsx`) draws a faint Milky Way haze, a dust of small stars and the catalogue's real stars, the bright
  ones with a glow, and none under a line of words that stands on the sky. On a wide screen the map stands in a
  rounded frame so the sky shows round it. The title block, the card, the bar, the list, the dates panel and the
  sources are panes of glass (`.pane` in `globals.css`: a thin fill of the panel's own colour, about 34 to 42 %, over
  a strong blur of what is behind it, darkened so the words keep AA; a bright edge, a top highlight and a blue glow),
  with Compare the one place a backdrop is blurred (`look.test.ts`).
- **Compare.** The same night sky and glass (15 November, owner review): the page is marked `data-night-sky`, so it is
  night in both themes from header to footer, every `.panel` is a pane, and the verdict band, "Start here", the "Add a
  landing" panel and the Share band are panes too. Each landing keeps its colour edge, "Works best" its green ring,
  "+ Add a landing" stays the solid primary tile, and Hour by hour keeps its own black plate so the lanes stay crisp.
- **404.** The nebula, with the page's own sentence as its headline.
- **Header.** The Moon mark turns as the page scrolls; the current section is underlined.

## Luna
- Her pet is a little robot rabbit: a white shell, blue bands, leaf ears, a black visor whose blue LEDs make her
  face, and a crescent Moon on her chest. Faces: idle bars, ^ ^, wide eyes listening, thinking dots, talking, star
  eyes, red ⊘ when the microphone is blocked, red x x when offline.
- In 3D (`LunaBot`, three.js) she floats at the lower left of every framed page (`LunaDock`) with faint sparkles,
  a soft glow and a stream of light flowing round her; she follows the pointer, blinks, and every few seconds
  wiggles her ears, looks about, hops, spins, waves or shows star eyes. A press turns Luna on and opens her panel
  beside her; a drag moves her anywhere, and the browser remembers where. She stands on Explore's pinned time bar.
  Without WebGL her drawn pet stands in.

## Components
`components/ui/halftone-nebula.tsx` (with `moonstone` and `paper` presets), `MoonNebula`, `SectionHead`, `Reveal`,
`Tip`, `NavLinks`, `home/EarthriseScene`, `home/ForecastHover`, `luna/LunaPet`, `luna/LunaBot`, `luna/LunaDock`.
Textures and their credits: `web/public/hero/textures/`.

## 23.1 The descent (replaces the arrival's flight)
- One WebGL picture (`home/Descent`, `home/DescentScene`) from the first screen to the answer, six screens of scroll:
  the Moon turns 1¼ times, tips its south pole towards the camera and comes closer on a log scale, from the whole
  Moon to the polar cap to the site. No stills are swapped: NASA's Moon map, the relief map of the pole, the shadows
  round the site and the site's shadow picture lie on the one globe in the pipeline's south polar stereographic projection (`lib/viz/descentPose`,
  tested against the relief map's own pins), so the view sharpens as it nears.
- One line of words per stage (the Moon turns; the south pole; the site; the answer), never two at once; names on
  the polar map; a rail at the side that names the stages and jumps to any of them. No line telling anyone to scroll.
  "Fly to the south pole" plays it in 11 s; a wheel, a touch or a key stops it. Reduced motion stops at each stage's
  own view. Without WebGL, the still, the relief map and the site's picture stand in.
- **Never under the words.** The page measures the first screen's words and the rail and puts the Moon in the
  largest room left: right of the words on wide screens, under them on tall ones; Earth sits clear of the words, the
  rail and Luna. The title steps from 35 to 84 px with the width. Measured gap from the Moon's edge to the nearest
  line of words, with the audience line, both themes: 107–124 px at 1920, 58 at 1440, 97–99 at 1280, 47 at 1024, 31
  at 768, 24 at 390; no width
  scrolls sideways. The first paint and browsers without WebGL show cut-outs of the Moon and Earth in the same places.
- **Arriving at the site.** The turn settles before the site's shadows come in (at 60 % of the scroll), so they
  arrive upright, as on the site map. The camera reaches the site where the site's words begin to show, and the 20 km
  picture then covers the whole view, a tenth to spare, so no frame of blurred map is left round it (14 November,
  after a look at the live site).
- **The dive (15 November, after the owner's phone showed it mid-dive).** The 500 km map (480 m a pixel) and the
  20 km picture (20 m) are too far apart to meet: the picture stood as a small sharp square on a map magnified to a
  blur. Between them now lies a third picture, the same hour's shadows 82 km across from the 80 m grid
  (`/hero/de-gerlache-rim-2-wide.jpg`, 512 px, 52 kB, its greys matched to the site's picture). It comes in from 60 to
  65 % with a wide soft edge while the map dims round it, the view centres on the site by 66.5 %, and the site's
  picture sharpens inside it with no edge of its own, since both show the same ground in the same light
  (`descentPose.test.ts`: the wide picture is whole before the view is as narrow as it is, and the site's before it
  fills half the view).
- **Easing.** Every move eases in and out, the spin included. The Moon holds its place and size until the first
  screen's words have gone; the picture glides after the scroll, so wheel steps do not jolt it; the idle spin slows
  to a stop as the page starts to scroll. Under reduced motion nothing glides or turns. The rail's dots stand in one
  column; its labels sit on dark plates and show from 1024 px.

## 23.2 Luna's chat
- Her panel is a chat: her greeting, your lines on the right in blue, hers on the left with her face, three dots
  while she works, and ready-made messages to start. The conversation lasts from page to page (`lunaStore.messages`).
- She listens as spec 22 has it: each phrase heard is a command and her reply is said aloud; the panel's microphone
  pauses and restarts the listening; typed words are answered in the conversation; and a switch at the panel's foot,
  "Say replies aloud" (a 44 px row whose pill fills with the accent when on; on at first, and remembered in the
  browser, `lunaStore.voice`), keeps every reply to the conversation when off, stopping her at once mid-reply.

## 23.3 Clearer sections
- The forecast reads in three steps with room between them: the Sun, Earth, the lander. Each step is a figure in its own framed panel, a step lighter than the black band (`--stage-raised`), not a full-bleed row. A locator beside the title marks the site at the Moon's south pole, and a small drawing beside each chart (`home/ForecastFigures`) shows the viewer standing at the site, with the Sun or Earth above the hills and behind them. The lander's lanes are thick and coloured as the view from the site's key: warm white for sunlight, blue for Earth in view, green for radio contact, with the dates under them.
- **Earth in view is not radio contact** (15 November, owner review). The Earth row is named "Earth in view" and its
  hidden stretches "Out of view"; it never says "contact". The lander step states the rule, "Radio contact needs
  power and Earth in view at once", and draws it on the rows' own time scale (`ContactStrip`, `lib/viz/homeContact`):
  a lane of sunlight on the site (power), a lane of Earth in view, and a lane with only the hours of both, 20 to 23
  January, 3 d 5 h. Every other stretch says what it lacks: "Earth out of view", or, for 10 to 20 January, "Earth in
  view, but no power: night". Each landing's card gives its radio contact beside its power: none for 1 January (the
  battery runs out before Earth rises), 3 d 5 h for 20 January. The figures are the engine's battery walk and
  home.json's, checked against each other in `homeContact.test.ts`.
- **02 is "Why the south pole?", in questions and answers a 7-year-old could follow** (`WhySimple`; 15 November,
  owner review). Five questions, each a heading: why NASA is looking there (ice has been found in its darkest,
  coldest craters; one day it could give water, air and rocket fuel; some hilltops stay in sunlight for a whole
  month), why landing is hard, why the hills matter, why Earth matters, and what Earthrise does. Short sentences and
  everyday words: no degrees or science terms, no mission dates, nothing promised, no survival wording. The real
  figures stay: one hilltop sunlit all January 2027, a ridge 12 km away dark from 3 to 20 January.
- Three of the questions have a drawing with one idea each, no axes and a label or two: the Sun at its true height
  at the pole beside Apollo 15's high Sun; a hilltop in sunlight beside ground behind a hill; Earth half risen over
  the hills (it rises and sets in place; still under reduced motion). The last answer links to How it works.
- **How it works shows the same three drawings, framed** (`WhySection`; 15 November, owner review: the three charts
  were too much). "Why the south pole is hard" is three `.panel` figures: the home page's drawing on a black plate,
  the month's one figure under it (the Sun's highest, 2.5°; the ridge in sunlight 45 % of the month and Earth in view
  45 %, each as one thick lane of the month, warm white and blue, with no axis), a heading and two or three short
  sentences. The charts by direction and height (`WhyDrawings`, `lib/viz/why`), with their Play buttons, wait behind
  one fold, "See the detailed charts". The science and cold-trap paragraphs below sit in the same framed panels.
  The page has its own sky (15 November, owner review: the background was bland): the title stands on the halftone
  nebula (`MoonNebula`, one still frame, not interactive, the page's colour over the words), the sections on a field
  of faint still stars, two small SVG tiles in the stylesheet (`.star-field`; ink specks on paper, never printed),
  and each drawing, here only (`sky="stars"`; the home page's keep their flat black plates), has a night sky of
  faint stars, a soft glow round the Sun or Earth and grey ground with stones and shallow craters.

## 23.4 Explore, reordered
(15 November, owner review: less scrolling, plainer words, the player only where things move.)
- **The order.** Where on the Moon first and short (a 240 px map, the place's line, the three nearest sites in one
  row; on a phone the map and the list wait behind "Map and nearby sites"). Then the band (site, dates, lander),
  the answer and the numbers. Then the two parts that move with the hour, side by side from 1280 px and stacked
  below it: the hour-by-hour chart with the radio windows under it, and the ground (`GroundPanel stacked`,
  `TimeChart half`). Then every landing day of the next 12 months, the assistant, and a closing panel, "How sure are
  these numbers? We checked them against NASA's own figures.", with one white button, "See the checks", to Accuracy
  (`btn-ink`, so the answer keeps the page's one gold action).
- **The player.** The time bar is the last child of the section "Hour by hour" and sticks to the window's foot
  inside it, so it shows only while the chart or the ground is on screen and leaves with them; it is never fixed.
  It stays in the page's reading and tab order, after the ground. Luna stands on the bar only while it is at the
  window's foot (`LunaDock`), and on the page's own foot elsewhere.
- **The site is a drop-down on the page** (`SitePicker`, in the band): the catalogue in the Sites page's groups and
  order, the site shown marked, then "Your own site…". A site chosen loads in place and keeps the dates and the
  lander; the arrow keys move through the list, Escape closes it. No trip to `/sites`.
- **A place of one's own** (`OwnSite`). "Your own site…" opens two empty fields under the band, latitude and
  longitude, and keeps the dates and the lander. `/explore?own=1` (the Sites page's "Choose your own site") fills
  nothing in and asks in three steps: where (the two fields, or a press on the relief map of the pole), when (the
  landing date, its hour in UTC, the days), and the lander, which starts from the default and says so. "Work it
  out" checks each step in the page's own words, traces the hills, and the page becomes the usual Explore for the
  place, its address `/explore?site=custom_<lat>_<lon>&start=&days=`. Until then the address stays `?own=1`. The
  checks are the Sites page's former "Somewhere else": south of 60° S, and a plain sentence where the height tiles
  are missing. "Your own point is not checked for landing" stands under the button.
- **Measured** at 1440 px: the page is 3778 px tall, from 4406; on a 390 px phone 6289, from 6670.

- **The guided arrival (`tour=1`).** (15 November, owner: "one thing at a time, and the page moves on through a user
  action".) The Choose a site map's marker and card links add `tour=1`; no other link does, so shared links, the
  journeys, Compare's "Explore it" and the assistant open the full page. With it Explore shows one part at a time, in
  the page's own order: 1 Where on the Moon, 2 The answer (the band, the verdict, the numbers), 3 Hour by hour (the
  chart, the ground, the player), 4 The year, 5 Questions and checks (the assistant and "How sure"). Each step ends
  with one button, "Next: <what comes next>"; pressing it, or scrolling on past the end of the page once it has
  rested there (a wheel pushed on, a finger dragged up), brings the next part in with a fade and an 18 px rise over
  400 ms (`step-in`), scrolls to it smoothly, puts the focus on its heading and says "Step n of 5: <name>" in a polite
  live region. Parts shown stay, so the page builds into the full page. A quiet line stays at the top of the window
  while parts wait: "Step n of 5" and "Show everything", which shows the rest at once without scrolling. While parts
  wait the address keeps `tour=1` (a reload stays in the tour, from step 1); at the end, or on "Show everything", it
  drops it, so a link copied from there opens the full page; the share dialog's link never carries it. Under reduced
  motion nothing animates and the scroll is instant. `?own=1` has no tour. A part not yet shown is not rendered
  (`components/explore/Tour.tsx`: `useTour`, `TourStep`, `TourBar`, `TourNext`).

## 23.5 Compare, made plain
(15 November, owner review: "I don't know what slip is. I don't know what change is doing"; adding a site to compare
was the part that could not be found.)
- **The words.** The page is "Compare landings": "Put up to four landings side by side: different places, dates or
  landers. See which has the most power and radio contact." A column is a landing: the first is "Your landing", the
  others "Landing 2" to "Landing 4". "Baseline", "scenario", "Slip…", "Nearby site…" and "Change…" no longer show.
  Only visible words changed: the code, the files and the address keep `scenario`, `baseline` and their parameters,
  so old links and files open as before.
- **Empty.** "Start here" says what to press: "Press the example to see three landings compared. Then press
  '+ Add a landing' to add any place or date of your own." The one gold button is "What if our landing is 5 days
  late?"; under it two more examples ("A ridge vs the summit 12 km away", "A sunlit rim vs a crater floor in
  shadow"), "Set up my own landing" (the landing Explore shows, with its place, date and lander open to set), the
  way in from Explore, and one line naming the assistant's request ("compare this to every landing site").
- **"+ Add a landing"** (`compare/AddLanding`) is the page's one gold control once a landing is on it, the last
  tile of the row of cards. It opens three ways, each a copy of a landing ("Start from a copy of", your landing
  unless another is chosen) with one thing moved: "Same place, later date" (a number of days or hours, later or
  earlier, five days later to begin with); "A place nearby, same date" (the best listed site within 30 km, added
  if it works better); "Any place and date" (Explore's `SitePicker`, imported, and a date; the lander and the stay
  are kept). Beside a landing on its own the ways start open; after an add they close and the keyboard stays on
  the button. At four landings the tile says to remove one first.
- **Cards.** Each says which landing it is, its name, its place and its date, with "Edit place, date or lander" and,
  under "More", "Copy this landing", "Make this your landing", "Save as a file" and "Remove".
- **Which landing works best** (`verdictLine`, lib/viz/compare). One line over the comparison: the landing with the
  longest time with power, then the most radio contact while it has power, then the most sunlight (the nearby
  search's order), with the figure that decided it; its card carries "Works best". Landings that are level are said
  to be level, as the page shows them (sunlight to the whole percent). With the same time with power, the line and the
  story's "works better than" name the figure that decides it, radio contact while it has power or sunlight, with both
  values, or say "works as well as": never "10 hours instead of 10 hours". A landing on incomplete terrain is never named, and a high point worked out from the heights is said
  not to be checked for landing. The story under it keeps its sentences, as "Same place, another date" and "Another
  place".
- **The table.** The best cell of a row is marked "Best" for time with power, sunlight, Earth in view, radio
  contact while it has power, the longest night and your requirements: only when every landing has its figure and
  they are not all level, never for a landing on incomplete terrain, and not at all when that landing shows the
  best value. The longest time without Earth is not marked, as the period's ends cut it ("at least"). "The answer"
  is "What happens"; "Its own best landing" is "Best landing time at this place".
- **Kept.** The address and share links, files, the requirements row, the brief, "Compare from here", the
  assistant's and Luna's ways in, the word caps (200 empty, 750 full) and one gold action at most.
- **Made visual** (15 November, owner review: "very bland", too much text, figures that blend into the page). Each
  landing has a colour of its own (`--landing-1` to `--landing-4`, apart from the lanes' warm white, blue and
  green), on its card's top edge, its bars and its strip. The verdict is a band with a green edge: its one line and
  the timing line; "What changed and why" folds the story's sentences and the trade-offs. A card shows its time with
  power as a big number in its colour with its radio contact under it; the best has a green ring, "Works best" and
  the deciding figure in a few words (`Verdict.reason`). "Hour by hour" (`compare/LandingStrips`) is a black picture
  panel in both themes: per landing, three lanes on one axis of days after its landing (sunlight, Earth in view,
  radio contact with power: Earth in view with power before the battery first runs out, the table's figure), a red
  line at the first power cut, and a sentence per landing for screen readers. "The key figures"
  (`compare/MetricBars`) draws time with power, radio contact while it has power, sunlight and the longest night as
  one bar per landing, the hours on one scale (the longest stay), with the table's values and "Best" marks. The
  table waits behind "All figures"; "Share or keep", "Assumptions and limits" and "Start again" share one band. The
  empty page keeps its gold example over three tiles (two examples, "Set up my own landing"). At 1440 px the
  five-day example fell from about 3000 px and 690 words to about 2150 px and 460 words.

## 23.6 Accuracy, shown

Owner review (15 November): explain "Where shadows fall in pictures from orbit", name the datasets used, and make
the page less bland, like the hero. The page opens on a band of the Moon's night sky (`MoonNebula`, black in both
themes) with the title, one line and the verdict; the five kinds of evidence are tiles (`.panel`, two to a row on
a wide screen), each with a pass, miss or context badge, one big figure and one sentence, its parts and its table
still folded. The pictures' tile shows one real picture of the check, the Wide Angle Camera's frame of the peak
near Shackleton on 23 September 2009, beside the app's shadows for the same minute with the ground the two call
differently in orange (`web/public/validation/shadows-camera.jpg` and `shadows-app.jpg`, about 110 KB together,
drawn by `pipeline/scratch/accuracy_example.py`), a line on how to read it, and a few plain sentences from the
table's own numbers: what was compared, what the typical 92 % means, why the control matters, why three pictures
miss (the Sun 1.1° up or less) and that the check still misses its own mark. "Data used"
(`validate/DataUsed`) lists each dataset with who made it and what Earthrise uses it for, linked to the sources
`docs/data-credits.md` names.
