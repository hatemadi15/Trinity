import type { Series } from '../engine/metrics';
import type { Hidden } from './shadowmap';

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** The nearest of the eight compass points to an azimuth (degrees from north through east). */
export function compassWord(azDeg: number): string {
  return POINTS[Math.round((((azDeg % 360) + 360) % 360) / 45) % 8];
}

/**
 * A height in degrees: to a tenth of a degree under 10° ("2.5°", "2.0°"), where near a pole the Sun and Earth
 * spend their days and a whole degree says too little, and whole from 10° ("12°"). The switch sits at 9.95°,
 * where a tenth would round to 10.0°. The forecast's sentences and the stand view's labels both use it, so
 * they give the same height for the same hour.
 */
export const degrees = (v: number) => (Math.abs(v) < 9.95 ? `${(Math.round(v * 10) / 10).toFixed(1)}°` : `${Math.round(v)}°`);

/**
 * The ground panel's words for one hour: whether the site is in sunlight and why not, and whether
 * Earth is in view for radio contact and why not, from the same series as the rest of the page; and
 * the map's short words for the same hour.
 */
export function groundWords(series: Series, hour: number): { sun: string; earth: string; siteState: string; sunHidden: Hidden; earthHidden: Hidden } {
  const f = series.sunFraction[hour];
  const el = series.sunEl[hour];
  const toward = compassWord(series.sunAz[hour]);
  let sun: string;
  let siteState: string;
  let sunHidden: Hidden = 'no';
  if (f >= 0.999) {
    // From a high site the skyline dips below level, so the Sun can show while at or just below level.
    sun = `The site is in sunlight: the Sun is ${el < 0.05 ? 'on the horizon' : `${degrees(el)} above the horizon`}, to the ${toward}.`;
    siteState = 'in sunlight';
  } else if (f > 0) {
    const before = hour > 0 ? series.sunFraction[hour - 1] : f;
    const after = hour + 1 < series.hours ? series.sunFraction[hour + 1] : f;
    const moving = after > before ? 'rising' : after < before ? 'setting' : 'partly hidden';
    sun = `The site is partly in sunlight: the Sun is ${moving} behind the hills to the ${toward}.`;
    siteState = 'partly in sunlight';
    sunHidden = 'partly';
  } else if (el < 0) {
    sun = `It is night at the site: the Sun is below the horizon, to the ${toward}.`;
    siteState = 'at night';
  } else {
    // Within a twentieth of a degree of level it is on the horizon, as in sunlight, never "0.0° above" it.
    sun = `The site is in shadow: the Sun is ${el < 0.05 ? 'on the horizon' : `${degrees(el)} above the horizon`} but behind the hills to the ${toward}.`;
    siteState = 'in shadow';
    sunHidden = 'yes';
  }

  const earthEl = series.earthEl[hour];
  const earthToward = compassWord(series.earthAz[hour]);
  let earth: string;
  if (series.earthVisible[hour] === 1)
    earth = earthEl < 0.05 ? `Earth is in view on the horizon to the ${earthToward}: radio contact is possible.` : `Earth is in view, ${degrees(earthEl)} above the horizon to the ${earthToward}: radio contact is possible.`;
  else if (earthEl < 0) earth = 'Earth is below the horizon: no radio contact.';
  else earth = `Earth is behind the hills to the ${earthToward}: no radio contact.`;
  const earthHidden: Hidden = series.earthVisible[hour] !== 1 && earthEl >= 0 ? 'yes' : 'no';
  return { sun, earth, siteState, sunHidden, earthHidden };
}
