import { createStore } from 'zustand';

/**
 * Luna's state (spec 22, a chat since spec 23.2), outside any page so it lasts from page to page: whether she is on,
 * what she is doing, the conversation so far, and the words being dictated. Off at each visit: she opens only on a
 * press of her button, and listens only on a press of the microphone.
 *
 * - ready: on, with voice input in this browser, not listening;
 * - listening: the microphone is on, and what it hears is written into the message box as it comes (`draft`);
 * - thinking: working out or carrying out a message;
 * - speaking: saying her reply aloud (after a message that was dictated);
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
  /** The words the microphone has heard so far, for the message box; nothing is sent until the visitor sends it. */
  draft: string;
  /** Whether this browser can take dictation. */
  canDictate: boolean;
  setOn: (on: boolean) => void;
  /** Hands Luna a message, as if heard; `voiced` when it was dictated, so her reply is said aloud too. Set by her engine. */
  submit: (text: string, voiced?: boolean) => void;
  /** Starts the microphone, or stops it while it listens. Set by her engine. */
  dictate: () => void;
}

let next = 1;
/** A message with a fresh id, for the conversation. */
export const message = (from: LunaMessage['from'], text: string): LunaMessage => ({ id: next++, from, text });

export const lunaStore = createStore<LunaState>()((set) => ({
  on: false,
  status: 'off',
  heard: null,
  reply: null,
  messages: [],
  draft: '',
  canDictate: false,
  setOn: (on) => set(on ? { on } : { on, status: 'off', draft: '' }),
  submit: () => {},
  dictate: () => {},
}));
