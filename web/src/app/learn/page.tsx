import { AppFrame } from '@/components/AppFrame';
import { LearnStart } from '@/components/LearnStart';
import { STORY_STEPS } from '@/lib/learn/story';

export default function LearnPage() {
  return (
    <AppFrame>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
        <h1 className="font-display text-[44px] font-semibold leading-tight tracking-tight">Learn: fourteen days of night</h1>
        <p className="max-w-prose text-lg text-ink-2">
          Near the Moon&apos;s south pole the Sun never climbs high. It circles the horizon, so a crater rim can hide it for weeks and Earth can drop out of
          sight for days. Learn mode walks the same screens planners use in five steps, with fewer numbers and plain words.
        </p>
        <ol className="flex flex-col gap-3">
          {STORY_STEPS.map((s, i) => (
            <li key={s.title} className="glass rounded-md p-4">
              <p className="font-display text-lg font-semibold">
                {i + 1}. {s.title}
              </p>
              <p className="text-sm text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
        <LearnStart />
      </main>
    </AppFrame>
  );
}
