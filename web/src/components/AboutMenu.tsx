'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ABOUT } from '@/lib/nav';

/**
 * A small "About" button at the header's right, beside Luna and the theme: it opens a menu of the two pages about the
 * app itself, How it works and Accuracy, which stay out of the header's row. Escape, a press outside it or a choice
 * closes it; the footer of every page has the same two links.
 */
export function AboutMenu() {
  const path = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div
      ref={box}
      className="relative"
      onBlur={(e) => {
        // Tabbing out of the menu closes it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label="About Earthrise"
        aria-expanded={open}
        aria-controls="about-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line-strong text-ink-2 transition-colors hover:border-ink hover:text-ink"
      >
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M12 11v6" />
          <circle cx="12" cy="7.2" r="0.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <ul id="about-menu" aria-label="About Earthrise" className="absolute right-0 top-full z-50 mt-2 min-w-[11rem] rounded-xl border border-line-strong bg-surface p-1.5 text-[15px] font-medium shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
          {ABOUT.map((item) => {
            const here = path === item.href || path.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={here ? 'page' : undefined} onClick={() => setOpen(false)} className={`block whitespace-nowrap rounded-lg px-3 py-2 hover:bg-page ${here ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
