import type { Series } from '../engine/metrics';

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** The nearest of the eight compass points to an azimuth (degrees from north through east). */
export function compassWord(azDeg: number): string {
  return POINTS[Math.round((((azDeg % 360) + 360) % 360) / 45) % 8];
}

/** "2°", or "1.6°" below one degree and a half, where a whole number would say too little. */
const degrees = (v: number) => (Math.abs(v) < 1.95 ? `${Math.round(v * 10) / 10}°` : `${Math.round(v)}°`);

/**
 * The ground panel's words for one hour: whether the site is in sunlight and why not, and whether
 * Earth is in view for radio contact and why not, from the same series as the rest of the page.
 */
export function groundWords(series: Series, hour: number): { sun: string; earth: string } {
  const f = series.sunFraction[hour];
  const el = series.sunEl[hour];
  const toward = compassWord(series.sunAz[hour]);
  let sun: string;
  if (f >= 0.999) sun = `The site is in sunlight: the Sun is ${degrees(el)} above the horizon, to the ${toward}.`;
  else if (f > 0) {
    const before = hour > 0 ? series.sunFraction[hour - 1] : f;
    const after = hour + 1 < series.hours ? series.sunFraction[hour + 1] : f;
    const moving = after > before ? 'rising' : after < before ? 'setting' : 'partly hidden';
    sun = `The site is partly in sunlight: the Sun is ${moving} behind the hills to the ${toward}.`;
  } else if (el < 0) sun = `The site is in shadow: the Sun is below the horizon, to the ${toward}.`;
  else sun = `The site is in shadow: the Sun is ${degrees(el)} above the horizon but behind the hills to the ${toward}.`;

  const earthEl = series.earthEl[hour];
  const earthToward = compassWord(series.earthAz[hour]);
  let earth: string;
  if (series.earthVisible[hour] === 1) earth = `Earth is in view, ${degrees(earthEl)} above the horizon to the ${earthToward}: radio contact is possible.`;
  else if (earthEl < 0) earth = 'Earth is below the horizon: no radio contact.';
  else earth = `Earth is behind the hills to the ${earthToward}: no radio contact.`;
  return { sun, earth };
}
