/** Fixed, number-light paragraphs for the five things people ask the planner to explain. */
export const EXPLANATIONS: Record<string, string> = {
  'longest night':
    'The longest night is the longest run of consecutive hours in the window when no part of the Sun clears the terrain skyline. Near the south pole the Sun circles the horizon at a low angle, so a ridge to the right side of the sky can cut a lunar day into several short days and nights. A lander has to live through the longest one on stored energy or another heat source, which is why the verdict weighs the battery against this number rather than the average.',
  'earth gap':
    'The longest Earth gap is the longest stretch of hours when Earth sits below the skyline, so a direct-to-Earth radio link is impossible without a relay. Earth moves only a few degrees in the lunar sky over a month (libration), so at a polar site it rises and sets slowly and a gap can last days. The planner counts Earth as in view only when it clears the skyline by the minimum elevation you set in the planner settings.',
  'best window':
    'The best window is the landing date, within the next 12 months, from which the lander keeps power the longest: the hours from touchdown to the first hour the battery cannot cover, counted up to the length of the stay you chose. Only hours with the Sun in view are candidates, because a lander arrives in daylight. When two dates give the same time with power, the one with more contact with Earth wins. On the Compare page the time with power is averaged over the compared sites.',
  skyline:
    'The skyline is the terrain horizon seen from the site: for each of 720 compass directions the planner walks outward along the LOLA elevation grids and records the highest angle any hill, rim or mountain reaches above the local horizontal, from a mast at the chosen height. The Sun and Earth tracks are then compared with it hour by hour; the Sun counts as up when any part of its disk clears the skyline.',
  verdict:
    'The verdict answers one question: does the battery survive the longest night with the panel, load and battery you set? The hourly budget charges with the surplus while the Sun is up and discharges at the load when it is not; a brownout is an hour when the deficit exceeds what the battery still holds. Green means no brownout in the window, red means the lander goes dark, and the tile shows the lowest state of charge reached.',
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
  horizon: 'skyline',
  'terrain skyline': 'skyline',
  'terrain horizon': 'skyline',
  'horizon mask': 'skyline',
  'survive the night': 'verdict',
  'survive-the-night verdict': 'verdict',
  brownout: 'verdict',
  brownouts: 'verdict',
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
