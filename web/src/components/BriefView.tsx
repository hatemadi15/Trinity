'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { SkyDome } from './SkyDome';
import { Timeline } from './Timeline';
import { VerdictChip } from './VerdictChip';
import { askNarration, shortModel } from '@/lib/ai/client';
import { templateBrief } from '@/lib/ai/narrate';
import type { NarrationReply } from '@/lib/ai/protocol';
import { summarizeState, type StateSummary } from '@/lib/ai/state-summary';
import { PANEL_LABELS } from '@/lib/engine/power';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { hoursLabel, pct, utcLabel } from '@/lib/viz/format';

type Narration = { text: string; source: 'template' | 'model' | 'error'; model?: string };

/** One printable page: the selected site and window, a narrated summary, the verdict, six numbers, the two charts, method and data. */
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
  if (s.status !== 'ready' || !s.site || !s.series || !s.summary || !s.mask || !s.power) {
    return (
      <div className="brief mx-auto max-w-[190mm] px-8 py-8">
        <p>{s.status === 'error' ? s.error : 'Loading NASA data…'}</p>
      </div>
    );
  }
  const p = s.params.power;
  const rows: [string, string][] = [
    ['Sun above the skyline', pct(s.summary.illumFraction)],
    ['Longest night', hoursLabel(s.summary.longestDarkH)],
    ['Earth in view', pct(s.summary.earthVisFraction)],
    ['Longest Earth gap', hoursLabel(s.summary.longestEarthGapH)],
    ['Both at once', pct(s.summary.jointFraction)],
    ['Lowest battery', pct(s.power.socMin)],
  ];
  const mast = s.maskMeta?.mastM ?? 2;
  const stateSummary = summarizeState(s);
  const template = stateSummary ? templateBrief(stateSummary) : '';
  const shown = narration && narration.source !== 'error' ? narration.text : template;
  const narrationLabel =
    narration?.source === 'model'
      ? `narrated by ${narration.model ? shortModel(narration.model) : 'the model'}, checked number by number against the figures below`
      : narration?.source === 'error'
        ? 'the planner is offline; written from the numbers above'
        : narration?.source === 'template'
          ? "the model's paragraph did not pass the number check; written from the numbers above"
          : 'written from the numbers above';
  async function write() {
    if (!stateSummary || writing) return;
    setWriting(true);
    try {
      const r = await (narrate ?? ((st: StateSummary) => askNarration(st, store.getState().aiMode)))(stateSummary);
      setNarration({ text: r.reply, source: r.source, model: r.model });
    } catch {
      setNarration({ text: template, source: 'error' });
    } finally {
      setWriting(false);
    }
  }
  const provenance = s.maskMeta?.source === 'computed' ? 'skyline computed in your browser' : 'precomputed skyline';
  return (
    <div className="brief mx-auto flex max-w-[190mm] flex-col gap-4 px-8 py-8">
      <div className="no-print flex items-center justify-between gap-4">
        <Link href="/explore" className="text-sm underline-offset-4 hover:underline">
          Back to Explore
        </Link>
        <button type="button" onClick={() => window.print()} className="rounded-md border border-ink px-3 py-1 text-sm">
          Print or save as PDF
        </button>
      </div>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-2">Earthrise mission brief</p>
        <h1 className="font-display text-2xl font-semibold leading-tight">{s.site.name}</h1>
        <p className="text-sm text-ink-2">
          {s.site.lat.toFixed(3)}°, {s.site.lon.toFixed(3)}°; window {utcLabel(s.startUtc, 0)} for {s.days} days; {provenance} from LOLA, site height{' '}
          {s.maskMeta?.siteHeightM.toFixed(0)} m, {mast} m mast{s.site.approximate ? '; region centre digitised from NASA’s map (about ±5 km)' : ''}.
        </p>
      </header>
      <section className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold">Mission summary</h2>
          <button type="button" onClick={() => void write()} disabled={writing} className="no-print rounded-md border border-ink px-3 py-1 text-sm disabled:opacity-50">
            {writing ? 'Writing…' : 'Write the brief'}
          </button>
        </div>
        <p data-testid="narration">{shown}</p>
        <p className="text-xs text-ink-3">{narrationLabel}</p>
      </section>
      <section className="flex flex-wrap items-start gap-6">
        <VerdictChip power={s.power} />
        <dl className="grid flex-1 grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-ink-2">{k}</dt>
              <dd className="font-display text-xl font-semibold leading-tight">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="grid grid-cols-[1fr_200px] items-start gap-4">
        <Timeline series={s.series} startUtc={s.startUtc} cursor={s.cursorHour} onCursor={() => {}} width={640} />
        <SkyDome mask={s.mask} series={s.series} cursor={s.cursorHour} size={200} />
      </section>
      <section className="flex flex-col gap-1 text-sm">
        <h2 className="font-display text-base font-semibold">Planner settings</h2>
        <p>
          {PANEL_LABELS[p.panel]}, {p.areaM2} m² at {Math.round(p.efficiency * 100)} % efficiency; load {p.loadW} W; battery {p.batteryWh} Wh starting at{' '}
          {Math.round(p.initialSocFraction * 100)} %; Earth counts as in view {s.params.minEarthElDeg}° above the skyline.
        </p>
      </section>
      <section className="flex flex-col gap-1 text-sm">
        <h2 className="font-display text-base font-semibold">How this was computed</h2>
        <p>
          Sun and Earth directions come from the JPL DE440 ephemeris (hourly table, cross-checked against JPL Horizons to 3e-5°). The terrain skyline is traced
          through NASA LRO LOLA elevation grids (20 m posts within 6 km, 80 m to 100 km, 240 m to 220 km) from a {mast} m mast; the Sun counts as up when any part of
          its disk clears the skyline. Power = efficiency × area × 1361 W/m² ÷ AU² × visible Sun fraction × panel cosine; the battery charges with the surplus and
          empties on the deficit in one-hour steps. Error budget: directions under 0.01°, skyline 0.05–0.15°, event timing ±15–60 minutes near the pole.
        </p>
      </section>
      <section className="flex flex-col gap-1 text-sm">
        <h2 className="font-display text-base font-semibold">Data</h2>
        <ul className="list-disc pl-5">
          <li>NASA LRO LOLA polar elevation models (LDEM 20 m, 80 m and 240 m), PDS Geosciences Node.</li>
          <li>JPL DE440 planetary ephemeris and NAIF SPICE kernels; JPL Horizons for the cross-checks.</li>
          <li>Site: {s.site.source === 'user' ? 'coordinates picked by the user on the Earthrise map' : s.site.source}.</li>
        </ul>
      </section>
      <footer className="text-xs text-ink-3">
        Generated {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by Earthrise (NASA Space Apps 2026, team Astroy/Ed).
      </footer>
    </div>
  );
}
