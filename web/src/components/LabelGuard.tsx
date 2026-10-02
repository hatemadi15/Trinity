'use client';
import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { labelsToHide } from '@/lib/viz/labelguard';

/**
 * A box whose `[data-label]` descendants never overlap. The chart inside places its labels by estimates;
 * once the browser has laid them out (and again when the box changes size or the fonts arrive), the less
 * important of any two overlapping labels (`data-priority`, lower is more important) is hidden.
 */
export function LabelGuard(props: HTMLAttributes<HTMLDivElement>) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const run = () => {
      const labels = [...root.querySelectorAll<HTMLElement>('[data-label]')];
      for (const l of labels) l.style.visibility = '';
      const hide = labelsToHide(
        labels.map((l) => {
          const r = l.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, priority: Number(l.dataset.priority ?? 5) };
        }),
      );
      labels.forEach((l, i) => {
        if (hide[i]) l.style.visibility = 'hidden';
      });
    };
    run();
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) run();
    });
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run);
    watch?.observe(root);
    return () => {
      live = false;
      watch?.disconnect();
    };
  });
  return <div ref={box} {...props} />;
}
