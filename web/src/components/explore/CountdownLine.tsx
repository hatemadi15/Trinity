'use client';
import { useMemo, type CSSProperties } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { countdown, countdownForms, countdownWords, type Body } from '@/lib/viz/countdown';

/** Words as a CSS string, for `content`. */
const cssString = (words: string) => `"${words.replace(/["\\]/g, '\\$&').replace(/\s+/g, ' ')}"`;

/**
 * The Sun's or Earth's part of the line, over unseen copies of every form its words take in the period (digits as 0, in
 * tabular figures), drawn by the stylesheet so the page's words hold each thing once: the part keeps the width of the
 * widest while the hour moves, and nothing beside it shifts.
 */
function Part({ body, forms, words }: { body: Body; forms: string[]; words: string }) {
  return (
    <span data-part={`countdown-${body}`} className="grid">
      {forms.map((f) => (
        <span
          key={f}
          data-form=""
          aria-hidden="true"
          className="invisible col-start-1 row-start-1 whitespace-nowrap before:content-[var(--sizer)]"
          style={{ '--sizer': cssString(f) } as CSSProperties}
        />
      ))}
      <span className="col-start-1 row-start-1 whitespace-nowrap">{words}</span>
    </span>
  );
}

/**
 * At an hour of the period, the time to the next sunset or sunrise and to Earth's next rising or setting, as the key moments
 * name them: "Sunset in 2 d 19 h · Earth rises in 9 d 3 h". The Sun counts while any part of its disc shows and Earth while
 * it is in view, the rules of the status sentence beside it. With no change before the period ends it says so ("No sunrise
 * before the end", "Earth in view to the end") and guesses no date.
 */
export function CountdownLine({ series, hour, className = '' }: { series: Series; hour: number; className?: string }) {
  const sunForms = useMemo(() => countdownForms(series, 'sun'), [series]);
  const earthForms = useMemo(() => countdownForms(series, 'earth'), [series]);
  return (
    <span data-testid="countdown" className={`inline-flex flex-wrap items-baseline gap-x-2 tabular-nums ${className}`}>
      <Part body="sun" forms={sunForms} words={countdownWords(countdown(series, 'sun', hour))} />
      <span aria-hidden="true" className="text-ink-3">
        ·
      </span>
      <Part body="earth" forms={earthForms} words={countdownWords(countdown(series, 'earth', hour))} />
    </span>
  );
}
