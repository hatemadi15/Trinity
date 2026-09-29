import type { Action } from './actions';
import transcripts from './transcripts.json';

export interface Transcript {
  id: string;
  prompt: string;
  actions: Action[];
  reply: string;
}

/** The rehearsed exchanges, as shipped in transcripts.json. */
export const TRANSCRIPTS: Transcript[] = (transcripts as { entries: Transcript[] }).entries;

/** Lower-case ASCII words separated by single spaces: accents, punctuation and extra spaces removed. */
export function normalizePrompt(p: string): string {
  return p
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** How many words a prompt may add to a rehearsed one ("please", "now") and still count as the same question. */
const EXTRA_WORDS_ALLOWED = 2;

/**
 * The rehearsed answer for a prompt: an exact match after normalisation, or a prompt that contains
 * every word of a transcript's prompt with at most two extra words. Numbers count as words, so
 * "Show me Nobile Rim 1" does not get the Rim 2 answer.
 */
export function cachedAnswer(prompt: string): Transcript | null {
  const norm = normalizePrompt(prompt);
  if (!norm) return null;
  const exact = TRANSCRIPTS.find((t) => normalizePrompt(t.prompt) === norm);
  if (exact) return exact;
  const words = new Set(norm.split(' '));
  let best: { t: Transcript; extra: number } | null = null;
  for (const t of TRANSCRIPTS) {
    const own = new Set(normalizePrompt(t.prompt).split(' '));
    if (![...own].every((w) => words.has(w))) continue;
    const extra = words.size - own.size;
    if (extra <= EXTRA_WORDS_ALLOWED && (!best || extra < best.extra)) best = { t, extra };
  }
  return best?.t ?? null;
}
