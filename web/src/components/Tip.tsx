'use client';
import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

/**
 * A word of explanation one point away (spec 23): an "i" that opens a small card while the pointer is on it, while it
 * has the keyboard's focus, or after a tap; Escape closes it. The card says what a figure means, so the page itself
 * can stay short. `label` names the button for a screen reader ("What Sunlight means").
 */
export function Tip({ label, children, side = 'left' }: { label: string; children: ReactNode; side?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className="-m-2.5 grid h-11 w-11 cursor-help place-items-center rounded-full text-ink-2 transition-colors hover:text-accent-ink focus-visible:text-accent-ink"
      >
        <Info size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-full z-30 mt-2 block w-[min(320px,80vw)] rounded-xl border border-line-strong bg-surface p-3.5 text-left text-[15px] font-normal normal-case leading-relaxed tracking-normal text-ink-2 shadow-[0_0_0_1px_rgb(var(--glow)/0.15),0_20px_50px_-18px_rgb(var(--glow)/var(--glow-strength))] ${side === 'left' ? 'left-0' : 'right-0'}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
