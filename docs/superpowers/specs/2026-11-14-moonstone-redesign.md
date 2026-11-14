# Spec 23: Moonstone, the redesign (14 November 2026)

Built on the `lea` branch with the UI UX Pro Max skill (`.claude/skills/ui-ux-pro-max`): its design system for
"space science data visualisation, dark, monochrome, editorial" gave Dark Mode (OLED), a monochrome palette with
one blue accent, minimal glows, visible focus and reduced-motion support. This spec supersedes the look of spec 6
(no glows, no gradients, no motion); the tests in `web/src/app/look.test.ts` and `globals.test.ts` hold the new rules.

## Look
- **Colour.** Black and white, like a print of the Moon, with one colour that pops: moonstone blue (`--accent`,
  `#7fa9ff` dark, `#2f62e0` light), which is also Earth. The Sun is drawn warm white. Green and red stay for the power
  verdict only. Glows are the accent's own light: `rgb(var(--glow) / a)`.
- **Type.** Titles in Instrument Serif with its italic (the Default Lingo look; load the licensed Default Lingo under
  `--font-serif` to swap it in), the odd word in Pixelify Sans (Default Lingo's pixel cut), reading in IBM Plex
  Sans, readouts and labels in IBM Plex Mono (`.eyebrow`).
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
  numbered sections in one line (`SectionHead`): 01 the forecast on black, which reads hour by hour under the
  pointer or the arrow keys (`ForecastHover`), with the lander in three figures; then, on paper in both themes
  (`.theme-light`) after one clean edge with room on both sides of it, 02 why the pole is hard (23.3), 03 real
  places as whole-row links and 04 the checks; 05 where to go next, over the halftone nebula. No folds.
- **Choose a site.** The title over the nebula, then three steps on the page (pick the dates, compare the places,
  open one); what the figures count from and what each column means are one point away (`Tip`).
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
  Moon to the polar cap to the site. No stills are swapped: NASA's Moon map, the relief map of the pole and the site's
  shadow picture lie on the one globe in the pipeline's south polar stereographic projection (`lib/viz/descentPose`,
  tested against the relief map's own pins), so the view sharpens as it nears.
- One line of words per stage (the Moon turns; the south pole; the site; the answer), never two at once; names on
  the polar map; a rail at the side that names the stages and jumps to any of them. No line telling anyone to scroll.
  "Fly to the south pole" plays it in 11 s; a wheel, a touch or a key stops it. Reduced motion stops at each stage's
  own view. Without WebGL, the still, the relief map and the site's picture stand in.
- **Never under the words.** The page measures the first screen's words and the rail and puts the Moon in the
  largest room left: right of the words on wide screens, under them on tall ones; Earth sits clear of the words, the
  rail and Luna. The title steps from 42 to 84 px with the width. Measured gap from the Moon's edge to the nearest
  line of words, both themes: 98–118 px at 1920, 58 at 1440, 51 at 1280, 46 at 1024, 31 at 768, 26 at 390; no width
  scrolls sideways. The first paint and browsers without WebGL show cut-outs of the Moon and Earth in the same places.
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
- The forecast reads in three steps with room between them: the Sun, Earth, the lander; each row with its own words
  and key.
- The three drawings of "Why the south pole is hard" are drawn from the month's own figures (`lib/viz/why`), with
  axes labelled in degrees and by direction:
  - **The Sun:** its path round the horizon with day markers, the highest point labelled "2.5°, 1 Jan", and
    Apollo 15's Sun climbing to about 64° for contrast.
  - **The hills:** the ridge's and the rim summit's real skylines, one above the other, each with its own Sun path;
    the ridge's blocked stretch is shaded and labelled "Sun set behind the hills, 3 Jan to 20 Jan", the summit
    "sunlit all month". The summit's month and skyline come from the pipeline (`home_assets.write_all`, home.json).
  - **Earth:** its loop over the month, solid while in view and dotted while set, "in view 45 % of the month".
- Each has a text description in those figures and one line under it saying what to notice. Hovering it or pressing
  its Play button runs a marker along the month with the date; under reduced motion it shows the last frame. All
  their text is 14–15 px; they stand three across only from 1280 px.
