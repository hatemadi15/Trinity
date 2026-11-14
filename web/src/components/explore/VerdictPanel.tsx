'use client';
import Link from 'next/link';
import type { RankBy } from '@/lib/plan/rank';
import type { Requirements } from '@/lib/plan/requirements';
import type { SureLines } from '@/lib/uncertainty/budget';
import type { Answer, PlanView } from '@/lib/viz/answer';
import { Fold } from '../Fold';
import { lolaFor, Sources } from '../Sources';
import { OptionsList, RankFields, RequirementsFields } from './PlanParts';
import { SureFold } from './SureFold';

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
 * The answer, first on the page: where and when the lander lands, how long the power lasts, contact
 * with Earth in that time and, one tap away, why; then the better landing date and a better place nearby,
 * and the way to stand at the site. The better date is the one gold button; when there is none, "Compare sites" is.
 */
export function VerdictPanel({
  answer,
  onLand,
  onCompare,
  onYear,
  yearNote,
  nearby = null,
  standLink,
  site,
  plan = null,
  requirements,
  onRequirements,
  rankBy,
  onRankBy,
  range = null,
  sure,
  limitation = null,
}: {
  answer: Answer;
  onLand: (startUtc: string) => void;
  onCompare: () => void;
  onYear: () => void;
  yearNote: string | null;
  /** A nearby site that keeps power clearly longer from the same landing day, in one sentence with its link. */
  nearby?: { words: string; name: string; href: string } | null;
  /** The stand view for this site, period and hour. */
  standLink?: string;
  /** The site, for the grid its hills are read from in the row of data sources; without it the row names no grid. */
  site?: { lat: number; polar: boolean };
  /**
   * Every option behind the recommendations, one tap away under "Options": what they are ranked by, each one's
   * checks, trade-offs and reason. With it the better date's note waits there too, so the first screen keeps its words.
   */
  plan?: PlanView | null;
  /** The mission's requirements and their boxes, in the same fold; without `onRequirements` there are no boxes. */
  requirements?: Requirements;
  onRequirements?: (patch: Partial<Requirements>) => void;
  /** What the options are ranked by after the requirements, and its control, in the same fold; without `onRankBy` there is none. */
  rankBy?: RankBy;
  onRankBy?: (by: RankBy) => void;
  /** The same result worked out around an approximate point: one line next to the result, how it was found in the fold. */
  range?: { words: string; detail?: string | null } | null;
  /** The verdict's times with their supported margins, and what the power figures leave out (one tap away). */
  sure?: SureLines | null;
  /** What limits the terrain behind the figures (lib/viz/terrain verdictLimitation): a short line under the first sentence, the whole limit one tap away; null when it is complete. */
  limitation?: { line: string | null; label: string; detail: string } | null;
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
        {/* The site's number stays with its name: "Rim 2" never breaks across two lines. */}
        <h1 className="display text-balance text-[24px] leading-[1.12] sm:text-[32px]">{answer.title.replace(/ (\d+) on /, '\u00a0$1 on ')}</h1>
      </div>
      {/* The first sentence leads on a line of its own. The reasons wait one tap away under the stand view's words for
          them, since the first screen keeps one short answer (spec 20.1); an answer of one sentence has none to fold. */}
      <p className="mt-2.5 max-w-[42em] text-[17px] font-medium leading-relaxed text-ink">{answer.sentences[0]}</p>
      {limitation?.line && <p className="mt-2 max-w-[42em] text-[15px] font-medium text-warn">{limitation.line}</p>}
      {limitation && (
        <Fold label={limitation.label} className="mt-1">
          <p className="max-w-[42em] text-[15px] text-ink">{limitation.detail}</p>
        </Fold>
      )}
      {answer.sentences.length > 1 && (
        <Fold label="Why this happens" className="mt-1">
          <p className="max-w-[42em] text-[17px] leading-relaxed text-ink">{answer.sentences.slice(1).join(' ')}</p>
        </Fold>
      )}
      {sure && <SureFold sure={sure} />}
      {/* A point known only to a few kilometres: the same result around it, next to the result itself. */}
      {range && <p className="mt-2 max-w-[42em] text-ink">{range.words}</p>}
      {/* One gold action: the better date, else the better place nearby (below), else comparing sites. */}
      {(better || !nearby) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {better ? (
            <button type="button" onClick={() => onLand(better.startUtc)} className="btn btn-primary">
              {better.label}
            </button>
          ) : (
            <button type="button" onClick={onCompare} className="btn btn-primary">
              Compare sites
            </button>
          )}
        </div>
      )}
      {/* With the options list, the better date's note waits in it, beside its checks and why it ranks first. */}
      {(better ? better.note && !plan : answer.hint) && <p className="mt-3 text-ink-2">{better ? better.note : answer.hint}</p>}
      {/* A better place nearby: a link beside a better date, the gold action when there is no better date. */}
      {nearby &&
        (better ? (
          <p className="mt-3 max-w-[42em] text-ink">
            {nearby.words}{' '}
            <Link href={nearby.href} className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Explore {nearby.name}
            </Link>
          </p>
        ) : (
          <div className="mt-3">
            <p className="max-w-[42em] font-medium text-ink">{nearby.words}</p>
            <Link href={nearby.href} className="btn btn-primary mt-3">
              Explore {nearby.name}
            </Link>
          </div>
        ))}
      {/* The way to stand at the site: the plain button, so the app's best view reads as a way in, never a second gold
          action (both readers, part C read 1). */}
      {standLink && (
        <p className="mt-2">
          <Link href={standLink} className="btn btn-sm">
            Stand at the site
          </Link>
        </p>
      )}
      {/* For a planner, one tap away: why the better date, the requirements, and every option with its checks and reasons. */}
      {plan && (
        <Fold label="Options" className="mt-2">
          <div className="flex flex-col gap-4 text-[15px] leading-relaxed">
            {better && (
              <div className="max-w-[46em]">
                <p className="font-medium text-ink">{better.label}</p>
                <p className="text-ink">{better.note}</p>
                {better.checks && <p className="text-ink">{better.checks}</p>}
                {better.why && <p className="text-ink">{better.why}</p>}
              </div>
            )}
            {requirements && onRequirements && <RequirementsFields value={requirements} onChange={onRequirements} />}
            {rankBy && onRankBy && <RankFields value={rankBy} onChange={onRankBy} />}
            <OptionsList plan={plan} onLand={onLand} />
            {range?.detail && <p className="max-w-[46em] text-ink-2">{range.detail}</p>}
          </div>
        </Fold>
      )}
      <p className="mt-auto flex flex-wrap items-center gap-x-5 pt-3 text-ink-2">
        <button type="button" onClick={onYear} className="min-h-[40px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Find the best date in the next 12 months
        </button>
        {/* After the link's own jump to the assistant, its box takes the cursor without a second scroll. */}
        <a
          href="#ask"
          onClick={() => requestAnimationFrame(() => document.getElementById('ask')?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true }))}
          className="inline-flex min-h-[40px] items-center underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          Or ask in plain words
        </a>
      </p>
      {yearNote && (
        <p role="status" className="text-ink-2">
          {yearNote}
        </p>
      )}
      {/* The answer's figures come from the positions and the hills, and were checked against Horizons: named last, as on every panel. */}
      <Sources of={['de440', ...lolaFor(...(site ? [site] : [])), 'horizons']} />
    </section>
  );
}
