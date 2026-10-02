'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog. Focus moves in when it opens and Tab stays inside; Escape, the Close button and a
 * press on the backdrop call `onClose`; when it unmounts the opener gets the focus back.
 */
export function Modal({ title, onClose, returnFocus, wide = false, children }: { title: string; onClose: () => void; returnFocus?: RefObject<HTMLElement | null>; wide?: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = returnFocus?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, [returnFocus]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel w-full border-line-strong ${wide ? 'max-w-[900px]' : 'max-w-[640px]'}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
          }
          if (e.key !== 'Tab') return;
          const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
          if (items.length === 0) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="display text-[23px] font-semibold leading-tight">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-sm shrink-0">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
