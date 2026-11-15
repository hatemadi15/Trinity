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
  numbered sections in one line (`SectionHead`) that alternate in both themes, black then paper, each with the same
  room above and below and one clean edge between: 01 the forecast on black, which reads hour by hour under the
  pointer or the arrow keys (`ForecastHover`); 02 why the south pole, in questions and answers (23.3), on paper (`.theme-light`); 03 real
  places as whole-row links on black (`.theme-dark`); 04 the checks on paper; 05 where to go next, over the halftone
  nebula, black in both themes after 04's paper. No folds. The words under the descent were cut (15 November, owner
  review) from 914 words of text to about 620, and outside 02's questions from 653 to about 430, held by caps in
  `page.test.tsx`.
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
- The forecast reads in three steps with room between them: the Sun, Earth, the lander.
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
- The charts of the same three facts by direction and height (`WhySection`, `WhyDrawings`, `lib/viz/why`), with
  their Play buttons, the Moon's 1.5° tilt and the rule of thumb for angles, now stand on How it works only.