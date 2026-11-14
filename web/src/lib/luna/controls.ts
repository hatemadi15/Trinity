import { useEffect, useRef } from 'react';
import type { Control } from './commands';

/**
 * The controls the pages lend Luna (spec 22): the time bar its player, the view from the site its turns, the home page
 * its flight. A page lends them while it is mounted; the one mounted last answers. A control asked for before its page
 * was there (Luna opened the page to do it) waits PENDING_MS and runs once, as soon as the page lends it.
 */

/** A control's handler; it may say what it did ("Sunset, 3 Jan"), which Luna then says. */
export type Handler = () => string | void;

const lent = new Map<Control, Handler[]>();
let pending: { control: Control; until: number } | null = null;

/** How long a control asked for before its page was there waits for it, in ms. */
export const PENDING_MS = 15_000;

/** Lends a page's controls; returns the function that takes them back. */
export function registerControls(map: Partial<Record<Control, Handler>>): () => void {
  const entries = Object.entries(map) as [Control, Handler][];
  for (const [control, handler] of entries) lent.set(control, [...(lent.get(control) ?? []), handler]);
  const wanted = pending;
  if (wanted && wanted.until >= Date.now() && entries.some(([c]) => c === wanted.control)) {
    pending = null;
    // After the page's first paint, so what it runs finds the page as it will be.
    setTimeout(() => runControl(wanted.control), 0);
  }
  return () => {
    for (const [control, handler] of entries) {
      const list = (lent.get(control) ?? []).filter((h) => h !== handler);
      if (list.length) lent.set(control, list);
      else lent.delete(control);
    }
  };
}

/** Runs a lent control: whether one was there, and what it said it did. */
export function runControl(control: Control): { ok: boolean; said?: string } {
  const handler = lent.get(control)?.at(-1);
  if (!handler) return { ok: false };
  const said = handler();
  return typeof said === 'string' && said ? { ok: true, said } : { ok: true };
}

/** Whether a page has lent the control now. */
export function hasControl(control: Control): boolean {
  return (lent.get(control)?.length ?? 0) > 0;
}

/** Keeps a control for the page about to open, for PENDING_MS. */
export function queueControl(control: Control, now = Date.now()): void {
  pending = { control, until: now + PENDING_MS };
}

/** Lends a component's controls while it is mounted; each call reaches the component's latest handler. */
export function useLunaControls(map: Partial<Record<Control, Handler>>, enabled = true): void {
  const latest = useRef(map);
  useEffect(() => {
    latest.current = map;
  });
  const keys = Object.keys(map).sort().join(' ');
  useEffect(() => {
    if (!enabled || !keys) return;
    const wrapped: Partial<Record<Control, Handler>> = {};
    for (const k of keys.split(' ') as Control[]) wrapped[k] = () => latest.current[k]?.();
    return registerControls(wrapped);
  }, [keys, enabled]);
}
