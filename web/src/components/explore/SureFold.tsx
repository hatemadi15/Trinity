'use client';
import Link from 'next/link';
import { ENERGY_ONLY } from '@/components/PowerScope';
import type { SureLines } from '@/lib/uncertainty/budget';
import { withinWords } from '@/lib/uncertainty/budget';
import { Fold } from '../Fold';

/**
 * How sure the verdict's times are, one tap away: the closed button gives the widest margin ("Times ±1.5 h"), the open fold each
 * event with its own, where the margins come from, and what the power figures leave out.
 */
export function SureFold({ sure, className = 'mt-1' }: { sure: SureLines; className?: string }) {
  // Three words on the closed button, so the verdict keeps to its first-screen words (spec 20.1).
  const label = sure.lines.length && sure.widest !== null ? `Times ±${withinWords(sure.widest)}` : 'What this leaves out';
  return (
    <Fold label={label} className={className}>
      {sure.lines.length > 0 && (
        <ul className="max-w-[42em] text-[17px] leading-relaxed text-ink">
          {sure.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {sure.basis && <p className="mt-2 max-w-[42em] text-[15px] leading-relaxed text-ink-2">{sure.basis}</p>}
      <p className="mt-2 max-w-[42em] text-[15px] leading-relaxed text-ink-2">{ENERGY_ONLY}</p>
      <p className="mt-2">
        <Link href="/validate#sure" className="text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          How the margins were measured
        </Link>
      </p>
    </Fold>
  );
}
