'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { PlannerParamsPanel } from './PlannerParamsPanel';
import { Sparkline } from './Sparkline';
import { VerdictChip } from './VerdictChip';
import { WindowControls } from './WindowControls';
import { COMPARE_MAX, exploreStore, type ExploreState, type SiteResult } from '@/lib/store/explore';
import { hoursLabel, pct, utcLabel } from '@/lib/viz/format';

export function CompareView({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
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
      <main className="flex flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
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
                className="min-w-[280px] rounded-md border border-line bg-panel px-2 py-1 text-ink disabled:opacity-50"
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
          </div>
          <WindowControls
            startUtc={s.startUtc}
            days={s.days}
            onWindow={s.setWindow}
            onBestWindow={(d) => void store.getState().findBestWindow(d)}
            bestWindowNote={s.bestWindowNote}
          />
        </div>
        <PlannerParamsPanel params={s.params} onParams={s.setParams} onPower={s.setPower} busy={s.maskBusy} />
        {s.error && (
          <p role="status" className="text-sm text-warn">
            {s.error}
          </p>
        )}
        {s.compare.length === 0 ? (
          <p className="rounded-md bg-panel p-6 text-ink-2">
            Add up to four sites to compare them over the same window and planner settings. Explore a site and press “Add to
            compare”, or pick one above.
          </p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {s.compare.map((c) => (
              <CompareColumn
                key={c.site.id}
                result={c}
                startUtc={s.startUtc}
                days={s.days}
                onRemove={() => store.getState().removeFromCompare(c.site.id)}
                onOpen={() => void store.getState().selectSite(c.site.id)}
              />
            ))}
          </div>
        )}
      </main>
    </AppFrame>
  );
}

function CompareColumn({
  result,
  startUtc,
  days,
  onRemove,
  onOpen,
}: {
  result: SiteResult;
  startUtc: string;
  days: number;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { site, series, summary, power, contacts } = result;
  const rows: [string, string][] = [
    ['Sun above the skyline', pct(summary.illumFraction)],
    ['Longest night', hoursLabel(summary.longestDarkH)],
    ['Earth in view', pct(summary.earthVisFraction)],
    ['Longest Earth gap', hoursLabel(summary.longestEarthGapH)],
    ['Lowest battery', pct(power.socMin)],
    ['Hours without full power', hoursLabel(power.brownoutHours)],
  ];
  return (
    <article aria-label={site.name} className="flex min-w-[260px] max-w-[340px] flex-1 flex-col gap-3 rounded-md bg-panel p-4">
      <div>
        <h2 className="font-display text-lg font-semibold leading-tight">{site.name}</h2>
        <p className="text-xs text-ink-3">
          {site.lat.toFixed(3)}°, {site.lon.toFixed(3)}°
        </p>
      </div>
      <Sparkline series={series} />
      <p className="text-xs text-ink-3">
        {utcLabel(startUtc, 0)} + {days} days; {contacts.length} Earth contact {contacts.length === 1 ? 'window' : 'windows'}
      </p>
      <VerdictChip power={power} />
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
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
