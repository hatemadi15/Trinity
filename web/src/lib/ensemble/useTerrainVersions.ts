'use client';
import { useEffect, useRef, useState } from 'react';
import { dataBase, type Site } from '../data/loaders';
import type { Series } from '../engine/metrics';
import { midSentence, type Holds, type Requirements } from '../plan/requirements';
import type { PlannerParams } from '../store/explore';
import { versionsRunner, type VersionsRunner } from './client';
import type { VersionsResult } from './figures';
import { loadVersions, type SiteVersions } from './versions';

/** The mast height the versions are traced from: as the featured skylines, 2 m. */
export const VERSIONS_MAST_M = 2;

export type VersionsState =
  /** No versions here: `reason` says why in a sentence, or is null where nothing should be said (a flat horizon far from the pole). */
  | { status: 'none'; reason: string | null }
  | { status: 'working' }
  | { status: 'ready'; result: VersionsResult; ms: number }
  | { status: 'error'; message: string };

/**
 * Whether a site has terrain versions for a skyline seen from `mastM`: null when it has, else why not in a sentence, or
 * an empty string where nothing needs saying (a site outside the polar grids, whose horizon is taken as flat).
 */
export function versionsProblem(site: Pick<Site, 'polar' | 'category'>, mastM: number): string | null {
  if (!site.polar) return '';
  if (site.category === 'custom') return 'Terrain versions are drawn for the polar catalogue sites; a point picked on the map has none.';
  if (mastM !== VERSIONS_MAST_M) return `Terrain versions are traced from a ${VERSIONS_MAST_M} m mast; with the mast at ${mastM} m they would not match the figures shown.`;
  return null;
}

export interface VersionsAsk {
  site: Site | null;
  /** The hours over the app's own skyline: the period, or with `byHour` the store's longer scan. */
  series: Series | null;
  hours: number;
  params: PlannerParams;
  requirements: Requirements;
  /** The height the skyline shown is seen from (m). */
  mastM: number;
  byHour?: boolean;
}

export interface VersionsDeps {
  load?: (siteId: string) => Promise<SiteVersions>;
  runner?: VersionsRunner;
}

/**
 * A landing and period under every terrain version of the site, worked out in the versions' worker once the site's
 * versions have loaded: waiting while they load and run, then the result; nothing for a site without versions.
 */
export function useTerrainVersions(ask: VersionsAsk, deps: VersionsDeps = {}): VersionsState {
  const { site, params, requirements, mastM, byHour = false, hours } = ask;
  const [state, setState] = useState<VersionsState>({ status: 'none', reason: '' });
  // The settings by value, so a caller that builds them anew on every render does not start the work again.
  const key = JSON.stringify([site?.id, site?.polar, site?.category, hours, params.power, params.minEarthElDeg, requirements, mastM, byHour]);
  // The latest ask and helpers, for the work below to read when its key changes (effects run in order: this one first).
  const latest = useRef({ ask, deps });
  useEffect(() => {
    latest.current = { ask, deps };
  });
  useEffect(() => {
    const { ask: a, deps: d } = latest.current;
    const { site, series, hours, params, requirements, mastM, byHour = false } = a;
    const { load, runner } = d;
    const power = params.power;
    const minEl = params.minEarthElDeg;
    if (!site || !series) return;
    const problem = versionsProblem(site, mastM);
    if (problem !== null) {
      setState({ status: 'none', reason: problem || null });
      return;
    }
    let live = true;
    setState({ status: 'working' });
    (load ?? ((id: string) => loadVersions(dataBase(), id)))(site.id)
      .then((v) => (runner ?? versionsRunner()).run({ series, hours, masks: v.masks, power, minEarthElDeg: minEl, requirements, byHour }))
      .then(({ result, ms }) => {
        if (live) setState({ status: 'ready', result, ms });
      })
      .catch((err: unknown) => {
        if (!live) return;
        // A site the pipeline drew no versions for answers 404: said plainly, not as a fault.
        const missing = err instanceof Error && /HTTP 404/.test(err.message);
        setState(missing ? { status: 'none', reason: 'No terrain versions were drawn for this site.' } : { status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      live = false;
    };
  }, [key, ask.series]);
  return state;
}

/**
 * With the requirement on the terrain versions set, in how many versions each landing time of the period holds, worked
 * out as Explore works it out, so the brief and the view from the site rank their better date as Explore does; null
 * while that requirement is not set and until the versions are worked out. Nothing runs while it is not set. With the
 * state of the work, so the brief can say why the requirement is not checked (holdUncheckedWords).
 */
export function useHoldCheck(ask: Omit<VersionsAsk, 'byHour'>, deps?: VersionsDeps): { holds: (Holds | null)[] | null; state: VersionsState } {
  const asked = (ask.requirements.minHoldPct ?? null) !== null;
  const state = useTerrainVersions({ ...ask, site: asked ? ask.site : null, byHour: true }, deps);
  return { holds: asked && state.status === 'ready' ? state.result.holdsByHour : null, state };
}

/** The holds alone, for the view from the site (useHoldCheck). */
export function useHoldsByHour(ask: Omit<VersionsAsk, 'byHour'>, deps?: VersionsDeps): (Holds | null)[] | null {
  return useHoldCheck(ask, deps).holds;
}

/**
 * The requirement on the terrain versions where it is set but not checked, after its label in a list of the
 * requirements: why not, with the reason the note under it in Explore gives (holdNoteFor), or that the work is under way.
 */
export function holdUncheckedWords(state: VersionsState): string {
  if (state.status === 'working') return 'checking the terrain versions…';
  if (state.status === 'error') return `not checked here (the versions could not be worked out: ${state.message})`;
  if (state.status === 'none' && state.reason) return `not checked here (${midSentence(state.reason).replace(/\.$/, '')})`;
  return 'not checked here';
}

/**
 * The sentence under the requirement on the terrain versions: what it is checked for and how far the work has got;
 * undefined where the site has no versions to speak of (a flat horizon), so the box is not offered.
 */
export function holdNoteFor(state: VersionsState, asked: boolean): string | undefined {
  if (state.status === 'none') return state.reason === null || state.reason === '' ? undefined : `${state.reason} The requirement is not checked here.`;
  const scope = 'It is checked for this site’s landing times in the period, here, on the brief and in the view from the site; places nearby, the 12-month search and Compare do not check it.';
  if (state.status === 'error') return `${scope} The versions could not be worked out (${state.message}).`;
  if (state.status === 'working' && asked) return `${scope} Checking the terrain versions…`;
  if (state.status === 'ready' && asked) return `${scope} Each landing time is checked against ${state.result.summary.versions} versions.`;
  return scope;
}
