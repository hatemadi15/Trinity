'use client';
import { Mic, SendHorizontal, Square, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { RECORDING_MAX_MS } from '@/lib/luna/limits';
import { lunaStore, type LunaStatus } from '@/lib/luna/store';
import { KAOMOJI, LunaPet, lunaMood } from './LunaPet';

/** What Luna is doing, in her panel. */
const STATUS: Record<LunaStatus, string> = {
  off: '',
  ready: 'The microphone is paused: type below, or press the microphone to speak.',
  listening: 'Listening. Say what you would like to see.',
  thinking: 'Working on it…',
  speaking: 'Speaking…',
  typing: 'This browser has no voice input: type to Luna below.',
  blocked: 'The microphone is not allowed for this page: allow it in the address bar, or type below.',
  offline: 'Voice input needs the internet here: type to Luna below.',
};

/** What she is doing where her microphone records a phrase at a press (spec 22.5), where it differs. */
const PRESS_STATUS: Partial<Record<LunaStatus, string>> = {
  ready: 'Press the microphone and speak; press it again when you have finished.',
  listening: 'Listening. Press the square when you have finished.',
};

/**
 * Where Luna's panel opens: under the header's button, or beside her 3D self at the page's corner (LunaDock), as
 * whichever was pressed last; or by her suggestions, where a phone keeps her button folded away (LunaHint, "hint").
 * One panel at a time.
 */
export const lunaPlace = createStore<{ at: 'header' | 'dock' | 'hint' }>()(() => ({ at: 'header' }));

/** Ready-made messages, one press each: what to say, as well as what to send. */
export const SUGGESTIONS = ['open the view from the site', 'play', 'turn to Earth', 'compare this to every landing site', 'plan a landing'];

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
 * Whether she says her replies aloud (spec 22): a switch, on at first and kept in this browser. Off, her replies show
 * in the conversation only, and turned off while she speaks, she stops at once (her engine sees to both). The whole
 * row is the switch, 44 px high. Enter and Space flip it once each; the browser's own press for either key is held
 * back, so it never flips twice.
 */
function VoiceSwitch() {
  const voice = useStore(lunaStore, (s) => s.voice);
  const flip = () => lunaStore.getState().setVoice(!lunaStore.getState().voice);
  return (
    <div className="mt-3 border-t border-line pt-2">
      <button
        type="button"
        role="switch"
        aria-checked={voice}
        onClick={flip}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          if (!e.repeat) flip();
        }}
        onKeyUp={(e) => {
          if (e.key === ' ') e.preventDefault();
        }}
        className="group flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-1 text-left text-[14px] text-ink-2 transition-colors hover:text-ink"
      >
        {voice ? <Volume2 size={18} aria-hidden="true" className="shrink-0" /> : <VolumeX size={18} aria-hidden="true" className="shrink-0" />}
        <span className="flex-1">Say replies aloud</span>
        <span
          aria-hidden="true"
          className={`flex h-6 w-10 shrink-0 items-center rounded-full border p-[3px] transition-[background-color,border-color,box-shadow] duration-200 ${voice ? 'border-accent bg-accent shadow-[0_0_14px_-4px_rgb(var(--glow)/var(--glow-strength))]' : 'border-line-strong group-hover:border-accent'}`}
        >
          <span className={`h-4 w-4 rounded-full transition-transform duration-200 ${voice ? 'translate-x-4 bg-surface' : 'bg-ink-3'}`} />
        </span>
      </button>
    </div>
  );
}

/**
 * Luna's panel, wherever it opens (spec 23.2): a chat. Her face and what she is doing at the top; the conversation as
 * speech bubbles, what she heard on the right and her replies on the left, read out to a screen reader as they come,
 * with three dots while she works; ready-made messages to start with; and a box to type to her (her only way in where
 * the browser cannot listen, and always there), with the microphone, which she keeps listening on while she is on
 * (spec 22) and which pauses and starts again at a press; and under it the switch for saying her replies aloud.
 * `className` places it.
 */
export function LunaPanel({ className }: { className: string }) {
  const status = useStore(lunaStore, (s) => s.status);
  const messages = useStore(lunaStore, (s) => s.messages);
  const canListen = useStore(lunaStore, (s) => s.canListen);
  const pressToTalk = useStore(lunaStore, (s) => s.pressToTalk);
  const [text, setText] = useState('');
  const thread = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, status]);
  const mood = lunaMood(status);
  const listening = status === 'listening';
  const send = (t: string) => {
    const m = t.trim();
    if (!m) return;
    lunaStore.getState().submit(m);
    setText('');
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
          <p className="mt-1 text-[14px] text-ink-2">{(pressToTalk && PRESS_STATUS[status]) || STATUS[status]}</p>
        </div>
      </div>
      <ol ref={thread} aria-label="Conversation with Luna" className="mt-3 flex max-h-[300px] min-h-[120px] flex-col gap-2 overflow-y-auto pr-1 text-[15px]">
        <Bubble from="luna">Hi, I’m Luna ^ ^ I can open a page or a site, play the month, turn the view, compare two places or plan a landing. Say it, or type it.</Bubble>
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
            <button key={t} type="button" onClick={() => send(t)} className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-[14px] text-ink-2 transition-colors hover:border-accent hover:text-ink">
              {t}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          type="text"
          aria-label="Type to Luna"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? 'Listening… or type here' : 'Message Luna'}
          maxLength={300}
          className="field h-11 min-w-0 flex-1 rounded-full placeholder:text-ink-3"
        />
        {canListen && (
          <button
            type="button"
            aria-pressed={listening}
            aria-label={listening ? (pressToTalk ? 'Stop and send' : 'Pause the microphone') : 'Speak to Luna'}
            onClick={() => lunaStore.getState().toggleMic()}
            className={`grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border transition-[border-color,box-shadow,color] ${listening ? 'animate-[pulse-dot_1.6s_ease-in-out_infinite] border-accent bg-accent text-[#050506]' : 'border-line-strong text-ink-2 hover:border-accent hover:text-ink'}`}
          >
            {listening ? <Square size={16} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          </button>
        )}
        <button type="submit" aria-label="Send" disabled={!text.trim()} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-on transition-opacity disabled:cursor-default disabled:opacity-40">
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </form>
      {listening && (
        <p className="mt-2 text-[14px] text-ink-2">
          {pressToTalk ? `Say it in plain English; she listens for up to ${RECORDING_MAX_MS / 1000} seconds, or until you press the square.` : 'Say it in plain English; she acts when you pause.'}
        </p>
      )}
      <VoiceSwitch />
    </section>
  );
}

/**
 * Luna's button and panel (spec 22): a toggle named Luna, off at first; pressed, she listens, and pressed again, she
 * stops. On, her panel shows what she is doing and the conversation, what she heard and what she said (read out to a
 * screen reader as it comes), a box to type to her (her only way in where the browser cannot listen, and always
 * there), and examples of what to say. `className` styles the toggle as its place
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
          // During the press, so a browser that wants one first lets her voice play later.
          if (!on) lunaStore.getState().prime();
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
