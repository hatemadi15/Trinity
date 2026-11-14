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
- **Home.** The arrival opens on a WebGL title card: Earth rising over the Moon's limb (NASA Blue Marble with
  clouds, night lights, ocean glint and air glow; LRO's Moon with its relief), which lifts away into the flight as
  the page scrolls. Then five numbered sections in one line (`SectionHead`): 01 the forecast, which reads hour by
  hour under the pointer or the arrow keys (`ForecastHover`), with the lander in three figures; 02 why the pole is
  hard (the drawings play on hover); 03 real places as whole-row links; 04 the checks; 05 where to go next, over the
  halftone nebula. No folds.
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
