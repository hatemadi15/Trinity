import { createStore } from 'zustand';
import type { ChatSource } from '../ai/protocol';

/** One question and its answer, as shown in the planner strip. */
export interface Exchange {
  id: number;
  prompt: string;
  reply: string;
  source: ChatSource | 'error';
  model?: string;
  notes: string[];
}

/** Exchanges kept on screen, newest first. */
export const PLANNER_LOG_KEEP = 5;

interface PlannerLog {
  exchanges: Exchange[];
  nextId: number;
  push: (x: Omit<Exchange, 'id'>) => void;
  clear: () => void;
}

/**
 * The planner transcript lives outside the strip component so it survives a page change: when an
 * answer opens Compare, the reply and its source line are still there on the Compare strip.
 */
export const plannerLog = createStore<PlannerLog>((set, get) => ({
  exchanges: [],
  nextId: 1,
  push(x) {
    const id = get().nextId;
    set({ nextId: id + 1, exchanges: [{ ...x, id }, ...get().exchanges].slice(0, PLANNER_LOG_KEEP) });
  },
  clear() {
    set({ exchanges: [], nextId: 1 });
  },
}));
