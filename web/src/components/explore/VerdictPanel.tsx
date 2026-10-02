'use client';
import type { Answer } from '@/lib/viz/answer';

/** A battery on its side: full for a good answer, down to its last sliver for a bad one. */
function BatteryMark({ good }: { good: boolean }) {
  return (
    <svg data-icon={good ? 'battery-full' : 'battery-empty'} viewBox="0 0 38 22" width={38} height={22} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="1.5" width="31" height="19" rx="3.5" />
      <path d="M35.5 7.5v7" strokeLinecap="round" />
      <rect x="5" y="5" width={good ? 24 : 3.5} height="12" rx="1.5" fill="currentColor" stroke="none" />
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
    <section aria-label="The answer" data-tone={answer.tone} className="panel flex flex-col">
      <div className="flex items-start gap-3.5">
        {/* The answer is told in words; the battery only marks it, in the colour of its tone. */}
        <span className={`mt-[7px] shrink-0 ${good ? 'text-good' : 'text-bad'}`}>
          <BatteryMark good={good} />
        </span>
        <h1 className="display text-balance text-[26px] leading-[1.12] sm:text-[32px]">
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
      <p className="mt-auto pt-3 text-ink-2">
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
