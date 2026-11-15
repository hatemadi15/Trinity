'use client';
import { useId, useState } from 'react';
import { Fold } from '../Fold';
import { MiniStrip } from './MiniStrip';
import { VersionsCell } from './VersionsCell';
import type { VersionsDeps } from '@/lib/ensemble/useTerrainVersions';
import { NO_REQUIREMENTS, type Requirements } from '@/lib/plan/requirements';
import type { ScenarioRun } from '@/lib/store/scenarios';
import { figureRows, landingShort, settingRows, type Cell, type Column, type Tone } from '@/lib/viz/compare';
import { landingTitle } from './ScenarioCard';
import { isoAt, spanShort } from '@/lib/viz/format';

const TONE: Record<Tone, string> = {
  better: 'text-good',
  worse: 'text-bad',
  same: 'text-ink-2',
};
/** What the terrain versions' row means, for the table's key. */
export const VERSIONS_MEANS =
  'The same landing over 32 versions of the ground drawn round NASA’s adjusted south-pole map (PGDA product 90) with errors as large as two generations of its maps differ by: how many still meet your requirements, or with none set give the same verdict, and the range of time with power. Compare does not check the requirement on a share of versions; this count is the share to read it against. Only the polar catalogue sites seen from a 2 m mast have versions; a share of versions is not the chance that the landing works.';
const HEAD = 'sticky left-0 z-[1] bg-surface border-b border-line py-2.5 pr-4 text-left align-top text-[15px] font-semibold text-ink-2 max-sm:min-w-[118px]';
const CELL = 'border-b border-line py-2.5 pr-4 align-top';

/**
 * A figure and, under it, its change from the baseline in the colour of better or worse, the word itself for a screen
 * reader; in the row of your requirements, each one met or failed with its value and margin, shown once the row opens.
 */
function Figure({ value, change, tone, checks, best, checksId, checksOpen }: Cell & { checksId?: string; checksOpen?: boolean }) {
  return (
    <>
      <span className="block font-medium tabular-nums text-ink">
        {value}
        {best && <span className="ml-2 inline-block rounded-full border border-good px-2 text-[15px] font-semibold text-good">Best</span>}
      </span>
      {change && (
        <span className={`block text-[15px] tabular-nums ${tone ? TONE[tone] : 'text-ink-2'}`}>
          {change}
          {tone && tone !== 'same' && <span className="sr-only">, {tone}</span>}
        </span>
      )}
      {checks && checks.length > 0 && (
        <ul id={checksId} hidden={!checksOpen} className="mt-1 flex flex-col gap-0.5 text-[15px]">
          {checks.map((c) => (
            <li key={c.words}>
              <span className={`font-medium ${c.met ? 'text-good' : 'text-bad'}`}>{c.met ? 'Meets' : 'Fails'}</span> {c.words}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The name of a row, as the switch that opens what each scenario's cell keeps one tap away: in the row of your
 * requirements, the count of those failed shows first and the checks open; the terrain versions' row opens whole. So
 * the full comparison keeps to its words.
 */
function ChecksSwitch({ name, open, controls, onToggle }: { name: string; open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} className="inline-flex min-h-10 items-center gap-1.5 text-left font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink">
      {name}
      <span aria-hidden="true" className="no-underline">
        {open ? '▴' : '▾'}
      </span>
    </button>
  );
}

/** The settings a column leaves out when it repeats the baseline's. */
const SAME_AS_BASELINE = ['lander', 'mast', 'clearance'];

/**
 * The scenarios side by side: one column each, the baseline first, the settings and then the figures, each figure with
 * its change from the baseline. A wide table scrolls inside its own box, the row names staying in view.
 */
export function ScenarioTable({
  cols,
  runs,
  onUseBest,
  requirements = NO_REQUIREMENTS,
  versions,
}: {
  cols: Column[];
  runs: Record<string, ScenarioRun>;
  onUseBest: (id: string) => void;
  /** The requirements the terrain versions' row counts against; with none, a version keeps the scenario's verdict or not. */
  requirements?: Requirements;
  /** Injected in tests; by default each site's data/ensemble file and the versions' worker. */
  versions?: VersionsDeps;
}) {
  const settings = settingRows(cols);
  const figures = figureRows(cols);
  const id = useId();
  const [checksOpen, setChecksOpen] = useState(false);
  const checksId = (i: number) => `${id}-checks-${i}`;
  // The terrain versions' row shows its name only: each scenario's versions are one tap on it away.
  const [versionsOpen, setVersionsOpen] = useState(false);
  const versionsId = (i: number) => `${id}-versions-${i}`;
  // Each scenario's own best landing, with the way to add it: one tap on the row's name away.
  const [bestOpen, setBestOpen] = useState(false);
  const bestId = (i: number) => `${id}-best-${i}`;
  const pending = (i: number) => {
    const r = runs[cols[i].scenario.id];
    return r?.status === 'error' ? 'cannot be worked out' : 'working out…';
  };
  return (
    <>
      <div role="region" aria-label="The landings side by side" tabIndex={0} className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-sun-ink">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">Each landing’s settings and figures, with the change from your landing under each figure and the best of each row marked.</caption>
          <thead>
            <tr>
              <th scope="col" className={HEAD}>
                Landing
              </th>
              {cols.map((c, i) => (
                <th key={c.scenario.id} scope="col" className="min-w-[150px] border-b-2 border-ink py-2.5 pr-4 align-top">
                  <span className="block text-[15px] font-normal text-ink-2">{landingTitle(i)}</span>
                  <span className="block font-semibold text-ink">{c.scenario.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.map((row) => (
              <tr key={row.id}>
                <th scope="row" className={HEAD}>
                  {row.name}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={cols[i].scenario.id} className={`${CELL} text-[15px]`}>
                    {/* A lander, mast or Earth height the baseline already states reads "same": said once, in the baseline's column. */}
                    {i > 0 && SAME_AS_BASELINE.includes(row.id) && cell.value === row.cells[0].value ? (
                      <span className="block text-ink-2" title={cell.value}>
                        same
                      </span>
                    ) : (
                      <span className="block text-ink">{cell.value}</span>
                    )}
                    {/* What kind of point a site is, said once: a column at the baseline's site does not repeat it. */}
                    {cell.kind && !(row.id === 'site' && i > 0 && cell.value === row.cells[0].value) && <span className="block text-ink-2">{cell.kind}</span>}
                    {cell.change && <span className="block text-ink-2">{cell.change}</span>}
                    {row.id === 'landing' && cols[i].scenario.timing === 'site-best' && <span className="block text-ink-2">the site’s own best time</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className={HEAD}>
                Sun and Earth
              </th>
              {cols.map((c) => {
                const series = runs[c.scenario.id]?.result?.series;
                return (
                  <td key={c.scenario.id} className={CELL}>
                    {series && c.outcome && <MiniStrip series={series} name={c.siteName} period={`the ${c.scenario.days} days from ${landingShort(c.scenario.startUtc)}`} />}
                  </td>
                );
              })}
            </tr>
            {figures.map((row) => (
              <tr key={row.id}>
                <th scope="row" className={HEAD}>
                  {row.id === 'requirements' ? (
                    <ChecksSwitch name={row.name} open={checksOpen} controls={row.cells.flatMap((c, i) => (c?.checks?.length ? [checksId(i)] : [])).join(' ')} onToggle={() => setChecksOpen((v) => !v)} />
                  ) : (
                    row.name
                  )}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={cols[i].scenario.id} className={CELL}>
                    {cell ? <Figure {...cell} checksId={checksId(i)} checksOpen={checksOpen} /> : <span className="text-[15px] text-ink-2">{pending(i)}</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className={HEAD}>
                <ChecksSwitch name="Terrain versions" open={versionsOpen} controls={cols.map((_, i) => versionsId(i)).join(' ')} onToggle={() => setVersionsOpen((v) => !v)} />
              </th>
              {cols.map((c, i) => (
                <td key={c.scenario.id} className={`${CELL} text-[15px]`}>
                  <div id={versionsId(i)} hidden={!versionsOpen}>
                    <VersionsCell col={c} run={runs[c.scenario.id]} requirements={requirements} deps={versions} />
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={HEAD}>
                <ChecksSwitch name="Best landing time at this place" open={bestOpen} controls={cols.map((_, i) => bestId(i)).join(' ')} onToggle={() => setBestOpen((v) => !v)} />
              </th>
              {cols.map((c, k) => {
                const best = c.outcome?.best;
                const here = best && best.hour === 0;
                return (
                  <td key={c.scenario.id} className={`${CELL} text-[15px]`}>
                    <div id={bestId(k)} hidden={!bestOpen}>
                    {!c.outcome ? null : !best ? (
                      <span className="text-ink-2">no sunlit hour</span>
                    ) : here ? (
                      <span className="text-ink-2">this landing time</span>
                    ) : (
                      <>
                        <span className="block text-ink">{landingShort(isoAt(c.scenario.startUtc, best.hour))}</span>
                        <span className="block text-ink-2">power {best.poweredHours >= c.outcome.hours ? `all ${c.scenario.days} days` : spanShort(best.poweredHours)}</span>
                        <button
                          type="button"
                          onClick={() => onUseBest(c.scenario.id)}
                          aria-label={`Add “${c.scenario.label}” at this landing time`}
                          className="mt-1 min-h-10 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                        >
                          Add it
                        </button>
                      </>
                    )}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <Fold label="What each figure means" className="mt-2">
        <dl className="grid max-w-[60em] gap-x-4 gap-y-1.5 text-[15px] sm:grid-cols-[max-content_1fr]">
          {figures.map((row) => (
            <div key={row.id} className="contents">
              <dt className="font-semibold text-ink">{row.name}</dt>
              <dd className="text-ink-2">{row.means}</dd>
            </div>
          ))}
          <div className="contents">
            <dt className="font-semibold text-ink">Terrain versions</dt>
            <dd className="text-ink-2">{VERSIONS_MEANS}</dd>
          </div>
        </dl>
      </Fold>
    </>
  );
}
