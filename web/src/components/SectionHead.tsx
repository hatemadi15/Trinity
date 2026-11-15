import type { ReactNode } from 'react';
import { Reveal } from './Reveal';

/**
 * A section's heading on the home page (spec 23), the same for every section so the page reads as one line from top
 * to bottom: its number and name in the readout face, the title in the display serif, and one sentence.
 */
export function SectionHead({ id, n, kicker, title, lede, tone = 'page', className = '' }: { id: string; n?: string; kicker: string; title: ReactNode; lede?: ReactNode; tone?: 'page' | 'stage'; className?: string }) {
  const soft = tone === 'stage' ? 'text-stage-ink-2' : 'text-ink-2';
  return (
    <Reveal className={className}>
      <p className={`eyebrow flex items-center gap-3 ${tone === 'stage' ? 'text-[#a8c6ff]' : 'text-accent-ink'}`}>
        {n && <span className="pixel text-[17px] tracking-normal">{n}</span>}
        <span aria-hidden="true" className="h-px w-8 bg-current opacity-60" />
        {kicker}
      </p>
      <h2 id={id} className="display mt-4 max-w-[18em] text-balance text-[40px] leading-[1.15] sm:text-[56px]">
        {title}
      </h2>
      {lede && <p className={`mt-4 max-w-[40em] text-lg leading-relaxed ${soft}`}>{lede}</p>}
    </Reveal>
  );
}
