/** Fixed, number-light paragraphs for the five things people ask the planner to explain. */
export const EXPLANATIONS: Record<string, string> = {
  'longest night':
    'The longest night is the longest run of hours in the period when no part of the Sun clears the hills around the site. Near the south pole the Sun circles the horizon at a low angle, so one ridge can cut a lunar day into several short days and nights. A solar lander draws on its battery through each night, which is why the time with power depends on the longest night rather than the average; whether it stays warm enough through the night is a separate question the forecast does not answer.',
  'earth gap':
    'The longest Earth gap is the longest stretch of hours when Earth has set behind the hills or below the horizon, so a direct radio link to Earth is impossible without a relay. Earth moves only a few degrees in the lunar sky over a month, so at a polar site it rises and sets slowly and a gap can last days. Earth counts as in view only when it clears the hills by the minimum height set for the lander.',
  'best window':
    'The best window is the landing date, within the next 12 months, from which the lander keeps power the longest: the hours from touchdown to the first hour the battery cannot cover, counted up to the length of the stay you chose. Only hours with the Sun in view are candidates, because a lander arrives in daylight. When two dates give the same time with power, the one with more contact with Earth wins. On the Compare page the time with power is averaged over the compared sites.',
  skyline:
    'The hills around the site are worked out from NASA elevation data: for each of 720 compass directions the app walks outward across the ground and records the highest angle any hill, rim or mountain reaches above level, as seen from a mast at the chosen height. The Sun and Earth are then compared with those hills hour by hour; the Sun counts as up when any part of it clears them.',
  verdict:
    'The answer says how long a solar lander that lands on the first day keeps power with the panel, load and battery you set: hour by hour the battery charges with what the panel makes beyond the load while the Sun is up, and runs down at the load when it is not, until an hour comes that it cannot cover. "Power for all 30 days" means that never happens in the period; "power for 3 days 4 hours, then night" means it happens then, and the answer says when power could come back, if the lander starts again after the cold. The forecast counts electrical energy only.',
};

const ALIASES: Record<string, string> = {
  'longest dark': 'longest night',
  'longest darkness': 'longest night',
  night: 'longest night',
  'longest earth gap': 'earth gap',
  'earth gaps': 'earth gap',
  'comms gap': 'earth gap',
  'earth visibility': 'earth gap',
  'best window finder': 'best window',
  'best 14-day window': 'best window',
  'best 30-day window': 'best window',
  'best 90-day window': 'best window',
  'best date': 'best window',
  'best landing date': 'best window',
  'best landing day': 'best window',
  horizon: 'skyline',
  hills: 'skyline',
  'hills around the site': 'skyline',
  'terrain skyline': 'skyline',
  'terrain horizon': 'skyline',
  'horizon mask': 'skyline',
  'survive the night': 'verdict',
  'survive-the-night verdict': 'verdict',
  brownout: 'verdict',
  brownouts: 'verdict',
  'time with power': 'verdict',
  answer: 'verdict',
};

/** Resolves a free-text topic to one of the fixed explanations, or null. */
export function explanationFor(topic: string): { topic: string; text: string } | null {
  const t = topic
    .toLowerCase()
    .replace(/[?.!]+$/g, '')
    .replace(/^(the|a|an|our|my) /, '')
    .trim();
  const key = EXPLANATIONS[t] ? t : ALIASES[t];
  return key ? { topic: key, text: EXPLANATIONS[key] } : null;
}
