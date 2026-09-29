export interface StoryStep {
  title: string;
  body: string;
  /** Shown instead of `body` when the 3D view is unavailable. */
  noWebgl?: string;
}

/** The five moves of the Learn story, in the order a first-time visitor takes them. */
export const STORY_STEPS: StoryStep[] = [
  {
    title: 'Pick a landing site',
    body: 'Choose a site from the list, or click the globe near the south pole. Each one has its own skyline of crater rims and ridges.',
  },
  {
    title: 'Drag through time',
    body: 'Drag the time slider. The terrain shadows sweep, the Sun and Earth move on the sky dome, and the timeline bars show sunlit hours and Earth contact.',
    noWebgl:
      'Drag the time slider. The Sun and Earth move on the sky dome and the timeline bars show sunlit hours and Earth contact; the 3D terrain view needs WebGL, which this device does not offer.',
  },
  {
    title: 'Read the skyline',
    body: 'On the sky dome the grey rim is the terrain. The Sun only counts when it clears that rim, and near the pole it never rises high, so a small hill can hide it for days.',
  },
  {
    title: 'Count the night',
    body: 'The longest night tile is the longest stretch without sunlight. A lander runs on its battery for all of it, so this number decides whether it survives.',
  },
  {
    title: 'Compare and choose',
    body: 'Press Add to compare on a few sites, then open Compare. The best-window button finds the span of days with the most Sun and Earth contact.',
  },
];
