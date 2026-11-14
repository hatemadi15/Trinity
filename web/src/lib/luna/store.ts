import { createStore } from 'zustand';

/**
 * Luna's state (spec 22, with her conversation since spec 23.2), outside any page so it lasts from page to page:
 * whether she is on, what she is doing, what she last heard and said, and the conversation so far. Off at each visit:
 * she listens only after a press of her button (or of her 3D self).
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
  setOn: (on: boolean) => void;
  /** Hands Luna typed words to act on, as if heard. Set by her engine while she is on. */
  submit: (text: string) => void;
  /** Pauses the microphone while she listens, or starts it again (also after it was blocked). Set by her engine. */
  toggleMic: () => void;
}

let next = 1;
/** A line of the conversation with a fresh id. */
export const message = (from: LunaMessage['from'], text: string): LunaMessage => ({ id: next++, from, text });

export const lunaStore = createStore<LunaState>()((set) => ({
  on: false,
  status: 'off',
  heard: null,
  reply: null,
  messages: [],
  canListen: false,
  setOn: (on) => set(on ? { on } : { on, status: 'off' }),
  submit: () => {},
  toggleMic: () => {},
}));
