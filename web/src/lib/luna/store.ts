import { createStore } from 'zustand';

/**
 * Luna's state (spec 22), outside any page so it lasts from page to page: whether she is on, what she is doing, what
 * she last heard and said. Off at each visit: she listens only after a press of her button.
 *
 * - listening: on, with the browser's speech recognition running;
 * - thinking: working out or carrying out what she heard;
 * - speaking: saying her reply (she does not listen meanwhile, so she never hears herself);
 * - typing: on, without voice input in this browser (she takes typed words);
 * - blocked: the microphone is not allowed for the page (typed words still work);
 * - offline: the browser's recognition needs a network it cannot reach (typed words still work).
 */
export type LunaStatus = 'off' | 'listening' | 'thinking' | 'speaking' | 'typing' | 'blocked' | 'offline';

export interface LunaState {
  on: boolean;
  status: LunaStatus;
  /** What she last heard or was given to read, as said. */
  heard: string | null;
  /** What she last said. */
  reply: string | null;
  setOn: (on: boolean) => void;
  /** Hands Luna words to act on, as if heard: set by her engine while she is on. */
  submit: (text: string) => void;
}

export const lunaStore = createStore<LunaState>()((set) => ({
  on: false,
  status: 'off',
  heard: null,
  reply: null,
  setOn: (on) => set(on ? { on } : { on, status: 'off' }),
  submit: () => {},
}));
