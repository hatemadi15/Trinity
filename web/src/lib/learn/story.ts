export interface StoryStep {
  title: string;
  body: string;
}

/** Five steps through the pages, in the order a first-time visitor meets them. */
export const STORY_STEPS: StoryStep[] = [
  {
    title: 'Choose a landing site',
    body: 'The site list shows every place the tool knows near the south pole, sorted by how long a solar lander keeps power there if it lands on the best day of the period you choose. Picking a site opens Explore on that day. Any other point south of 60° S can be worked out too.',
  },
  {
    title: 'Read the answer',
    body: 'Explore answers for a lander that lands on the first day of the period: how long it has power, how much of that time Earth is in view for radio, and a better landing day or a better place nearby when there is one.',
  },
  {
    title: 'See why, hour by hour',
    body: 'The chart shows the Sun, Earth and the battery over the period. The Sun skims the hills; when it drops behind them the battery takes over until it runs out. Press Play, or drag the time bar at the bottom, to move through the days. Times are in UTC, the clock time at Greenwich on Earth: the Moon keeps no clock of its own.',
  },
  {
    title: 'Look at the ground',
    body: "The shadow map shows the ground around the site from above at the time bar's hour, with north up, and says whether the site is in sunlight. The 3D view from above shows the same light on the hills. The horizon chart unrolls the horizon in every direction into one strip, with the paths of the Sun and Earth over the hills.",
  },
  {
    title: 'Compare and check',
    body: 'Compare puts up to four sites side by side for the same days and lander. Accuracy shows what each check establishes, what it was tested on and what it leaves out, with past missions as context, and lets you rerun one check live.',
  },
];

/** The science behind the three facts of "Why the south pole is hard", for a class: each with a sum or a word to look up. */
export const SCIENCE: StoryStep[] = [
  {
    title: 'Why the Sun stays low',
    body: "The Moon's axis is tilted only about 1.5° from upright to its path around the Sun. Earth's is tilted 23.4°, which is why we have seasons. So near the Moon's poles the Sun never climbs more than a few degrees: it circles the horizon once a lunar day, about 29.5 Earth days.",
  },
  {
    title: 'Why Earth rises and sets so slowly',
    body: 'The Moon always turns the same face to Earth, so from the Moon Earth hangs almost still in the sky. A slow monthly wobble, called libration, moves it a few degrees up and down and from side to side. Near the pole that is enough to make Earth rise over the hills, or set behind them, for days at a time.',
  },
  {
    title: 'How to read the grey in the charts',
    body: "The grey under the Sun's line is not a picture of one mountain. Hour by hour it shows how high the hills stand in the direction the Sun is in at that hour, so its shape changes as the Sun goes round. When the gold line runs under the grey, the Sun has set behind the hills.",
  },
  {
    title: 'The battery sum',
    body: 'A 2 kWh battery feeding a lander that uses 200 W lasts 2,000 ÷ 200 = 10 hours. In full sunlight a 4 m² panel at 30\u00a0% efficiency makes about 4 × 1,361 × 0.3 ≈ 1,600 W, eight times what the lander uses: the panel is not the problem, the hours without the Sun are.',
  },
];
