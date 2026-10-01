'use client';
import type { Answer } from '@/lib/viz/answer';

function Icon({ good }: { good: boolean }) {
  return (
    <svg viewBox="0 0 32 32" width={34} height={34} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
      <circle cx="16" cy="16" r="13" />
      {good ? <path d="M10 16.5l4.2 4.2L22 12.5" /> : <path d="M11.5 11.5l9 9m0-9l-9 9" />}
    </svg>
  );
}

/**
 * The answer, first on the page: what happens to the power, why, and the better landing date. The
 * better date is the one gold button; when there is none, "Compare sites" is.
 */
export function VerdictPanel({
  siteName,
  answer,
  onLand,
  onCompare,
  onYear,
  yearNote,
}: {
  siteName: string;
  answer: Answer;
  onLand: (startUtc: string) => void;
  onCompare: () => void;
  onYear: () => void;
  yearNote: string | null;
}) {
  const good = answer.tone === 'good';
  const better = answer.better;
  return (
    <section aria-label="The answer" data-tone={answer.tone} className={`rounded-lg border px-6 py-5 ${good ? 'border-good-line bg-good-bg' : 'border-bad-line bg-bad-bg'}`}>
      <div className={`flex items-start gap-3 ${good ? 'text-good' : 'text-bad'}`}>
        <Icon good={good} />
        <h1 className="display text-[32px] leading-[1.12]">
          <span className="sr-only">{siteName}: </span>
          {answer.title}
        </h1>
      </div>
      <p className="mt-2.5 max-w-[42em] text-[17px] leading-relaxed text-ink">{answer.sentences.join(' ')}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {better && (
          <button type="button" onClick={() => onLand(better.startUtc)} className="btn btn-primary">
            {better.label}
          </button>
        )}
        <button type="button" onClick={onCompare} className={better ? 'btn' : 'btn btn-primary'}>
          Compare sites
        </button>
      </div>
      {(better?.note || answer.hint) && <p className="mt-3 text-ink-2">{better ? better.note : answer.hint}</p>}
      <p className="mt-2 text-ink-2">
        <button type="button" onClick={onYear} className="min-h-[40px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Find the best date in the next 12 months
        </button>
      </p>
      {yearNote && (
        <p role="status" className="text-ink-2">
          {yearNote}
        </p>
      )}
    </section>
  );
}
