import type { PowerResult } from '@/lib/engine/power';
import { verdictFor } from '@/lib/viz/verdict';

/** Survive-the-night verdict: status colour plus a glyph and words, never colour alone. */
export function VerdictChip({ power }: { power: PowerResult }) {
  const v = verdictFor(power);
  const tone = v.tone === 'good' ? 'border-good text-good' : 'border-bad text-bad';
  return (
    <p className={`inline-flex w-fit flex-col rounded-md border px-3 py-1 text-sm ${tone}`} data-tone={v.tone}>
      <span className="font-medium">
        <span aria-hidden="true">{v.tone === 'good' ? '● ' : '▲ '}</span>
        {v.label}
      </span>
      <span className="text-xs text-ink-2">{v.detail}</span>
    </p>
  );
}
