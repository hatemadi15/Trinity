'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { PlannerChat } from './PlannerChat';
import { PlannerParamsPanel } from './PlannerParamsPanel';
import { Sparkline } from './Sparkline';
import { VerdictChip } from './VerdictChip';
import { WindowControls } from './WindowControls';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { COMPARE_MAX, exploreStore, type ExploreState, type SiteResult } from '@/lib/store/explore';
import { hoursLabel, pct, utcLabel } from '@/lib/viz/format';

export function CompareView({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  useDemoMode(store);
  const [adding, setAdding] = useState('');
  useEffect(() => {
    void store.getState().init();
  }, [store]);
  if (s.status !== 'ready' || !s.site) {
    return (
      <AppFrame>
        <p className="px-6 py-10 text-ink-2">{s.status === 'error' ? s.error : 'Loading NASA data…'}</p>
      </AppFrame>
    );
  }
  const current = s.site;
  const candidates = [current, ...s.sites.filter((x) => x.polar && x.id !== current.id)].filter((x) => !s.compareIds.includes(x.id));
  const full = s.compareIds.length >= COMPARE_MAX;
  return (
    <AppFrame>
      <main className="flex flex-col">
        <div className="glass-bar flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              Add site
              <select
                aria-label="Add site"
                value={adding}
                disabled={full}
                onChange={(e) => {
                  setAdding('');
                  if (e.target.value) void store.getState().addToCompare(e.target.value);
                }}
                className="w-[300px] max-w-full rounded-md border border-line bg-panel px-2 py-1 text-ink disabled:opacity-50"
              >
                <option value="">{full ? 'Four sites compared (maximum)' : 'Choose a site…'}</option>
                {candidates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="pb-1 text-sm text-ink-3">Compared sites ({s.compareIds.length})</span>
            <Link href="/brief" className="pb-1 text-sm text-ink-2 underline-offset-4 hover:underline">
              Export brief
            </Link>
          </div>
          <WindowControls
            startUtc={s.startUtc}
            days={s.days}
            onWindow={s.setWindow}
            onBestWindow={(d) => void store.getState().findBestWindow(d, 'compare')}
            bestWindowNote={s.bestWindowNote}
          />
        </div>
        <div className="flex flex-col gap-3 p-3">
        <PlannerParamsPanel params={s.params} onParams={s.setParams} onPower={s.setPower} busy={s.maskBusy} />
        <PlannerChat store={store} />
        {s.error && (
          <p role="status" className="text-sm text-warn">
            {s.error}
          </p>
        )}
        {s.compare.length === 0 ? (
          <p className="glass rounded-md p-6 text-ink-2">
            Add up to four sites to compare them over the same window and planner settings. Explore a site and press “Add to
            compare”, or pick one above.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {s.compare.map((c) => (
              <CompareColumn
                key={c.site.id}
                result={c}
                startUtc={s.startUtc}
                days={s.days}
                plannerMastM={s.params.mastM}
                audience={s.audience}
                onRemove={() => store.getState().removeFromCompare(c.site.id)}
                onOpen={() => void store.getState().selectSite(c.site.id)}
              />
            ))}
          </div>
        )}
        </div>
      </main>
    </AppFrame>
  );
}

const LEARN_ROWS = new Set(['Sun above the skyline', 'Longest night', 'Earth in view', 'Longest Earth gap']);

function CompareColumn({
  result,
  startUtc,
  days,
  plannerMastM,
  audience,
  onRemove,
  onOpen,
}: {
  result: SiteResult;
  startUtc: string;
  days: number;
  plannerMastM: number;
  audience: 'planner' | 'learn';
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { site, series, summary, power, contacts, mastM } = result;
  const all: [string, string][] = [
    ['Sun above the skyline', pct(summary.illumFraction)],
    ['Longest night', hoursLabel(summary.longestDarkH)],
    ['Earth in view', pct(summary.earthVisFraction)],
    ['Longest Earth gap', hoursLabel(summary.longestEarthGapH)],
    ['Both at once', pct(summary.jointFraction)],
    ['Lowest battery', pct(power.socMin)],
  ];
  // Learn mode keeps the same four numbers as the Explore tiles.
  const rows = audience === 'learn' ? all.filter(([k]) => LEARN_ROWS.has(k)) : all;
  return (
    <article aria-label={site.name} className="glass flex min-w-[300px] max-w-[380px] flex-1 flex-col gap-3 rounded-md p-4">
      <div>
        <h2 className="font-display text-xl font-semibold leading-tight">{site.name}</h2>
        <p className="text-xs text-ink-2">
          {site.lat.toFixed(3)}°, {site.lon.toFixed(3)}°
        </p>
      </div>
      <Sparkline series={series} />
      <p className="text-xs text-ink-2">
        {utcLabel(startUtc, 0)} + {days} days; {contacts.length} Earth contact {contacts.length === 1 ? 'window' : 'windows'}; skyline
        computed with a {mastM} m mast
        {mastM !== plannerMastM ? ` (the planner's ${plannerMastM} m mast applies to the Explore site)` : ''}
      </p>
      <VerdictChip power={power} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="border-t border-line pt-2">
            <dt className="text-xs text-ink-2">{k}</dt>
            <dd className="font-display text-[26px] font-semibold leading-none tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex gap-2">
        <Link href="/explore" onClick={onOpen} className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink">
          Open in Explore
        </Link>
        <button type="button" onClick={onRemove} className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink">
          Remove
        </button>
      </div>
    </article>
  );
}
