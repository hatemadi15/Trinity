'use client';
import { useState } from 'react';

export interface StoryStep {
  title: string;
  body: string;
  /** Shown instead of `body` when the 3D view is unavailable. */
  noWebgl?: string;
}

/** The five moves of the Learn story, in the order a first-time visitor takes them. */
export const STORY_STEPS: StoryStep[] = [
  { title: 'Pick a landing site', body: 'Choose a site from the list, or click the globe near the south pole. Each one has its own skyline of crater rims and ridges.' },
  {
    title: 'Drag through time',
    body: 'Drag the time slider. The terrain shadows sweep, the Sun and Earth move on the sky dome, and the timeline bars show sunlit hours and Earth contact.',
    noWebgl: 'Drag the time slider. The Sun and Earth move on the sky dome and the timeline bars show sunlit hours and Earth contact; the 3D terrain view needs WebGL, which this device does not offer.',
  },
  { title: 'Read the skyline', body: 'On the sky dome the grey rim is the terrain. The Sun only counts when it clears that rim, and near the pole it never rises high, so a small hill can hide it for days.' },
  { title: 'Count the night', body: 'The longest night tile is the longest stretch without sunlight. A lander runs on its battery for all of it, so this number decides whether it survives.' },
  { title: 'Compare and choose', body: 'Press Add to compare on a few sites, then open Compare. The best-window button finds the span of days with the most Sun and Earth contact.' },
];

export function GuidedStory({ webgl }: { webgl: boolean }) {
  const [step, setStep] = useState(0);
  const current = STORY_STEPS[step];
  const text = !webgl && current.noWebgl ? current.noWebgl : current.body;
  return (
    <section aria-label="Guided story" className="flex flex-col gap-3 rounded-md border border-sun/40 bg-panel p-4">
      <ol aria-label="Guided story" className="flex flex-wrap gap-2 text-sm">
        {STORY_STEPS.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === step ? 'step' : undefined}
            className={`rounded-md border px-2 py-1 ${i === step ? 'border-sun text-ink' : 'border-line text-ink-3'}`}
          >
            {i + 1}. {s.title}
          </li>
        ))}
      </ol>
      <p className="max-w-prose text-ink-2">{text}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setStep((s) => Math.min(STORY_STEPS.length - 1, s + 1))}
          disabled={step === STORY_STEPS.length - 1}
          className="rounded-md border border-sun px-3 py-1 text-sm text-ink hover:bg-panel disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </section>
  );
}
