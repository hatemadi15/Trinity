'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { siteLabel } from '@/lib/data/loaders';
import { snapshotScenario, scenarioHref, scenarioMetrics, type Scenario } from '@/lib/planner/scenarios';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { dateTimeUtc, isoAt } from '@/lib/viz/format';

type Cell = { scenario: Scenario; hours: number | null; problem?: string };

/** A bounded, on-demand scan: identical duration and hardware in every cell. */
export function DateHeatmap({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const settingsKey = JSON.stringify([s.siteId, s.startUtc, s.days, s.params]);
  return <Heatmap key={settingsKey} store={store} />;
}

function Heatmap({ store }: { store: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const [cells, setCells] = useState<Cell[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = useRef({ version: 0 });
  useEffect(() => {
    const lifetime = run.current;
    return () => { lifetime.version++; };
  }, []);

  async function calculate() {
    const token = ++run.current.version;
    const state = store.getState();
    if (!state.site) return;
    const baseline = snapshotScenario(state);
    // Include the selected point and its two nearest catalogue alternatives.
    const sites = [state.site, ...state.sites.filter((site) => site.id !== state.siteId && site.polar && site.category !== 'custom').sort((a, b) => {
      const score = (lat: number, lon: number) => Math.sin(lat * Math.PI / 180) * Math.sin(state.site!.lat * Math.PI / 180) + Math.cos(lat * Math.PI / 180) * Math.cos(state.site!.lat * Math.PI / 180) * Math.cos((lon - state.site!.lon) * Math.PI / 180);
      return score(b.lat, b.lon) - score(a.lat, a.lon);
    }).slice(0, 2)];
    setBusy(true);
    setProblem(null);
    setCells([]);
    const next: Cell[] = [];
    try {
      for (const site of sites) {
        for (let week = 0; week < 7; week++) {
          if (run.current.version !== token) return;
          const scenario: Scenario = { ...baseline, id: `heat-${site.id}-${week}`, label: siteLabel(site), site, startUtc: isoAt(baseline.startUtc, week * 7 * 24) };
          let cell: Cell;
          try {
            const result = await store.getState().evaluateScenario(scenario);
            if (result.maskMeta.failedTiles > 0) throw new Error('Some terrain tiles are unavailable.');
            cell = { scenario, hours: scenarioMetrics(result).poweredHours };
          } catch (error) {
            cell = { scenario, hours: null, problem: error instanceof Error ? error.message : 'Calculation unavailable' };
          }
          if (run.current.version !== token) return;
          next.push(cell);
          setCells([...next]);
          // Give input and painting a turn between calculations.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } catch (error) {
      if (run.current.version === token) setProblem(error instanceof Error ? error.message : 'Could not calculate these dates.');
    } finally {
      if (run.current.version === token) setBusy(false);
    }
  }

  const ids = [...new Set(cells.map((cell) => cell.scenario.site.id))];
  return (
    <section aria-labelledby="date-grid-title" className="panel no-print">
      <h2 id="date-grid-title" className="display text-[23px] font-semibold">Sites and arrival dates at a glance</h2>
      <p className="mt-2 max-w-[55em] text-ink-2">Compare this site and two nearby catalogue points at seven weekly arrivals. Every cell uses the current lander and a full {s.days}-day forecast. The number is hours of continuous power from arrival, capped at {s.days * 24} hours.</p>
      <button type="button" className="btn mt-4" disabled={busy || !s.site || s.maskBusy} onClick={() => void calculate()}>{busy ? `Calculating ${cells.length} of 21…` : 'Calculate date grid'}</button>
      {problem && <p role="alert" className="mt-3 text-bad">{problem}</p>}
      {cells.length > 0 && (
        <div className="mt-4 overflow-x-auto" aria-busy={busy}>
          <table className="w-full min-w-[750px] border-collapse text-left text-[15px]">
            <caption className="pb-3 text-left text-ink-2">Higher numbers mean longer continuous powered operation. Select a numbered cell to open that exact forecast. Weekly samples do not establish the best possible arrival.</caption>
            <thead><tr><th scope="col" className="p-2">Site</th>{Array.from({ length: 7 }, (_, week) => <th scope="col" key={week} className="p-2 font-medium">{dateTimeUtc(s.startUtc, week * 7 * 24)}</th>)}</tr></thead>
            <tbody>{ids.map((id) => {
              const row = cells.filter((cell) => cell.scenario.site.id === id);
              return <tr key={id}><th scope="row" className="border-t border-line p-2">{siteLabel(row[0].scenario.site)}</th>{Array.from({ length: 7 }, (_, week) => {
                const cell = row[week];
                const tone = cell?.hours == null ? '' : cell.hours >= s.days * 24 ? 'bg-good/15 text-good' : cell.hours >= 24 ? 'bg-sun/15 text-ink' : 'bg-bad/10 text-bad';
                return <td key={week} className="border-t border-line p-1">{cell ? cell.hours === null ? <span title={cell.problem} className="block p-3 text-ink-2">Unavailable</span> : <Link href={scenarioHref(cell.scenario)} className={`block rounded-lg border border-line p-3 font-semibold tabular-nums focus-visible:outline-2 ${tone}`} aria-label={`${siteLabel(cell.scenario.site)}, ${dateTimeUtc(cell.scenario.startUtc, 0)}: ${cell.hours} hours with power`}>{cell.hours} h</Link> : <span className="block p-3 text-ink-2">…</span>}</td>;
              })}</tr>;
            })}</tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[15px] text-ink-2" role="status">{busy ? 'You can keep using the page while the grid fills.' : cells.some((cell) => cell.hours === null) ? 'Unavailable cells could not be calculated; hover over their label for the reason. No missing result is treated as zero.' : 'The grid shows sampled points, rather than whole landing regions.'}</p>
    </section>
  );
}
