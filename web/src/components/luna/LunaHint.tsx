'use client';
import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { closeHints, exploreHints, firstAnnouncement, HINT_DELAY_MS, hintSeen, hintsClosed, hintsFor, markHintSeen, sendToLuna } from '@/lib/luna/hints';
import { lunaStore } from '@/lib/luna/store';
import { exploreStore } from '@/lib/store/explore';
import { LunaPanel, lunaPlace } from './LunaButton';

const CHIP =
  'cursor-pointer rounded-full border border-line-strong bg-surface px-3 py-1.5 text-left text-[14px] leading-snug text-ink transition-[border-color,box-shadow] duration-200 hover:border-accent hover:shadow-[0_0_18px_-6px_rgb(var(--glow)/var(--glow-strength))] max-sm:min-h-10';

/** Whether an element is on screen at all: a copy for another width, hidden by its styles, says nothing. */
function displayed(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) if (window.getComputedStyle(e).display === 'none') return false;
  return true;
}

/** Opens her panel where it was asked from, and hands her the request as if typed. */
function ask(text: string, at: 'dock' | 'header' | 'hint') {
  lunaPlace.setState({ at });
  sendToLuna(text);
}

/**
 * Luna's suggestions beside her (spec 22.6): a small pane, glass in look (no blur: the live scenes behind her would pay for it every frame), that shows two seconds after a page opens, once per
 * page in a visit, with "Ask me" and two or three requests that fit the page, each a button that opens her panel and
 * sends the request as if typed. On a phone it is one request, above her, clear of a bar at the window's foot. The
 * cross closes it for good in this browser. It takes no focus; a screen reader hears of it once in a visit, politely.
 * Under reduced motion it shows without moving. `at` says where her panel opens: beside her, or under her button
 * (the view from the site); `className` places the pane. Where a phone keeps her button folded away (the view from the
 * site), `phonePanel` places her panel, which then opens here, with a cross that turns her off.
 */
export function LunaHint({ at = 'dock', className, path: given, phonePanel }: { at?: 'dock' | 'header'; className: string; path?: string; phonePanel?: string }) {
  const here = usePathname();
  const path = given ?? here ?? (typeof window === 'undefined' ? '' : window.location.pathname);
  const reduced = useReducedMotion();
  const on = useStore(lunaStore, (s) => s.on);
  const place = useStore(lunaPlace, (s) => s.at);
  const days = useStore(exploreStore, (s) => s.days);
  const [shown, setShown] = useState<{ path: string; say: boolean } | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const chips = hintsFor(path, days);
  const any = chips.length > 0;

  useEffect(() => {
    if (!any || hintsClosed() || hintSeen(path)) return;
    let t = 0;
    const show = () => {
      if (hintsClosed() || lunaStore.getState().on) return;
      // On a phone, Explore's step-by-step tour keeps its "Next" where she stands: her suggestions wait for its end.
      if (window.innerWidth < 640 && new URLSearchParams(window.location.search).get('tour') === '1') {
        t = window.setTimeout(show, HINT_DELAY_MS);
        return;
      }
      markHintSeen(path);
      setShown({ path, say: displayed(status.current) && firstAnnouncement() });
    };
    t = window.setTimeout(show, HINT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [path, any]);

  const open = shown !== null && shown.path === path && !on && any;
  return (
    <>
      {/* Said once in a visit, politely: the pane itself is never read out as it comes. */}
      <p ref={status} role="status" aria-live="polite" className="sr-only">
        {open && shown.say ? `Luna suggests: ${chips[0]} Her suggestions are beside her, at the foot of the page.` : ''}
      </p>
      {open && (
        <section
          aria-label="Suggestions from Luna"
          data-luna-hint=""
          data-motion={reduced ? 'none' : 'in'}
          className={`${className} rounded-2xl border border-line-strong bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-3 text-ink shadow-[0_0_0_1px_rgb(var(--glow)/0.15),0_18px_44px_-18px_rgb(var(--glow)/var(--glow-strength))] max-sm:p-1.5 ${reduced ? '' : 'animate-[bubble-in_0.45s_cubic-bezier(0.16,1,0.3,1)_both]'}`}
        >
          <div className="flex items-center justify-between gap-2 max-sm:hidden">
            <p className="text-[14px] font-semibold text-accent-ink">Ask me</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pr-7 sm:mt-2 sm:pr-0">
            {chips.map((t, i) => (
              <button
                key={t}
                type="button"
                aria-label={`Ask Luna: ${t}`}
                onClick={() => {
                  setShown(null);
                  ask(t, phonePanel && window.innerWidth < 768 ? 'hint' : at);
                }}
                className={`${CHIP} ${i > 0 ? 'max-sm:hidden' : ''}`}
              >
                <span className="sm:hidden">Ask Luna: </span>
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Close Luna’s suggestions"
            onClick={() => {
              closeHints();
              setShown(null);
            }}
            className="absolute right-1 top-1 grid h-8 w-8 cursor-pointer place-items-center rounded-full text-ink-2 transition-colors hover:text-ink max-sm:top-1/2 max-sm:-translate-y-1/2"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </section>
      )}
      {phonePanel && on && place === 'hint' && (
        <div className={phonePanel}>
          <LunaPanel className="" />
          <button type="button" aria-label="Turn Luna off" onClick={() => lunaStore.getState().setOn(false)} className="absolute right-2 top-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ink-2 hover:text-ink">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The same requests under Explore's answer, where the question arises: "Ask Luna:" and a button each for the best
 * landing date, the best site and why the power stops. Each opens her panel beside her and sends the request.
 */
export function LunaAsk({ days }: { days: number }) {
  return (
    <div role="group" aria-label="Ask Luna" data-part="ask-luna" className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line pt-3">
      <span className="text-[14px] font-semibold text-accent-ink">Ask Luna:</span>
      {exploreHints(days).map((t) => (
        <button key={t} type="button" aria-label={`Ask Luna: ${t}`} onClick={() => ask(t, 'dock')} className={CHIP}>
          {t}
        </button>
      ))}
    </div>
  );
}
