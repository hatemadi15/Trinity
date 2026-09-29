'use client';
import { useStore } from 'zustand';
import { exploreStore, type Audience } from '@/lib/store/explore';

const OPTIONS: [Audience, string][] = [
  ['planner', 'Planner'],
  ['learn', 'Learn'],
];

/** Header switch between the planner view and Learn mode (fewer numbers, plain words, a guided story). */
export function AudienceToggle() {
  const audience = useStore(exploreStore, (s) => s.audience);
  return (
    <div role="group" aria-label="Audience" className="flex gap-1 text-sm">
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={audience === value}
          onClick={() => exploreStore.getState().setAudience(value)}
          className={`rounded-md border px-2 py-0.5 ${audience === value ? 'border-sun text-ink' : 'border-line text-ink-2 hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
