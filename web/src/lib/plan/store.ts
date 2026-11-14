import { createStore, type StoreApi } from 'zustand';
import { siteLabel, type Site } from '../data/loaders';
import { comparisonHref } from '../scenario/codec';
import { createMaskSource, type MaskSource } from '../scenario/masks';
import type { Scenario } from '../scenario/scenario';
import { scenarioStore, type ScenarioState } from '../store/scenarios';
import { exploreHref } from '../links';
import { DAYS_RANGE, clampTo } from '../planner-ranges';
import { FEATURED_MAST_M, browserLoaders, exploreStore, type ExploreState, type WindowDays } from '../store/explore';
import { dateTimeUtc } from '../viz/format';
import { groundPatch, numbersOf, validateSpecPatch } from './fields';
import { answerOf, planStep, powerOf, spokenSummary, type PlanAnswer, type SearchStats, type SiteInput } from './search';
import { PlanClient, type PlanRun, type PlanRunner } from './search-client';
import { CATEGORY_NAMES, DEFAULT_SPEC, applyPatch, hearSpec, mergeHeard, settle, spokenReadBack, tidySpec, whereSites, type MissionSpec, type SpecField, type SpecPatch, type Sources } from './spec';

export type PlanStatus = 'empty' | 'heard' | 'searching' | 'done' | 'cancelled' | 'error';

export interface PlanState {
  spec: MissionSpec;
  /** Where each field came from; a field absent here is the default. */
  from: Sources;
  /** The words the specification was last heard from. */
  text: string;
  /** Words the parser could not use, for the person (and the assistant) to look at. */
  leftover: string[];
  /** What was changed so the specification can be searched, and what cannot be searched as it stands. */
  notes: string[];
  problems: string[];
  status: PlanStatus;
  progress: { done: number; total: number; site: string } | null;
  answer: PlanAnswer | null;
  /** The specification the answer is for, and the search's scope. */
  searched: MissionSpec | null;
  stats: (SearchStats & { stepH: number; coarsened: boolean }) | null;
  /** The skylines searched, by site id, for the answer's limits. */
  inputs: Record<string, SiteInput>;
  /** Sites left out of the last search because their skyline could not be loaded. */
  skipped: string[];
  error: string | null;
  /** What the assistant's reading added, and what it could not. */
  assistant: { state: 'idle' | 'asking' | 'done' | 'failed'; fields: SpecField[]; dropped: string[] };
  /** Hears a specification in plain words, merged into the one there; returns the read-back. */
  hear: (text: string) => string;
  /** A field changed on the page. */
  edit: (patch: SpecPatch) => void;
  /** Fields the model filled from the same words: only those not heard, only numbers found in the words. */
  takeAssistant: (raw: unknown, text: string) => { fields: SpecField[]; dropped: string[] };
  setAssistant: (state: PlanState['assistant']['state']) => void;
  search: () => Promise<PlanAnswer | null>;
  cancel: () => void;
  /** Sets Explore to a shown result's site, landing time, stay and lander; returns what Luna says. */
  land: (index: number, navigate: (href: string) => void) => Promise<string>;
  /** Opens Compare with the shown results; returns what Luna says. */
  compareTop: (navigate: (href: string) => void) => Promise<string>;
  /** The read-back of the specification as it stands. */
  readBack: () => string;
  /** The summary of the last answer for Luna, or null. */
  summary: () => string | null;
  clear: () => void;
}

export interface PlanDeps {
  explore: StoreApi<ExploreState>;
  /** Skylines by site and mast height, with what the terrain behind each holds (the integrity part's source). */
  masks: MaskSource;
  /** The comparison "compare these" fills (the scenarios part's store); the app's own by default. */
  scenarios?: StoreApi<ScenarioState>;
  client: () => PlanRunner;
}

/** Skylines traced in the browser for a mast other than the precomputed one, at most this many in a search: each takes seconds. */
export const MAX_TRACED = 8;

/** Explore's period for a stay: its whole days, within the 2 to 90 days a period may last. */
export function exploreDays(stayH: number): WindowDays {
  return clampTo(DAYS_RANGE, Math.ceil(stayH / 24));
}

const EMPTY = { spec: DEFAULT_SPEC, from: {}, text: '', leftover: [], notes: [], problems: [], status: 'empty' as PlanStatus, progress: null, answer: null, searched: null, stats: null, inputs: {}, skipped: [] as string[], error: null };

/**
 * The planner (spec 23): the mission's specification as heard and edited, the search (off the main thread, with
 * progress and a cancel), the answer, and the two ways on: Explore on the chosen landing, Compare with the best few.
 * Outside any page, as Explore's store is, so Luna can fill it before she opens the page.
 */
export function createPlanStore(deps: PlanDeps): StoreApi<PlanState> {
  let runner: PlanRunner | null = null;
  let current: PlanRun | null = null;
  let seq = 0;
  const masks = new Map<string, Promise<SiteInput>>();
  const sites = () => deps.explore.getState().sites;
  const categories = () => new Set([...Object.keys(CATEGORY_NAMES), ...sites().map((s) => s.category)]);

  /**
   * A site's skyline from the mast asked for, through the integrity part's source: the precomputed file at its own
   * height, a trace in the browser's worker for any other, a flat horizon outside the polar grids. A trace that cannot
   * be had falls back to the precomputed height, which the answer then says.
   */
  async function inputFor(site: Site, mastM: number): Promise<SiteInput> {
    const at = async (m: number) => {
      const { mask, meta } = await deps.masks.get(site, m);
      return { site, mask, skyline: { source: meta.source, mastM: meta.mastM ?? m, failedTiles: meta.failedTiles, terrain: meta.terrain } };
    };
    if (mastM === FEATURED_MAST_M || !site.polar) return at(mastM);
    return at(mastM).catch(() => at(FEATURED_MAST_M));
  }

  return createStore<PlanState>((set, get) => ({
    ...EMPTY,
    assistant: { state: 'idle', fields: [], dropped: [] },

    hear(text) {
      const year = Number(get().spec.fromUtc.slice(0, 4));
      const heard = hearSpec(text, sites(), year);
      const m = mergeHeard(get().spec, get().from, heard);
      set({ spec: m.spec, from: m.from, text, leftover: heard.leftover, notes: m.notes, problems: m.problems, status: get().status === 'searching' ? 'searching' : 'heard', assistant: { state: 'idle', fields: [], dropped: [] } });
      return get().readBack();
    },

    edit(patch) {
      const a = applyPatch(get().spec, get().from, patch, 'edited');
      const s = settle(a.spec, a.from);
      set({ spec: s.spec, from: a.from, notes: s.notes, problems: s.problems, status: get().status === 'empty' ? 'heard' : get().status });
    },

    takeAssistant(raw, text) {
      const ids = new Set(sites().map((s) => s.id));
      const { patch, dropped } = validateSpecPatch(raw, ids, categories());
      const free: SpecPatch = {};
      for (const [k, v] of Object.entries(patch) as [SpecField, SpecPatch[SpecField]][]) if (!get().from[k]) (free as Record<string, unknown>)[k] = v;
      const grounded = groundPatch(free, numbersOf(tidySpec(text)));
      const fields = Object.keys(grounded.patch) as SpecField[];
      const all = [...dropped, ...grounded.dropped];
      if (fields.length > 0) {
        const a = applyPatch(get().spec, get().from, grounded.patch, 'assistant');
        const s = settle(a.spec, a.from);
        set({ spec: s.spec, from: a.from, notes: s.notes, problems: s.problems, status: get().status === 'empty' ? 'heard' : get().status });
      }
      set({ assistant: { state: 'done', fields, dropped: all } });
      return { fields, dropped: all };
    },

    setAssistant(state) {
      set({ assistant: { ...get().assistant, state } });
    },

    async search() {
      const { spec, problems } = get();
      if (problems.length > 0) {
        set({ status: 'error', error: problems.join(' ') });
        return null;
      }
      current?.cancel();
      const ex = deps.explore.getState();
      if (!ex.eph) await ex.init();
      const eph = deps.explore.getState().eph;
      if (!eph) {
        set({ status: 'error', error: 'The Sun and Earth table could not be loaded.' });
        return null;
      }
      const list = whereSites(spec.where, sites());
      if (list.length === 0) {
        set({ status: 'error', error: 'No catalogue site is in the place asked for: widen where to look.' });
        return null;
      }
      const id = ++seq;
      set({ status: 'searching', progress: { done: 0, total: list.length, site: '' }, error: null });
      // A mast other than the precomputed one is traced site by site, bounded; beyond the bound the precomputed height is used, and said.
      const traced = list.filter((x) => x.polar).length <= MAX_TRACED;
      const mastM = spec.lander.mastM === FEATURED_MAST_M || traced ? spec.lander.mastM : FEATURED_MAST_M;
      const settled = await Promise.allSettled(list.map((x) => inputFor(x, mastM)));
      const inputs = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const skipped = list.filter((_, i) => settled[i].status === 'rejected').map(siteLabel);
      if (id !== seq) return null;
      const step = planStep(spec, inputs.length);
      runner ??= deps.client();
      const run = runner.run(spec, inputs, step.stepH, eph, (done, total, site) => {
        if (id === seq) set({ progress: { done, total, site } });
      });
      current = run;
      let out: Awaited<PlanRun['done']>;
      try {
        out = await run.done;
      } catch (err) {
        if (id === seq) set({ status: 'error', error: err instanceof Error ? err.message : String(err), progress: null });
        return null;
      }
      if (id !== seq) return null;
      current = null;
      if (!out) {
        set({ status: 'cancelled', progress: null });
        return null;
      }
      const answer = answerOf(out.findings, spec);
      const landingTimes = out.findings.reduce((n, f) => n + f.tried, 0);
      set({
        status: 'done',
        progress: null,
        answer,
        searched: spec,
        inputs: Object.fromEntries(inputs.map((x) => [x.site.id, x])),
        skipped,
        stats: { sites: out.findings.length, landingTimes, ms: out.ms, stepH: step.stepH, coarsened: step.coarsened },
      });
      return answer;
    },

    cancel() {
      if (get().status !== 'searching') return;
      current?.cancel();
      // Answered at once: the worker's own stop arrives between two sites.
      seq++;
      current = null;
      set({ status: 'cancelled', progress: null });
    },

    async land(index, navigate) {
      const { answer, searched } = get();
      const f = answer?.shown[index];
      if (!f?.best || !searched) return 'There is no landing to plan yet: say search first.';
      const ex = deps.explore.getState();
      const days = exploreDays(searched.stayH);
      ex.setParams({ power: { ...ex.params.power, ...powerOf(searched), efficiency: ex.params.power.efficiency }, mastM: searched.lander.mastM, minEarthElDeg: searched.lander.earthClearanceDeg });
      await deps.explore.getState().selectSite(f.site.id);
      deps.explore.getState().setWindow(f.best.item.utc, days);
      navigate(exploreHref(f.site.id, f.best.item.utc, days));
      return `Explore is on ${siteLabel(f.site)}, landing ${dateTimeUtc(f.best.item.utc, 0)}, for ${days} days with this lander.`;
    },

    async compareTop(navigate) {
      const { answer, searched } = get();
      const shown = answer?.shown.filter((f) => f.best) ?? [];
      if (!shown.length || !searched) return 'There is nothing to compare yet: say search first.';
      const ex = deps.explore.getState();
      const days = exploreDays(searched.stayH);
      // Each result as a scenario of its own: its site at its own best landing time, the same lander, mast and stay.
      const list: Scenario[] = shown.slice(0, 4).map((f, i) => ({
        id: `plan${i + 1}`,
        label: `${i + 1}. ${siteLabel(f.site)}`,
        siteId: f.site.id,
        startUtc: f.best!.item.utc,
        days,
        power: { ...ex.params.power, ...powerOf(searched), efficiency: ex.params.power.efficiency },
        mastM: searched.lander.mastM,
        minEarthElDeg: searched.lander.earthClearanceDeg,
        timing: 'site-best',
      }));
      (deps.scenarios ?? scenarioStore).getState().load(list);
      navigate(comparisonHref(list));
      return `Compare shows the ${list.length === 1 ? 'best site' : `best ${list.length} sites`}, each at its own best landing time, for ${days} days with this lander.`;
    },

    readBack() {
      const { spec, from, notes, problems, leftover } = get();
      const extra = [...notes, ...problems, ...(leftover.length ? [`I did not use: ${leftover.map((l) => `"${l}"`).join(', ')}.`] : [])];
      return [spokenReadBack(spec, from, sites()), ...extra].join(' ');
    },

    summary() {
      const { answer, searched, stats } = get();
      return answer && searched && stats ? spokenSummary(answer, searched, stats) : null;
    },

    clear() {
      current?.cancel();
      seq++;
      current = null;
      set({ ...EMPTY, assistant: { state: 'idle', fields: [], dropped: [] } });
    },
  }));
}

export const planStore = createPlanStore({ explore: exploreStore, masks: createMaskSource(browserLoaders), client: () => new PlanClient() });
