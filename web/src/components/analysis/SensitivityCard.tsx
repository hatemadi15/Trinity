'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { scenarioMetrics, snapshotScenario } from '@/lib/planner/scenarios';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { PARAM_RANGES } from '@/lib/planner-ranges';

type Sample = { mastM: number; poweredHours?: number; contactHours?: number; problem?: string };

export function SensitivityCard({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const key = JSON.stringify([s.siteId, s.startUtc, s.days, s.params]);
  return <Sensitivity key={key} store={store} />;
}

function Sensitivity({ store }: { store: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [busy, setBusy] = useState(false);
  const run = useRef({ version: 0 });
  useEffect(() => {
    const lifetime = run.current;
    return () => { lifetime.version++; };
  }, []);

  async function calculate() {
    const token = ++run.current.version;
    const baseline = snapshotScenario(store.getState());
    const heights = [...new Set([Math.max(PARAM_RANGES.mastM.min, baseline.params.mastM - 2), baseline.params.mastM, Math.min(PARAM_RANGES.mastM.max, baseline.params.mastM + 2)])].sort((a, b) => a - b);
    setBusy(true);
    setSamples([]);
    const next: Sample[] = [];
    for (const mastM of heights) {
      if (run.current.version !== token) return;
      try {
        const result = await store.getState().evaluateScenario({ ...baseline, params: { ...baseline.params, mastM } });
        if (result.maskMeta.failedTiles > 0) throw new Error('Some terrain tiles could not be loaded.');
        const metrics = scenarioMetrics(result);
        next.push({ mastM, poweredHours: metrics.poweredHours, contactHours: metrics.contactHours });
      } catch (error) {
        next.push({ mastM, problem: error instanceof Error ? error.message : 'Calculation unavailable' });
      }
      if (run.current.version !== token) return;
      setSamples([...next]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (run.current.version === token) setBusy(false);
  }

  return <section aria-labelledby="sensitivity-title" className="panel no-print">
    <h2 id="sensitivity-title" className="display text-[23px] font-semibold">How sensitive is this answer?</h2>
    <p className="mt-2 max-w-[55em] text-ink-2">Recalculate this exact point with a lower and higher mast. Only the observer height changes; the arrival, panel, battery and load stay the same. The surrounding terrain horizon is calculated again for each height.</p>
    {s.site?.approximate && <p className="mt-2 text-warn">This region centre is approximate to about 5 km. Changing mast height does not measure the uncertainty across that region.</p>}
    <button type="button" className="btn mt-4" disabled={busy || !s.site || s.maskBusy} onClick={() => void calculate()}>{busy ? 'Calculating terrain horizons…' : 'Compare mast heights'}</button>
    {samples.length > 0 && <div className="mt-4 overflow-x-auto" aria-busy={busy}><table className="w-full border-collapse text-left text-[15px]">
      <thead><tr>{['Mast', 'Continuous powered hours', 'Earth in view while powered'].map((title) => <th key={title} scope="col" className="border-b border-line p-2">{title}</th>)}</tr></thead>
      <tbody>{samples.map((sample) => <tr key={sample.mastM}><th scope="row" className="border-b border-line p-2">{sample.mastM} m{sample.mastM === s.params.mastM ? ' (current)' : ''}</th>{sample.problem ? <td colSpan={2} className="border-b border-line p-2 text-bad">Unavailable: {sample.problem}</td> : <><td className="border-b border-line p-2">{sample.poweredHours} h</td><td className="border-b border-line p-2">{sample.contactHours} h</td></>}</tr>)}</tbody>
    </table></div>}
    <p className="mt-3 text-[15px] text-ink-2" role="status">{busy ? `${samples.length} terrain horizons calculated.` : 'This is a sensitivity sample, not a complete uncertainty bound. A flat-horizon site may give identical results.'}</p>
  </section>;
}
