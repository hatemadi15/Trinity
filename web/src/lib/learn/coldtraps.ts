import type { StoryStep } from './story';

/**
 * How it works: cold traps, for the public. Why they matter, what Earthrise shows of them, what that does not
 * establish and what could. Ice appears only as "ice could last": the figures are modelled conditions.
 */
export const COLD_TRAPS: StoryStep[] = [
  {
    title: 'Why cold traps matter',
    body: 'Near the poles the Sun stays so low that the floors of some craters never see it. They stay colder than 110 K (−163 °C) all year: so cold that water ice could last there for billions of years, if comets, asteroids or the solar wind ever brought water. Water there would be worth a great deal: to drink, to split into oxygen to breathe and into rocket fuel, and as a record of where the Moon’s water came from.',
  },
  {
    title: 'What Earthrise shows',
    body: 'For each site near the south pole: how much ground within 5 km stays below 110 K all year in the temperature model of NASA’s Diviner instrument, on the Lunar Reconnaissance Orbiter, the nearest such ground and the steepest slope on a straight line to it, from NASA’s adjusted maps of the south pole. It sits beside the power and the radio because the two pull apart: the cold ground is cold because the Sun never reaches it, so a solar lander has to stay in the light and reach in.',
  },
  {
    title: 'What this does not establish',
    body: 'These are modelled conditions where ice could last, not a finding that any is there, how much or how deep. The model fits one year of Diviner’s temperature measurements on patches about half a kilometre across, so it misses cold spots smaller than that. And shadow is not the same as cold: a small shadow is warmed by the sunlit slopes around it, and at 7 of the 18 sites none of the permanently shadowed ground within 5 km is cold enough in the model.',
  },
  {
    title: 'How to find out what is there',
    body: 'Only instruments that sense the ground itself can say: a drill or a scoop on a lander or a rover, or an impact like the one NASA’s LCROSS made in 2009, which threw up water from the floor of Cabeus crater. Earthrise helps choose where such a mission could keep power and talk to Earth while it looks.',
  },
];
