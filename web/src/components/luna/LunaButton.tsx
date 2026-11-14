'use client';
import { Mic, SendHorizontal, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { lunaStore, type LunaStatus } from '@/lib/luna/store';
import { KAOMOJI, LunaPet, lunaMood } from './LunaPet';

/** What Luna is doing, in her panel. */
const STATUS: Record<LunaStatus, string> = {
  off: '',
  ready: 'Ready. Type, or press the microphone and speak.',
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

/** Ready-made messages, one press each. */
export const SUGGESTIONS = ['open the view from the site', 'play', 'turn to Earth', 'compare de Gerlache Rim 2 and Nobile Rim 2'];

/** A line of the conversation, as a speech bubble: hers on the left with her face, yours on the right in blue. */
function Bubble({ from, children, live = false }: { from: 'you' | 'luna'; children: React.ReactNode; live?: boolean }) {
  const mine = from === 'you';
  return (
    <li data-from={from} className={`flex animate-[bubble-in_0.35s_cubic-bezier(0.16,1,0.3,1)_both] items-end gap-2 ${mine ? 'justify-end' : ''}`}>
      {!mine && <LunaPet mood="happy" size={26} className="mb-0.5 text-ink-3" />}
      <span
        aria-live={live ? 'polite' : undefined}
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 leading-snug ${mine ? 'rounded-br-md bg-accent text-[#050506]' : 'rounded-bl-md border border-line bg-surface-2 text-ink'}`}
      >
        {children}
      </span>
    </li>
  );
}

/**
 * Luna's panel, wherever it opens (spec 23.2): a chat. Her face and what she is doing at the top; the conversation as
 * speech bubbles, her replies read out to a screen reader as they come, with three dots while she works; ready-made
 * messages to start with; and a message box with a microphone, which writes what it hears into the box as it comes,
 * so it can be read and mended before it is sent. `className` places it.
 */
export function LunaPanel({ className }: { className: string }) {
  const status = useStore(lunaStore, (s) => s.status);
  const messages = useStore(lunaStore, (s) => s.messages);
  const draft = useStore(lunaStore, (s) => s.draft);
  const canDictate = useStore(lunaStore, (s) => s.canDictate);
  const [text, setText] = useState('');
  // Whether the words in the box are the microphone's, untouched: their reply is then said aloud too.
  const [voiced, setVoiced] = useState(false);
  const [seenDraft, setSeenDraft] = useState(draft);
  if (draft !== seenDraft) {
    setSeenDraft(draft);
    if (draft) {
      setText(draft);
      setVoiced(true);
    }
  }
  const thread = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, status]);
  const mood = lunaMood(status);
  const listening = status === 'listening';
  const send = (t: string, v: boolean) => {
    const m = t.trim();
    if (!m) return;
    lunaStore.getState().submit(m, v);
    setText('');
    setVoiced(false);
  };
  return (
    <section aria-label="Luna" className={className}>
      <div className="flex items-center gap-3">
        <LunaPet mood={mood} size={48} className="text-ink-3" />
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="display text-[22px] leading-none">Luna</span>
            <span aria-hidden="true" className="mono text-[14px] tracking-wide text-accent-ink">
              {KAOMOJI[mood]}
            </span>
          </p>
          <p className="mt-1 text-[14px] text-ink-2">{STATUS[status]}</p>
        </div>
      </div>
      <ol ref={thread} aria-label="Conversation with Luna" className="mt-3 flex max-h-[300px] min-h-[120px] flex-col gap-2 overflow-y-auto pr-1 text-[15px]">
        <Bubble from="luna">Hi, I’m Luna ^ ^ I can open a site, play the month, turn the view or compare two places. Type, or press the microphone.</Bubble>
        {messages.map((m, i) => (
          <Bubble key={m.id} from={m.from} live={m.from === 'luna' && i === messages.length - 1}>
            {m.text}
          </Bubble>
        ))}
        {status === 'thinking' && (
          <li className="flex items-end gap-2" aria-label="Luna is working on it">
            <LunaPet mood="thinking" size={26} className="mb-0.5 text-ink-3" />
            <span className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3.5 py-3">
              {[0, 1, 2].map((k) => (
                <i key={k} className="h-1.5 w-1.5 animate-[pulse-dot_1s_ease-in-out_infinite] rounded-full bg-ink-2" style={{ animationDelay: `${k * 0.15}s` }} />
              ))}
            </span>
          </li>
        )}
      </ol>
      {messages.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="sr-only">Try:</span>
          {SUGGESTIONS.map((t) => (
            <button key={t} type="button" onClick={() => send(t, false)} className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-[14px] text-ink-2 transition-colors hover:border-accent hover:text-ink">
              {t}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text, voiced);
        }}
      >
        <input
          type="text"
          aria-label="Type to Luna"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setVoiced(false);
          }}
          placeholder={listening ? 'Listening…' : 'Message Luna'}
          maxLength={300}
          className="field h-11 min-w-0 flex-1 rounded-full placeholder:text-ink-3"
        />
        {canDictate && (
          <button
            type="button"
            aria-pressed={listening}
            aria-label={listening ? 'Stop the microphone' : 'Speak to Luna'}
            onClick={() => lunaStore.getState().dictate()}
            className={`grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border transition-[border-color,box-shadow,color] ${listening ? 'animate-[pulse-dot_1.6s_ease-in-out_infinite] border-accent bg-accent text-[#050506]' : 'border-line-strong text-ink-2 hover:border-accent hover:text-ink'}`}
          >
            {listening ? <Square size={16} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          </button>
        )}
        <button type="submit" aria-label="Send" disabled={!text.trim()} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-on transition-opacity disabled:cursor-default disabled:opacity-40">
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </form>
      {listening && <p className="mt-2 text-[14px] text-ink-2">The words appear in the box as you speak; press Send when they read right.</p>}
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
