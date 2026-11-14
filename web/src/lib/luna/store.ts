import { createStore } from 'zustand';

/**
 * Luna's state (spec 22, with her conversation since spec 23.2), outside any page so it lasts from page to page:
 * whether she is on, what she is doing, what she last heard and said, the conversation so far, and whether she says
 * her replies aloud. Off at each visit: she listens only after a press of her button (or of her 3D self).
 *
 * - listening: on, with the browser's speech recognition running;
 * - ready: on, with voice input in this browser, the microphone paused from her panel (typed words still work);
 * - thinking: working out or carrying out what she heard or was given to read;
 * - speaking: saying her reply (she does not listen meanwhile, so she never hears herself);
 * - typing: on, without voice input in this browser (she takes typed words);
 * - blocked: the microphone is not allowed for the page (typed words still work);
 * - offline: the browser's recognition needs a network it cannot reach (typed words still work).
 */
export type LunaStatus = 'off' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'typing' | 'blocked' | 'offline';

/** One line of the conversation: yours or hers. */
export interface LunaMessage {
  id: number;
  from: 'you' | 'luna';
  text: string;
}

export interface LunaState {
  on: boolean;
  status: LunaStatus;
  /** What she last heard or was given to read, as said. */
  heard: string | null;
  /** What she last said. */
  reply: string | null;
  /** The conversation, oldest first. */
  messages: LunaMessage[];
  /** Whether this browser has voice input, so her panel offers the microphone. Set by her engine. */
  canListen: boolean;
  /**
   * Whether her microphone records a phrase at a press and sends it at the next (at most 15 s), where the browser has
   * no speech recognition of its own (spec 22.5); else it listens on, continuously. Set by her engine.
   */
  pressToTalk: boolean;
  /**
   * Whether she says her replies aloud (the switch in her panel, "Say replies aloud"): on at first, as spec 22 has her,
   * and kept in this browser for the next visit. Off, her replies show in the conversation only.
   */
  voice: boolean;
  setOn: (on: boolean) => void;
  /** Turns her voice on or off, and keeps the choice in this browser where it may. */
  setVoice: (voice: boolean) => void;
  /** Hands Luna typed words to act on, as if heard. Set by her engine while she is on. */
  submit: (text: string) => void;
  /** Pauses the microphone while she listens, or starts it again (also after it was blocked). Set by her engine. */
  toggleMic: () => void;
  /**
   * Readies her voice during the press that turns her on, for browsers that play sound only during a press (Safari),
   * so Gemini's audio for her replies can play later. Set by her engine.
   */
  prime: () => void;
}

/** Where this browser keeps whether she says her replies aloud: "off" once turned off, "on" once turned on again. */
export const LUNA_VOICE_KEY = 'earthrise.luna.voice';

/**
 * Whether she says her replies aloud, as this browser last left it: on unless it was turned off. On where there is
 * no storage (the server, a private window, site data blocked), as on a first visit.
 */
export function storedVoice(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(LUNA_VOICE_KEY) !== 'off';
  } catch {
    return true;
  }
}

let next = 1;
/** A line of the conversation with a fresh id. */
export const message = (from: LunaMessage['from'], text: string): LunaMessage => ({ id: next++, from, text });

// Read once, as the page starts: her panel, the only place that shows it, opens only after a press, so the server's
// first paint never differs from the browser's.
export const lunaStore = createStore<LunaState>()((set) => ({
  on: false,
  status: 'off',
  heard: null,
  reply: null,
  messages: [],
  canListen: false,
  pressToTalk: false,
  voice: storedVoice(),
  setOn: (on) => set(on ? { on } : { on, status: 'off' }),
  setVoice: (voice) => {
    set({ voice });
    try {
      window.localStorage.setItem(LUNA_VOICE_KEY, voice ? 'on' : 'off');
    } catch {
      // Storage is blocked: the choice lasts for this visit, from page to page.
    }
  },
  submit: () => {},
  toggleMic: () => {},
  prime: () => {},
}));
