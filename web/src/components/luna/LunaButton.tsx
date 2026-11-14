'use client';
import { useState } from 'react';
import { createStore, useStore } from 'zustand';
import { lunaStore, type LunaStatus } from '@/lib/luna/store';
import { KAOMOJI, LunaPet, lunaMood } from './LunaPet';

/** What Luna is doing, in her panel. */
const STATUS: Record<LunaStatus, string> = {
  off: '',
  listening: 'Listening. Say what you would like to see.',
  thinking: 'Working on it…',
  speaking: 'Speaking…',
  typing: 'This browser has no voice input: type to Luna below.',
  blocked: 'The microphone is not allowed for this page: allow it in the address bar, or type below.',
  offline: 'Voice input needs the internet here: type to Luna below.',
};

/**
 * Where Luna's panel opens: under the header's button, or beside her 3D self at the page's corner (LunaDock), as
 * whichever was pressed last. One panel at a time.
 */
export const lunaPlace = createStore<{ at: 'header' | 'dock' }>()(() => ({ at: 'header' }));

/**
 * What Luna is doing, what she heard and said, a box to type to her and examples of what to say: her panel, wherever
 * it opens. `className` places it.
 */
export function LunaPanel({ className }: { className: string }) {
  const status = useStore(lunaStore, (s) => s.status);
  const heard = useStore(lunaStore, (s) => s.heard);
  const reply = useStore(lunaStore, (s) => s.reply);
  const [text, setText] = useState('');
  const mood = lunaMood(status);
  return (
    <section aria-label="Luna" className={className}>
      {/* Her pet and what she is doing, as a little speech bubble. */}
      <div className="flex items-center gap-3">
        <LunaPet mood={mood} size={64} className="text-ink-3" />
        <div className="min-w-0">
          <p aria-hidden="true" className="mono text-[14px] tracking-wide text-accent-ink">
            {KAOMOJI[mood]}
          </p>
          <p className="font-semibold">{STATUS[status]}</p>
        </div>
      </div>
      {heard && <p className="mt-2 text-ink-2">You said: “{heard}”</p>}
      {/* Always in the panel, so her first reply is read out too: a live region must be there before it changes. */}
      <p aria-live="polite" className="mt-1">
        {reply ?? ''}
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          lunaStore.getState().submit(t);
          setText('');
        }}
      >
        <input
          type="text"
          aria-label="Type to Luna"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type here"
          maxLength={300}
          className="field h-11 min-w-0 flex-1 placeholder:text-ink-3"
        />
        <button type="submit" className="btn h-11 px-4">
          Send
        </button>
      </form>
      <p className="mt-3 text-[14px] text-ink-2">Try: “open the view from the site”, “play”, “next”, “turn to Earth”, “compare de Gerlache Rim 2 and Nobile Rim 2”.</p>
    </section>
  );
}

/**
 * Luna's button and panel (spec 22): a toggle named Luna, off at first. On, her panel shows what she is doing, what she
 * heard and what she said (read out to a screen reader as it comes), a box to type to her (her only way in where the
 * browser cannot listen, and always there), and examples of what to say. `className` styles the toggle as its place
 * needs (the header's, the view from the site's row); `panelClassName` places the panel (below the toggle by default).
 */
export function LunaButton({ className, panelClassName }: { className?: string; panelClassName?: string }) {
  const on = useStore(lunaStore, (s) => s.on);
  const status = useStore(lunaStore, (s) => s.status);
  const at = useStore(lunaPlace, (s) => s.at);
  const mood = lunaMood(status);
  return (
    // The toggle's box frames the panel from 640 px; on a phone the header's does, so the panel spans the screen.
    <div className="sm:relative">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          lunaPlace.setState({ at: 'header' });
          lunaStore.getState().setOn(!on);
        }}
        className={
          className ??
          'group flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong py-0 pl-1.5 pr-3.5 text-[15px] text-ink-2 transition-[border-color,box-shadow,color] duration-300 hover:border-accent hover:text-ink hover:shadow-[0_0_22px_-6px_rgb(var(--glow)/var(--glow-strength))] aria-pressed:border-accent aria-pressed:text-ink aria-pressed:shadow-[0_0_22px_-6px_rgb(var(--glow)/var(--glow-strength))]'
        }
      >
        {/* Her pet, asleep until she is on; she peeks while the pointer is on the button. */}
        <LunaPet mood={mood} size={32} peek className="-my-1" />
        Luna
      </button>
      {on && at === 'header' && (
        <LunaPanel
          className={
            panelClassName ??
            'absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-32px))] rounded-2xl border border-line-strong bg-surface p-4 text-left text-[15px] text-ink shadow-[0_0_0_1px_rgb(var(--glow)/0.15),0_24px_60px_-20px_rgb(var(--glow)/var(--glow-strength))] max-sm:left-4 max-sm:right-4 max-sm:w-auto'
          }
        />
      )}
    </div>
  );
}
