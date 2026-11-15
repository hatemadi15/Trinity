'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { siteLabel, type Site } from '@/lib/data/loaders';

/** The catalogue in the Sites page's groups and order, each under a short name. */
export const SITE_GROUPS: { title: string; categories: string[] }[] = [
  { title: 'Artemis crewed landing regions', categories: ['artemis3'] },
  { title: 'Commercial landers, landed', categories: ['clps_landed'] },
  { title: 'Commercial landers, planned', categories: ['clps_planned'] },
  { title: 'Landers of other countries', categories: ['international'] },
  { title: 'Apollo landings', categories: ['apollo'] },
  { title: 'High points and crater floors', categories: ['classic', 'reference'] },
];

const TAG = 'shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[15px] text-ink-2';
const OPTION = 'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-base text-ink hover:bg-surface-2';

/**
 * The landing site as a drop-down on the page: the catalogue in the Sites page's groups, then "Your own site…". A site
 * chosen loads in place, with the dates and the lander kept. Escape and a press outside close it; the arrow keys move
 * through the list.
 */
export function SitePicker({ site, sites, onSite, onOwn }: { site: Site; sites: Site[]; onSite: (id: string) => void; onOwn: () => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const label = siteLabel(site);

  // On opening, the cursor goes to the site shown, or to the first of the list.
  useEffect(() => {
    if (!open) return;
    const el = list.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? list.current?.querySelector<HTMLElement>('[data-option]');
    el?.focus({ preventScroll: false });
  }, [open]);
  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
      return;
    }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const options = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-option]') ?? []);
    if (options.length === 0) return;
    e.preventDefault();
    const at = options.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : e.key === 'ArrowDown' ? Math.min(options.length - 1, at + 1) : Math.max(0, at - 1);
    options[to].focus();
  };
  const groups = SITE_GROUPS.map((g) => ({ ...g, rows: sites.filter((s) => g.categories.includes(s.category)) })).filter((g) => g.rows.length > 0);

  return (
    <div ref={root} onKeyDown={onKey} className="relative flex min-w-0 flex-[1_1_250px] flex-col gap-1.5 text-[15px] text-ink-2">
      <span aria-hidden="true">Landing site</span>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-sites`}
        aria-label={`Landing site: ${label}. Change site`}
        onClick={() => setOpen((o) => !o)}
        className="field flex min-w-0 items-center gap-3 text-left text-base text-ink"
      >
        <span className="grow truncate font-medium">{label}</span>
        <span className={TAG}>
          change <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </span>
      </button>
      <div
        id={`${id}-sites`}
        ref={list}
        hidden={!open}
        role="group"
        aria-label="Choose a landing site"
        className="absolute left-0 top-full z-40 mt-2 max-h-[min(70vh,600px)] w-[min(760px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-line-strong bg-surface p-3 shadow-[0_0_0_1px_rgb(var(--glow)/0.3),0_0_32px_-14px_rgb(var(--glow)/var(--glow-strength))] sm:w-[min(760px,calc(100vw-64px))]"
      >
        <p className="px-3 pb-2 text-[15px] text-ink-2">The dates and the lander stay as they are.</p>
        <div className="gap-x-4 sm:columns-2">
          {groups.map((g) => (
            <div key={g.title} role="group" aria-label={g.title} className="mb-3 break-inside-avoid">
              <p aria-hidden="true" className="px-3 pb-1 text-[15px] font-semibold text-ink-2">
                {g.title}
              </p>
              <ul>
                {g.rows.map((s) => {
                  const current = s.id === site.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        data-option=""
                        aria-current={current ? 'true' : undefined}
                        onClick={() => {
                          close();
                          if (!current) onSite(s.id);
                        }}
                        className={`${OPTION} ${current ? 'bg-surface-2 font-semibold' : ''}`}
                      >
                        <span className="min-w-0 grow">{siteLabel(s)}</span>
                        {current && (
                          <span aria-hidden="true" className="text-[15px] font-normal text-ink-2">
                            shown
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line pt-2">
          <button
            type="button"
            data-option=""
            onClick={() => {
              close();
              onOwn();
            }}
            className={`${OPTION} font-semibold`}
          >
            Your own site…
          </button>
        </div>
      </div>
    </div>
  );
}
