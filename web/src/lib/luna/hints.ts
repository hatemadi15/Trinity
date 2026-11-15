import { lunaStore } from './store';

/**
 * What Luna offers beside her, page by page: requests a visitor can make in one press, so nobody has to guess that she
 * finds the best landing date or the best site. Each is sent to her as if typed, in words her commands and the
 * planner's phrasings act on without a model (a test keeps them so).
 */

/** How long after a page opens her suggestions show, in ms. */
export const HINT_DELAY_MS = 2000;
/** Where this browser keeps that her suggestions were closed: "off" once closed. A convenience, per visitor. */
export const LUNA_HINTS_KEY = 'earthrise.luna.hints';
/** Where this visit keeps the pages her suggestions have shown on, so each shows them once. */
export const LUNA_HINTS_SEEN_KEY = 'earthrise.luna.hints.seen';

const BEST_SITE = 'Which site is best for these dates?';
const EVERY_SITE = 'Compare this to every landing site';
const PLAN = 'Plan a landing';
const bestDate = (days: number) => `Find the best landing date for ${Math.min(90, Math.max(2, Math.round(days) || 14))} days`;

/** Explore's suggestions, also the strip under its answer: the best date, the best site, and why the power stops. */
export function exploreHints(days: number): string[] {
  return [bestDate(days), EVERY_SITE, 'Explain the longest night'];
}

/** The suggestions for a page (its path); none where she has nothing to add (the printable brief). `days` is the period's length. */
export function hintsFor(path: string, days = 14): string[] {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return [BEST_SITE, PLAN, 'Fly to the south pole'];
  if (p === '/sites') return [BEST_SITE, PLAN];
  if (p === '/explore') return exploreHints(days);
  if (p === '/compare') return [EVERY_SITE, `Best ${bestDate(days).match(/\d+/)![0]}-day landing date across the compared sites`];
  if (p.startsWith('/explore/stand')) return ['When does Earth set?', 'How long until sunset?', 'When is the next radio window?'];
  if (p.startsWith('/brief')) return [];
  return [BEST_SITE, PLAN];
}

// The pages shown on in this visit, kept here too where the browser has no storage.
const seen = new Set<string>();
let announced = false;

function read(storage: 'localStorage' | 'sessionStorage', key: string): string | null {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
}
function write(storage: 'localStorage' | 'sessionStorage', key: string, value: string) {
  try {
    window[storage].setItem(key, value);
  } catch {
    // Storage is blocked: it lasts for this page only.
  }
}

let closed = false;
/** Whether the visitor closed her suggestions, in this visit or an earlier one in this browser. */
export const hintsClosed = () => closed || read('localStorage', LUNA_HINTS_KEY) === 'off';
/** Closes her suggestions for good, as far as this browser remembers. */
export function closeHints() {
  closed = true;
  write('localStorage', LUNA_HINTS_KEY, 'off');
}

function seenPages(): Set<string> {
  try {
    const kept = JSON.parse(read('sessionStorage', LUNA_HINTS_SEEN_KEY) ?? '[]') as unknown;
    if (Array.isArray(kept)) for (const p of kept) if (typeof p === 'string') seen.add(p);
  } catch {
    // Not a list: as on a first visit.
  }
  return seen;
}
/** Whether her suggestions have shown on this page in this visit. */
export const hintSeen = (path: string) => seenPages().has(path);
/** Notes that they have. */
export function markHintSeen(path: string) {
  seenPages().add(path);
  write('sessionStorage', LUNA_HINTS_SEEN_KEY, JSON.stringify([...seen]));
}
/** Whether a screen reader is still to hear of her suggestions: true once in a visit, then false. */
export function firstAnnouncement(): boolean {
  if (announced) return false;
  announced = true;
  return true;
}
/** Forgets the visit, as a new one would (tests). */
export function resetHints() {
  seen.clear();
  announced = false;
  closed = false;
}

/**
 * Hands Luna a request as if it were typed in her panel. Off, she is turned on first (her voice readied during the
 * press, as her own button does), and the words go to her as soon as her engine takes typed words.
 */
export function sendToLuna(text: string) {
  const s = lunaStore.getState();
  if (s.on) {
    s.submit(text);
    return;
  }
  const waiting = s.submit;
  let stop = () => {};
  stop = lunaStore.subscribe((now) => {
    if (!now.on) return stop();
    if (now.submit === waiting) return;
    stop();
    // After her engine has finished turning on.
    queueMicrotask(() => lunaStore.getState().submit(text));
  });
  s.prime();
  s.setOn(true);
}
