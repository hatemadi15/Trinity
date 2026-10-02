export interface StoryStep {
  title: string;
  body: string;
}

/** Five steps through the pages, in the order a first-time visitor meets them. */
export const STORY_STEPS: StoryStep[] = [
  {
    title: 'Choose a landing site',
    body: 'The site list shows every place the tool knows near the south pole, sorted by how long a solar lander keeps power there. Each figure is for the best landing day in the period you choose, and any other point south of 60° S can be worked out too.',
  },
  {
    title: 'Read the answer',
    body: 'Explore opens on the answer for a lander that lands on the first day: how long it has power, how much of that time Earth is in view for radio, and a better landing day or a better place nearby when there is one.',
  },
  {
    title: 'See why, hour by hour',
    body: 'The chart shows the Sun, Earth and the battery over the period. The Sun skims the hills; when it drops behind them the battery takes over until it runs out. Press Play, or drag the time bar at the bottom, to move through the days. Times are in UTC, the clock time at Greenwich on Earth: the Moon keeps no clock of its own.',
  },
  {
    title: 'Look at the ground',
    body: "The shadow map shows the ground around the site from above at the time bar's hour, with north up, and says whether the site is in sunlight. 3D shows the same light on the hills, and the view all round shows the hills with the paths of the Sun and Earth.",
  },
  {
    title: 'Compare and check',
    body: 'Compare puts up to four sites side by side for the same days and lander. Accuracy shows how each step was checked against an independent NASA source, and lets you rerun one check live.',
  },
];
