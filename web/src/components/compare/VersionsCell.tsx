'use client';
import type { Column } from '@/lib/viz/compare';
import { paramsOf } from '@/lib/scenario/scenario';
import type { ScenarioRun } from '@/lib/store/scenarios';
import type { Requirements } from '@/lib/plan/requirements';
import { useTerrainVersions, type VersionsDeps, type VersionsState } from '@/lib/ensemble/useTerrainVersions';
import { spanShort } from '@/lib/viz/format';

/** A scenario's versions in a table cell: how many keep its answer, and the range of its time with power. */
export function cellWords(state: VersionsState, days: number): { held: string; power: string | null } | null {
  if (state.status === 'working') return { held: 'working out…', power: null };
  if (state.status === 'error') return { held: 'cannot be worked out', power: null };
  if (state.status === 'none') return state.reason === null ? null : { held: 'none here', power: null };
  const r = state.result.summary;
  const held = r.basis === 'requirements' ? `${r.held} of ${r.versions} meet your requirements` : `${r.held} of ${r.versions} keep its verdict`;
  const hours = days * 24;
  const f = (h: number) => (h >= hours ? `all ${days} days` : spanShort(h));
  const [lo, hi] = r.poweredH;
  return { held, power: `power ${lo === hi ? f(lo) : `${f(lo)} to ${f(hi)}`}` };
}

/** One scenario's terrain versions, worked out in the versions' worker from its own figures and settings. */
export function VersionsCell({ col, run, requirements, deps }: { col: Column; run: ScenarioRun | undefined; requirements: Requirements; deps?: VersionsDeps }) {
  const series = run?.status === 'ready' ? (run.result?.series ?? null) : null;
  const state = useTerrainVersions({ site: run?.site ?? null, series, hours: series?.hours ?? 0, params: paramsOf(col.scenario), requirements, mastM: run?.result?.mastM ?? col.scenario.mastM }, deps);
  const words = series ? cellWords(state, col.scenario.days) : null;
  if (!words) return null;
  return (
    <>
      <span className={`block ${state.status === 'ready' ? 'font-medium text-ink' : 'text-ink-2'}`}>{words.held}</span>
      {words.power && <span className="block text-ink-2">{words.power}</span>}
    </>
  );
}
