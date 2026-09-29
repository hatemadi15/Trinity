'use client';
import { useState } from 'react';
import { STORY_STEPS } from '@/lib/learn/story';

export function GuidedStory({ webgl }: { webgl: boolean }) {
  const [step, setStep] = useState(0);
  const current = STORY_STEPS[step];
  const text = !webgl && current.noWebgl ? current.noWebgl : current.body;
  return (
    <section aria-label="Guided story" className="glass flex flex-col gap-3 rounded-md border-sun/40 p-4">
      <ol aria-label="Guided story" className="flex flex-wrap gap-2 text-sm">
        {STORY_STEPS.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === step ? 'step' : undefined}
            className={`rounded-md border px-2 py-1 ${i === step ? 'border-sun text-ink' : 'border-line text-ink-2'}`}
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
          className="rounded-md border border-sun px-3 py-1 text-sm text-ink hover:bg-sun/10 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </section>
  );
}
