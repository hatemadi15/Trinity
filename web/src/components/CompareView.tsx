'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { PeriodControls } from './PeriodControls';
import { PlannerChat } from './PlannerChat';
import { MiniStrip } from './compare/MiniStrip';
import { LanderDialog } from './explore/LanderDialog';
import { siteLabel } from '@/lib/data/loaders';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { landerName } from '@/lib/lander';
import { COMPARE_MAX, exploreStore, type ExploreState } from '@/lib/store/explore';
import { bestSentence, compareRow, READY_PAIRS } from '@/lib/viz/compare';
import { dateLong } from '@/lib/viz/format';

const LINK = 'font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink';
const TAG = 'shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[15px] text-ink-2';
const CELL = 'border-b border-line py-3 pr-4 align-middle';

/**
 * Compare: up to four sites over the same period with the same lander, as a table (one row per site),
 * with one sentence above it naming the best site for each measure. An empty page offers two pairs.
 */
export function CompareView({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  useDemoMode(store);
  const [adding, setAdding] = useState('');
  const [landerOpen, setLanderOpen] = useState(false);
  const landerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    void store.getState().init();
  }, [store]);

  if (s.status !== 'ready') {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <p className="text-ink-2">{s.status === 'error' ? s.error : 'Loading NASA data…'}</p>
        </main>
      </AppFrame>
    );
  }

  const rows = s.compare.map((c) => compareRow(c, s.startUtc, s.days));
  const full = s.compareIds.length >= COMPARE_MAX;
  const candidates = s.sites.filter((x) => x.category !== 'custom' && !s.compareIds.includes(x.id));
  const period = `the ${s.days} days from ${dateLong(s.startUtc, 0)}`;
  const add = () => {
    if (!adding) return;
    void store.getState().addToCompare(adding);
    setAdding('');
  };
  const addPair = (ids: [string, string]) => {
    void (async () => {
      for (const id of ids) await store.getState().addToCompare(id);
    })();
  };

  return (
    <AppFrame>
      <main className="wrap flex flex-col gap-6 pb-12 pt-8">
        <div>
          <h1 className="display text-[34px] leading-tight sm:text-[40px]">Compare sites</h1>
          <p className="mt-2 max-w-[46em] text-lg text-ink-2">Up to four landing sites over the same days, with the same lander landing on the first of them.</p>
        </div>
        <section aria-label="What this comparison is for" className="flex flex-wrap items-end gap-4">
          <PeriodControls startUtc={s.startUtc} days={s.days} onChange={s.setWindow} />
          <div className="flex min-w-0 flex-[1_1_250px] flex-col gap-1.5 text-[15px] text-ink-2">
            <span aria-hidden="true">Lander</span>
            <button
              ref={landerRef}
              type="button"
              onClick={() => setLanderOpen(true)}
              aria-haspopup="dialog"
              aria-label={`Lander: ${landerName(s.params.power)}. Change`}
              className="field flex min-w-0 items-center gap-3 text-left text-base text-ink"
            >
              <span className="grow truncate">{landerName(s.params.power)}</span>
              <span className={TAG}>change</span>
            </button>
          </div>
        </section>
        {s.error && (
          <p role="status" className="text-[15px] text-bad">
            {s.error}
          </p>
        )}

        {rows.length === 0 ? (
          <section aria-labelledby="h-pairs" className="panel">
            <h2 id="h-pairs" className="display text-[23px] font-semibold">
              Start with a pair
            </h2>
            <p className="mt-2 text-ink-2">Each pair shows how much a few kilometres change. Or add sites one by one below.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {READY_PAIRS.map((p) => (
                <button key={p.title} type="button" onClick={() => addPair(p.ids)} className="btn text-left">
                  <span>
                    <span className="block font-semibold">{p.title}</span>
                    <span className="block text-[15px] text-ink-2">{p.ids.map((id) => siteLabel(s.sites.find((x) => x.id === id) ?? { name: id })).join(' and ')}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section aria-labelledby="h-table" className="panel overflow-x-auto">
            <h2 id="h-table" className="sr-only">
              The sites side by side
            </h2>
            <p className="max-w-[60em] text-[17px] leading-relaxed text-ink">{bestSentence(s.compare, s.startUtc, s.days)}</p>
            <table className="mt-4 w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="text-[15px] text-ink-2">
                  {['Site', 'Sun and Earth', 'Sunlight', 'Earth in view', 'Longest night', 'Time with power', 'Verdict', ''].map((h, i) => (
                    <th key={i} scope="col" className="border-b-2 border-ink py-2 pr-4 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <th scope="row" className={`${CELL} font-semibold`}>
                      <Link href={r.href} className={LINK}>
                        {r.name}
                      </Link>
                    </th>
                    <td className={CELL}>
                      <MiniStrip series={s.compare[i].series} name={r.name} period={period} />
                    </td>
                    <td className={`${CELL} tabular-nums`}>{r.sunlight}</td>
                    <td className={`${CELL} tabular-nums`}>{r.earth}</td>
                    <td className={`${CELL} tabular-nums`}>{r.longestNight}</td>
                    <td className={`${CELL} tabular-nums`}>{r.power}</td>
                    <td className={`${CELL} font-medium ${r.tone === 'good' ? 'text-good' : 'text-bad'}`}>{r.verdict}</td>
                    <td className={`${CELL} text-right`}>
                      <button type="button" onClick={() => store.getState().removeFromCompare(r.id)} aria-label={`Remove ${r.name}`} className="h-10 rounded-lg border border-line-strong px-3 text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 text-[15px] text-ink-2">
            <label htmlFor="compare-add">Add a site</label>
            <select id="compare-add" value={adding} disabled={full} onChange={(e) => setAdding(e.target.value)} className="field w-[300px] max-w-full disabled:opacity-60">
              <option value="">{full ? 'Four sites already' : 'Choose a site…'}</option>
              {candidates.map((x) => (
                <option key={x.id} value={x.id}>
                  {siteLabel(x)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={add} disabled={full || !adding} className="btn">
            Add
          </button>
          {full && <p className="pb-3 text-[15px] text-ink-2">Four sites is the most this page compares: remove one to add another.</p>}
        </div>
        {rows.length > 0 && (
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            {rows.length >= 2 && (
              <button type="button" onClick={() => void store.getState().findBestWindow(s.days, 'compare')} className={`${LINK} text-left`}>
                Find the best landing day for these sites in the next 12 months
              </button>
            )}
            <Link href="/brief" className={LINK}>
              Printable brief
            </Link>
          </p>
        )}
        {s.bestWindowNote && <p className="text-[15px] text-ink-2">{s.bestWindowNote}</p>}
        <PlannerChat store={store} variant="panel" />
      </main>
      {landerOpen && <LanderDialog params={s.params} onPower={s.setPower} onParams={s.setParams} busy={s.maskBusy} onClose={() => setLanderOpen(false)} returnFocus={landerRef} />}
    </AppFrame>
  );
}
