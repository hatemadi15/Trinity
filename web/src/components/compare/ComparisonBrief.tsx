'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { DataProblem, SYNC_HINT } from '../DataProblem';
import { ASSUMPTIONS } from './CompareStory';
import { useDataVersions } from './ComparisonFiles';
import { columnsOf } from './columns';
import { landerLine, presetOf } from '@/lib/lander';
import { comparisonHref, readComparison } from '@/lib/scenario/codec';
import { startWords } from '@/lib/scenario/period';
import { APP } from '@/lib/scenario/versions';
import { exploreStore, type ExploreState, type MaskMeta } from '@/lib/store/explore';
import { scenarioStore, type ScenarioState } from '@/lib/store/scenarios';
import { figureRows, settingRows, story, timingLine, type Column } from '@/lib/viz/compare';
import { isoAt } from '@/lib/viz/format';

const CELL = 'border-b border-line py-1.5 pr-3 align-top';

function coordinates(c: Column): string {
  const { lat, lon } = c.site;
  return `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(3)}° ${lon < 0 ? 'W' : 'E'}`;
}

/** Where a scenario's hills came from, in plain words with the mast they were traced from. */
function skylineWords(mask: MaskMeta | null | undefined, mastM: number): string {
  if (!mask) return 'not worked out yet';
  const height = `site height ${mask.siteHeightM.toFixed(0)} m`;
  const tiles = mask.failedTiles > 0 ? `; ${mask.failedTiles} elevation tiles did not load, so the hills may be incomplete` : '';
  if (mask.source === 'flat') return 'a flat horizon: no polar elevation data there';
  if (mask.source === 'computed') return `hills traced in the browser from NASA LOLA elevation tiles, from a ${mastM} m mast; ${height}${tiles}`;
  return `hills precomputed from NASA LOLA elevation grids (20 m within 6 km, 80 m to 100 km, 240 m to 220 km), from a ${mastM} m mast; ${height}`;
}

/**
 * The comparison brief: one printable page with every scenario's settings in UTC, the comparison in words, the figures
 * side by side with the change from the baseline, what the figures assume and do not show, where each skyline and the
 * data came from, the app's and the data's versions, and the link that opens the same comparison again.
 */
export function ComparisonBrief({ store = exploreStore, scenarios = scenarioStore }: { store?: StoreApi<ExploreState>; scenarios?: StoreApi<ScenarioState> }) {
  const s = useStore(store);
  const sc = useStore(scenarios);
  const versions = useDataVersions();
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    let live = true;
    void store
      .getState()
      .init()
      .then(() => {
        if (!live) return;
        setOrigin(window.location.origin);
        const r = readComparison(window.location.search);
        if (r.found) scenarios.getState().load(r.scenarios, r.problem);
      });
    return () => {
      live = false;
    };
  }, [store, scenarios]);

  const back = comparisonHref(sc.scenarios);
  const head = (
    <div className="no-print flex items-center justify-between gap-4">
      <Link href={back} className="text-[15px] underline decoration-line-strong underline-offset-4 hover:decoration-ink">
        Back to Compare
      </Link>
      {s.status === 'ready' && sc.scenarios.length > 0 && (
        <button type="button" onClick={() => window.print()} className="btn">
          Print or save as PDF
        </button>
      )}
    </div>
  );
  if (s.status !== 'ready') {
    return (
      <main className="brief mx-auto max-w-[190mm] px-8 py-8">
        {head}
        {s.status === 'error' ? <DataProblem error={s.error} hint={SYNC_HINT} /> : <p className="mt-4">Loading NASA data…</p>}
      </main>
    );
  }
  const cols = columnsOf(sc.scenarios, sc.runs, s.sites);
  if (cols.length === 0) {
    return (
      <main className="brief mx-auto max-w-[190mm] px-8 py-8">
        {head}
        <p className="mt-4">{sc.problem ?? 'There is no comparison to print yet: make one on Compare first.'}</p>
      </main>
    );
  }
  const words = story(cols);
  const settings = settingRows(cols);
  const figures = figureRows(cols);
  const done = cols.every((c) => c.outcome);
  return (
    <main className="brief mx-auto flex max-w-[190mm] flex-col gap-5 px-8 py-8">
      {head}
      <header className="flex flex-col gap-1">
        <p className="text-[15px] text-ink-2">Earthrise comparison brief</p>
        <h1 className="display text-[30px] leading-tight">
          {cols.length === 1 ? cols[0].scenario.label : `${cols[0].scenario.label} and ${cols.length - 1} more scenario${cols.length > 2 ? 's' : ''}`}
        </h1>
        <p className="text-[15px] text-ink-2">
          Baseline: {cols[0].siteName}, landing {startWords(cols[0].scenario.startUtc)}, {cols[0].scenario.days} days. All times are UTC.
        </p>
      </header>
      {sc.problem && <p className="text-[15px] text-bad">{sc.problem}</p>}
      {!done && <p className="text-[15px] text-ink-2">Working out the figures…</p>}

      <section aria-labelledby="cb-words" className="flex flex-col gap-1.5 text-[15px]">
        <h2 id="cb-words" className="display text-[18px] font-semibold">
          The comparison in words
        </h2>
        <p>{timingLine(cols)}</p>
        {words.atOriginal.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {words.alternative && (
          <>
            <p>{words.alternative.lead}</p>
            <ul className="list-disc pl-5">
              {words.alternative.tradeoffs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="cb-table" className="flex flex-col gap-1.5">
        <h2 id="cb-table" className="display text-[18px] font-semibold">
          Side by side
        </h2>
        <div role="region" aria-label="The scenarios side by side" tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr>
                <th scope="col" className={`${CELL} font-semibold`}>
                  Scenario
                </th>
                {cols.map((c, i) => (
                  <th key={c.scenario.id} scope="col" className={`${CELL} font-semibold`}>
                    {i === 0 ? 'Baseline: ' : `${i + 1}. `}
                    {c.scenario.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settings.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className={`${CELL} font-normal text-ink-2`}>
                    {r.name}
                  </th>
                  {r.cells.map((cell, i) => (
                    <td key={cols[i].scenario.id} className={CELL}>
                      {cell.value}
                      {cell.change ? ` (${cell.change})` : ''}
                      {r.id === 'landing' && cols[i].scenario.timing === 'site-best' ? ', the site’s own best time' : ''}
                    </td>
                  ))}
                </tr>
              ))}
              {figures.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className={`${CELL} font-normal text-ink-2`}>
                    {r.name}
                  </th>
                  {r.cells.map((cell, i) => (
                    <td key={cols[i].scenario.id} className={CELL}>
                      {cell ? (
                        <>
                          <span className="font-semibold">{cell.value}</span>
                          {cell.change && cell.change !== 'no change' && <span className="block text-ink-2">{cell.change} against the baseline{cell.tone && cell.tone !== 'same' ? `, ${cell.tone}` : ''}</span>}
                        </>
                      ) : (
                        '…'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[14px] text-ink-2">Each change is from the baseline, with its sign and units; a share&apos;s change is in percentage points.</p>
      </section>

      <section aria-labelledby="cb-each" className="flex flex-col gap-3 text-[15px]">
        <h2 id="cb-each" className="display text-[18px] font-semibold">
          Each scenario
        </h2>
        {cols.map((c, i) => {
          const run = sc.runs[c.scenario.id];
          const p = c.scenario.power;
          return (
            <div key={c.scenario.id} className="flex flex-col gap-0.5">
              <h3 className="font-semibold">
                {i === 0 ? 'Baseline' : `Scenario ${i + 1}`}: {c.scenario.label}
              </h3>
              <p>
                {c.siteName} ({coordinates(c)}
                {c.site.approximate ? ', the centre of a region drawn on NASA’s map, about ±5 km' : ''}). Landing {startWords(c.scenario.startUtc)}
                {c.scenario.timing === 'site-best' ? ', the site’s own best time in its period' : ''}; the stay ends {startWords(isoAt(c.scenario.startUtc, c.scenario.days * 24))}.
              </p>
              <p>
                {presetOf(p)?.label.split(':')[0] ?? 'Custom lander'}: {landerLine(p)}, battery {Math.round(p.initialSocFraction * 100)}&nbsp;% full at landing. Earth counts as in view {c.scenario.minEarthElDeg > 0 ? `from ${c.scenario.minEarthElDeg}° above the hills` : 'once its centre clears the hills'}.
              </p>
              <p>Skyline: {skylineWords(run?.mask, c.scenario.mastM)}.</p>
              {c.outcome && (
                <p>
                  {c.outcome.answer.title}. {c.outcome.answer.sentences.join(' ')}
                </p>
              )}
              {run?.status === 'error' && <p className="text-bad">{run.error}</p>}
            </div>
          );
        })}
      </section>

      <section aria-labelledby="cb-assume" className="flex flex-col gap-1 text-[15px]">
        <h2 id="cb-assume" className="display text-[18px] font-semibold">
          What the figures assume, and what they do not show
        </h2>
        <ul className="list-disc pl-5">
          {ASSUMPTIONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
          <li>Errors: directions under 0.01°, the hills 0.05 to 0.15°, times within 15 to 60 minutes near the pole.</li>
        </ul>
      </section>

      <section aria-labelledby="cb-data" className="flex flex-col gap-1 text-[15px]">
        <h2 id="cb-data" className="display text-[18px] font-semibold">
          Data and versions
        </h2>
        <ul className="list-disc pl-5">
          <li>NASA LRO LOLA polar elevation models (LDEM 20 m, 80 m and 240 m), PDS Geosciences Node.</li>
          <li>JPL DE440 planetary ephemeris and NAIF SPICE kernels; JPL Horizons for the cross-checks.</li>
          <li>
            {APP.name} {APP.version}; {[versions.ephemeris, versions.sites, versions.terrain].filter(Boolean).join('; ') || 'data versions not read'}.
          </li>
          <li>
            The same comparison opens again at <span className="break-all">{`${origin}${back}`}</span>
          </li>
        </ul>
      </section>
      <footer className="text-[14px] text-ink-2">Generated {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by Earthrise (NASA Space Apps 2026, team Astroy/Ed).</footer>
    </main>
  );
}
