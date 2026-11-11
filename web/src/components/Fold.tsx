'use client';
import { useId, useState, type ReactNode } from 'react';

/**
 * Words a first screen folds away, one tap from where they were (spec 20.1: fold, not delete). A plain underlined
 * button whose words say what it opens, with a chevron for the state; the content stays in the page, in its
 * reading order, `hidden` until opened, so nothing leaves the app and a search of the page still finds it.
 */
export function Fold({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-fold`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 items-center gap-1.5 text-left font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
      >
        {label}
        <span aria-hidden="true" className="no-underline">
          {open ? '▴' : '▾'}
        </span>
      </button>
      <div id={`${id}-fold`} hidden={!open} className="mt-2">
        {children}
      </div>
    </div>
  );
}
