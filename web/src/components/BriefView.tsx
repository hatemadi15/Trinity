'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { DataProblem, SYNC_HINT } from './DataProblem';
import { SkyRow } from './SkyRow';
import { askNarration, shortModel } from '@/lib/ai/client';
import { templateBrief } from '@/lib/ai/narrate';
import type { NarrationReply } from '@/lib/ai/protocol';
import { summarizeState, type StateSummary } from '@/lib/ai/state-summary';
import { siteLabel } from '@/lib/data/loaders';
import { timeWithPower } from '@/lib/engine/landing';
import { landerLine } from '@/lib/lander';
import { exploreHref } from '@/lib/links';
import { landingWords, periodWords } from '@/lib/period';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { answerFor } from '@/lib/viz/answer';
import { dayMonth, pct0, spanShort } from '@/lib/viz/format';
import { dayTicks, hillsToward } from '@/lib/viz/timechart';

type Narration = { text: string; source: 'template' | 'model' | 'error'; model?: string; reason?: NarrationReply['reason']; message?: string };

/** The line under the summary paragraph: who wrote it, or why the template stands. */
function narrationLabelFor(n: Narration | null): string {
  if (!n) return 'written by the app from the figures below';
  if (n.source === 'model') return `narrated by ${n.model ? shortModel(n.model) : 'the model'}, checked number by number against the figures below`;
  if (n.source === 'error') return n.message?.startsWith('Too many') ? `${n.message} Written by the app from the figures below.` : 'the assistant is offline; written by the app from the figures below';
  switch (n.reason) {
    case 'cached':
      return 'demo mode; written by the app from the figures below';
    case 'no-key':
      return 'no model configured; written by the app from the figures below';
    case 'model-error':
      return 'the model did not answer; written by the app from the figures below';
    default:
      return "the model's paragraph did not pass the number check; written by the app from the figures below";
  }
}

const SUN_H = 96;
const EARTH_H = 80;

/**
 * One printable page for the selected site and period: a summary paragraph, the verdict in Explore's
 * words, five figures, the Sun's and Earth's rows of the time chart, the lander, the method and the data.
 */
export function BriefView({
  store = exploreStore,
  narrate,
}: {
  store?: StoreApi<ExploreState>;
  /** Injected in tests; by default asks /api/chat for the paragraph. */
  narrate?: (state: StateSummary) => Promise<NarrationReply>;
}) {
  const s = useStore(store);
  const [narration, setNarration] = useState<Narration | null>(null);
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    void store.getState().init();
  }, [store]);
  const sunHill = useMemo(() => (s.mask && s.series ? hillsToward(s.mask, s.series.sunAz) : null), [s.mask, s.series]);
  const earthHill = useMemo(() => (s.mask && s.series ? hillsToward(s.mask, s.series.earthAz) : null), [s.mask, s.series]);
  const sunUp = useMemo(() => (s.series ? Uint8Array.from(s.series.sunFraction, (f) => (f > 0 ? 1 : 0)) : null), [s.series]);
  if (s.status !== 'ready' || !s.site || !s.series || !s.summary || !s.mask || !s.power || !sunHill || !earthHill || !sunUp) {
    return (
      <main className="brief mx-auto max-w-[190mm] px-8 py-8">
        {/* This page has no header, so the way back is here while loading and after a data failure. */}
        <p className="no-print mb-4">
          <Link href={s.site ? exploreHref(s.site.id, s.startUtc, s.days) : '/explore'} className="text-[15px] underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Back to Explore
          </Link>
        </p>
        {s.status === 'error' ? <DataProblem error={s.error} hint={SYNC_HINT} /> : <p>Loading NASA data…</p>}
      </main>
    );
  }
  const p = s.params.power;
  const name = siteLabel(s.site);
  const answer = answerFor({ siteName: name, series: s.series, summary: s.summary, power: s.power, startUtc: s.startUtc, days: s.days, loadW: p.loadW, batteryWh: p.batteryWh, best: s.best });
  const hours = s.days * 24;
  const powered = Math.min(hours, timeWithPower(s.power));
  const figures: [string, string][] = [
    ['Sunlight', `${pct0(s.summary.illumFraction)} of the ${s.days} days`],
    ['Radio contact while it has power', answer.contactHours > 0 ? spanShort(answer.contactHours) : 'none'],
    ['Longest night', s.summary.longestDarkH > 0 ? spanShort(s.summary.longestDarkH) : 'none'],
    ['Time with power', powered >= hours ? `all ${s.days} days` : spanShort(powered)],
    ['Battery when full', `${spanShort(p.loadW > 0 ? p.batteryWh / p.loadW : 0)} at ${p.loadW} W`],
  ];
  const mast = s.maskMeta?.mastM ?? 2;
  const stateSummary = summarizeState(s);
  const template = stateSummary ? templateBrief(stateSummary) : '';
  const shown = narration && narration.source !== 'error' ? narration.text : template;
  const narrationLabel = narrationLabelFor(narration);
  async function write() {
    if (!stateSummary || writing) return;
    setWriting(true);
    try {
      const r = await (narrate ?? ((st: StateSummary) => askNarration(st, store.getState().aiMode)))(stateSummary);
      setNarration({ text: r.reply, source: r.source, model: r.model, reason: r.reason });
    } catch (err) {
      setNarration({ text: template, source: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setWriting(false);
    }
  }
  const provenance = s.maskMeta?.source === 'flat' ? 'a flat horizon (no polar height data there)' : s.maskMeta?.source === 'computed' ? 'hills worked out in your browser from NASA elevation data' : 'hills measured from NASA elevation data';
  const period = `the ${s.days} days from ${landingWords(s.startUtc)}`;
  const ticks = dayTicks(s.days);
  return (
    <main className="brief mx-auto flex max-w-[190mm] flex-col gap-5 px-8 py-8">
      <div className="no-print flex items-center justify-between gap-4">
        <Link href={exploreHref(s.site.id, s.startUtc, s.days)} className="text-[15px] underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Back to Explore
        </Link>
        <button type="button" onClick={() => window.print()} className="btn">
          Print or save as PDF
        </button>
      </div>
      <header className="flex flex-col gap-1">
        <p className="text-[15px] text-ink-2">Earthrise mission brief</p>
        <h1 className="display text-[30px] leading-tight">{name}</h1>
        <p className="text-[15px] text-ink-2">
          {/* The period as a planner copies it: the landing with its hour in UTC, then the length. */}
          {Math.abs(s.site.lat).toFixed(3)}° {s.site.lat < 0 ? 'S' : 'N'}, {Math.abs(s.site.lon).toFixed(3)}° {s.site.lon < 0 ? 'W' : 'E'}; {periodWords(s.startUtc, s.days)}.
        </p>
      </header>
      <section className="flex flex-col gap-1 text-[15px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-[18px] font-semibold">Mission summary</h2>
          <button type="button" onClick={() => void write()} disabled={writing} className="no-print btn h-10 px-3 text-[15px] disabled:opacity-50">
            {writing ? 'Writing…' : 'Let the assistant write it'}
          </button>
        </div>
        <p data-testid="narration" aria-live="polite">{shown}</p>
        <p className="text-ink-2">{narrationLabel}</p>
      </section>
      <section aria-labelledby="brief-verdict" className={`border-l-4 pl-4 ${answer.tone === 'good' ? 'border-good' : 'border-bad'}`}>
        <h2 id="brief-verdict" className="display text-[20px] font-semibold leading-snug">
          {answer.title}
        </h2>
        {answer.sentences.map((line) => (
          <p key={line} className="mt-1 text-[15px]">
            {line}
          </p>
        ))}
        {answer.better && <p className="mt-1 text-[15px]">{answer.better.note}</p>}
        {answer.hint && <p className="mt-1 text-[15px] text-ink-2">{answer.hint}</p>}
      </section>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-3">
        {figures.map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink-2">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <section aria-label="The Sun and Earth, hour by hour" className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold">The Sun</p>
        <div className="stage">
          <SkyRow el={s.series.sunEl} hill={sunHill} visible={sunUp} startUtc={s.startUtc} body="sun" caption={`The Sun over ${period}`} height={SUN_H} ticks={false} />
        </div>
        <p className="text-[15px] font-semibold">Earth</p>
        <div className="stage">
          <SkyRow el={s.series.earthEl} hill={earthHill} visible={s.series.earthVisible} startUtc={s.startUtc} body="earth" caption={`Earth over ${period}`} height={EARTH_H} ticks={false} />
        </div>
        <div aria-hidden="true" className="relative h-5 text-[14px] text-ink-2">
          {/* Every other day label gives way on a phone, as on Explore's chart, so none overlap. */}
          {ticks.map((d, i) => (
            <span key={d} data-day="" className={`absolute whitespace-nowrap ${i % 2 === 1 ? 'max-sm:hidden' : ''}`} style={d === 0 ? { left: 0 } : { left: `${((d * 24) / s.series!.hours) * 100}%`, transform: 'translateX(-50%)' }}>
              {dayMonth(s.startUtc, d * 24)}
            </span>
          ))}
        </div>
        <p className="text-[14px] text-ink-2">Gold: the Sun&apos;s height; blue: Earth&apos;s; dotted while set; grey: the hills in that direction. Time runs left to right.</p>
      </section>
      <section className="flex flex-col gap-1 text-[15px]">
        <h2 className="display text-[18px] font-semibold">The lander</h2>
        <p>
          {landerLine(p)}, starting with the battery {Math.round(p.initialSocFraction * 100)}&nbsp;% full; Earth counts as in view{' '}
          {s.params.minEarthElDeg > 0 ? `when it clears the hills by at least ${s.params.minEarthElDeg}°` : 'whenever it clears the hills'}.
        </p>
      </section>
      <section className="flex flex-col gap-1 text-[15px]">
        <h2 className="display text-[18px] font-semibold">How this was computed</h2>
        {/* The site's setting sits here, not under its name, so the first line is the place and the period; it is text, not a fold, because the brief is printed. */}
        <p>
          Site height {s.maskMeta?.siteHeightM.toFixed(0)} m with a {mast} m mast; {provenance}
          {s.site.approximate ? '; the site is the centre of a region drawn on NASA’s map (about ±5 km)' : ''}. The Sun&apos;s and Earth&apos;s directions come from the JPL DE440 ephemeris (an hourly table, checked against JPL Horizons to 0.00003°).
          The hills on the horizon are traced through
          NASA LRO LOLA elevation grids (20 m within 6 km, 80 m to 100 km, 240 m to 220 km) from a {mast} m mast; the Sun counts as up when any part of it clears the hills. Power is the
          panel&apos;s share of 1361 W/m² at the Moon&apos;s distance from the Sun, times the part of the Sun in view; the battery charges with the surplus and empties on the deficit, hour by hour.
          Errors: directions under 0.01°, the hills 0.05 to 0.15°, times within 15 to 60 minutes near the pole.
        </p>
      </section>
      <section className="flex flex-col gap-1 text-[15px]">
        <h2 className="display text-[18px] font-semibold">Data</h2>
        <ul className="list-disc pl-5">
          <li>NASA LRO LOLA polar elevation models (LDEM 20 m, 80 m and 240 m), PDS Geosciences Node.</li>
          <li>JPL DE440 planetary ephemeris and NAIF SPICE kernels; JPL Horizons for the cross-checks.</li>
          <li>Site: {s.site.source === 'user' ? 'coordinates picked by the user on the Earthrise map' : s.site.source}.</li>
        </ul>
      </section>
      <footer className="text-[14px] text-ink-2">
        Generated {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by Earthrise (NASA Space Apps 2026, team Astroy/Ed).
      </footer>
    </main>
  );
}
