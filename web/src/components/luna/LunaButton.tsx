'use client';
import { useState } from 'react';
import { useStore } from 'zustand';
import { lunaStore, type LunaStatus } from '@/lib/luna/store';

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

/** A crescent Moon, Luna's mark. */
function Crescent() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" className="shrink-0">
      <path d="M10.6 1.6a6.6 6.6 0 1 0 3.8 11.2A5.6 5.6 0 0 1 10.6 1.6z" fill="currentColor" />
    </svg>
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
  const heard = useStore(lunaStore, (s) => s.heard);
  const reply = useStore(lunaStore, (s) => s.reply);
  const [text, setText] = useState('');
  return (
    // The toggle's box frames the panel from 640 px; on a phone the header's does, so the panel spans the screen.
    <div className="sm:relative">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => lunaStore.getState().setOn(!on)}
        className={
          className ??
          'flex h-11 items-center gap-2 rounded-lg border border-line-strong px-3 text-[15px] text-ink-2 hover:bg-surface-2 aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-page'
        }
      >
        <Crescent />
        Luna
      </button>
      {on && (
        <section
          aria-label="Luna"
          className={
            panelClassName ??
            'absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-32px))] rounded-lg border border-line-strong bg-surface p-4 text-left text-[15px] text-ink max-sm:left-4 max-sm:right-4 max-sm:w-auto'
          }
        >
          <p className="font-semibold">{STATUS[status]}</p>
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
      )}
    </div>
  );
}
