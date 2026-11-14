import { createStore, type StoreApi } from 'zustand';
import { siteLabel, type Site } from '../data/loaders';
import { SCENARIO_MAX } from '../scenario/codec';
import { createMaskSource, type MaskLoaders, type MaskSource } from '../scenario/masks';
import { bestNearby, nearbyCandidates, NEARBY_KM } from '../scenario/nearby';
import { outcomeOf, type Outcome } from '../scenario/outcome';
import { periodProblem } from '../scenario/period';
import { baselineFrom, duplicateOf, paramsOf, scenarioKey, slipOf, type ExploreSettings, type Scenario } from '../scenario/scenario';
import { isoAt } from '../viz/format';
import { checkPick } from '../viz/pick';
import { browserLoaders, exploreStore, recompute, type ExploreState, type MaskMeta, type SiteResult } from './explore';
import { customPoint } from './query';

/** One scenario worked out: its site, the result, the figures, the skyline it used; or why it could not be. */
export interface ScenarioRun {
  /** The settings it was worked out for (`scenarioKey`): a run for older settings is replaced. */
  key: string;
  status: 'busy' | 'ready' | 'error';
  site: Site | null;
  result: SiteResult | null;
  outcome: Outcome | null;
  mask: MaskMeta | null;
  error: string | null;
}

export interface ScenarioState {
  /** The comparison, the baseline first. */
  scenarios: Scenario[];
  runs: Record<string, ScenarioRun>;
  /** What the last action could not do, in a sentence: a full comparison, no nearby site that does better, a slip stopped at the table's end. */
  note: string | null;
  /** What could not be read from a link or a file. */
  problem: string | null;
  /** The scenario a nearby search is running for. */
  searching: string | null;
  /** A new comparison with Explore's settings as its baseline; returns the baseline's id (null before Explore has a site). */
  startFrom: (e: Omit<ExploreSettings, 'siteId'> & { siteId: string | null }) => string | null;
  /** A copy of a scenario to change, after the others; null when the comparison is full. */
  duplicate: (id: string) => string | null;
  /** A copy with the landing moved by `hours` (later when positive); null when the comparison is full. */
  slip: (id: string, hours: number) => string | null;
  update: (id: string, patch: Partial<Omit<Scenario, 'id'>>) => void;
  /** Removes a scenario; the baseline stays while others are compared with it. */
  remove: (id: string) => void;
  /** Makes a scenario the baseline, the one the others are compared with. */
  makeBaseline: (id: string) => void;
  /** The best catalogue site near a scenario's for its own settings, added as a new scenario when it does better; null otherwise. */
  findNearby: (id: string) => Promise<string | null>;
  /** A copy landing at the site's own best time in the scenario's period, marked as such; null when there is none or no room. */
  useSiteBest: (id: string) => string | null;
  /** Replaces the comparison with scenarios read from a link or a file. */
  load: (list: Scenario[], problem?: string | null) => void;
  clear: () => void;
  setNote: (note: string | null) => void;
  /** Takes the sites already on Explore's compare list that have no scenario yet (once the page opens). */
  takeList: () => void;
  /** Resolves once every scenario's figures are worked out. */
  settle: () => Promise<void>;
}

const FULL = 'Four scenarios is the most a comparison holds: remove one to add another.';

/** The site a scenario names: a catalogue site, or a clicked point rebuilt from its id as Explore builds it. */
export function siteFor(siteId: string, sites: Site[]): Site | null {
  const known = sites.find((s) => s.id === siteId);
  if (known) return known;
  const point = customPoint(siteId);
  const pick = point ? checkPick(point.lat, point.lon) : null;
  if (!pick?.ok) return null;
  return { id: siteId, name: `Custom site ${pick.lat.toFixed(3)}°, ${pick.lon.toFixed(3)}°`, lat: pick.lat, lon: pick.lon, category: 'custom', polar: true, source: 'user' };
}

/**
 * The comparison: a baseline and up to three more scenarios, each worked out with its own site, landing time, length,
 * lander, mast and clearance for Earth, from its own skyline. It reads the catalogue and the Sun and Earth table from
 * Explore's store and never changes Explore's settings. Explore's compare list (the sites its Compare button, the
 * assistant and Luna add) stays the set of sites the comparison holds: a site added there becomes a scenario with
 * Explore's settings, and one taken off there takes its scenarios with it.
 */
export function createScenarioStore(explore: StoreApi<ExploreState>, loaders: MaskLoaders, masks: MaskSource = createMaskSource(loaders)): StoreApi<ScenarioState> {
  let next = 0;
  const newId = () => `s${++next}_${Date.now().toString(36)}`;
  const pending = new Set<Promise<void>>();
  /** Runs under way, by scenario and settings, so asking again joins the run rather than starting another. */
  const inflight = new Map<string, Promise<void>>();
  /** Sites this store is adding to Explore's list itself, so the list's change is not taken as a new request. */
  const pushing = new Set<string>();

  const store = createStore<ScenarioState>((set, get) => {
    /** Appends scenarios when there is room; says so when there is not. */
    function append(made: Scenario[]): boolean {
      if (get().scenarios.length + made.length > SCENARIO_MAX) {
        set({ note: FULL });
        return false;
      }
      set({ scenarios: [...get().scenarios, ...made], note: null });
      changed();
      return true;
    }
    const find = (id: string) => get().scenarios.find((s) => s.id === id);

    return {
      scenarios: [],
      runs: {},
      note: null,
      problem: null,
      searching: null,

      startFrom(e) {
        if (!e.siteId) return null;
        const id = newId();
        set({ scenarios: [baselineFrom({ ...e, siteId: e.siteId }, id)], note: null, problem: null });
        changed();
        return id;
      },

      duplicate(id) {
        const s = find(id);
        if (!s) return null;
        const made = duplicateOf(s, newId());
        return append([made]) ? made.id : null;
      },

      slip(id, hours) {
        const s = find(id);
        if (!s) return null;
        const { note, ...made } = slipOf(s, hours, newId());
        if (!append([made])) return null;
        if (note) set({ note });
        return made.id;
      },

      update(id, patch) {
        set({ scenarios: get().scenarios.map((s) => (s.id === id ? { ...s, ...patch, id } : s)) });
        changed();
      },

      remove(id) {
        const list = get().scenarios;
        if (list[0]?.id === id && list.length > 1) return;
        set({ scenarios: list.filter((s) => s.id !== id), note: null });
        changed();
      },

      makeBaseline(id) {
        const s = find(id);
        if (!s) return;
        set({ scenarios: [s, ...get().scenarios.filter((x) => x.id !== id)] });
        changed();
      },

      async findNearby(id) {
        const s = find(id);
        if (!s) return null;
        if (get().scenarios.length >= SCENARIO_MAX) {
          set({ note: FULL });
          return null;
        }
        set({ searching: id, note: null });
        try {
          await explore.getState().init();
          const { eph, sites } = explore.getState();
          const site = siteFor(s.siteId, sites);
          if (!eph || !site) return null;
          await run(s);
          const own = get().runs[s.id]?.outcome;
          if (!own) return null;
          const tried: { site: Site; km: number; outcome: Outcome }[] = [];
          for (const c of nearbyCandidates(site, sites)) {
            try {
              const { mask } = await masks.get(c.site, s.mastM);
              const r = recompute(eph, c.site, mask, s.startUtc, s.days, paramsOf(s), s.mastM);
              tried.push({ ...c, outcome: outcomeOf(r, s, siteLabel(c.site)) });
            } catch {
              // a skyline that fails to load leaves that site out of the search
            }
          }
          const best = bestNearby(own, tried);
          // The scenario may have changed or gone while the search ran.
          if (find(id) !== s) return null;
          if (!best) {
            set({ note: `No catalogue site within ${NEARBY_KM} km works better than “${s.label}” with its settings.` });
            return null;
          }
          const made: Scenario = { ...s, id: newId(), siteId: best.site.id, label: `Nearby: ${siteLabel(best.site)}`, from: s.id };
          return append([made]) ? made.id : null;
        } finally {
          set({ searching: null });
        }
      },

      useSiteBest(id) {
        const s = find(id);
        const r = get().runs[id];
        const best = r?.outcome?.best;
        if (!s || !r?.site || !best) return null;
        const made: Scenario = { ...s, id: newId(), startUtc: isoAt(s.startUtc, best.hour), label: `${siteLabel(r.site)}’s own best time`, timing: 'site-best', from: s.id };
        return append([made]) ? made.id : null;
      },

      load(list, problem = null) {
        set({ scenarios: list.slice(0, SCENARIO_MAX), problem, note: null });
        changed();
      },

      clear() {
        set({ scenarios: [], note: null, problem: null });
        changed();
      },

      setNote(note) {
        set({ note });
      },

      takeList() {
        for (const id of explore.getState().compareIds) if (!get().scenarios.some((s) => s.siteId === id)) addListed(id);
      },

      async settle() {
        while (pending.size > 0) await Promise.all([...pending]);
      },
    };
  });

  /** A site added to Explore's list elsewhere, as a scenario with Explore's settings named after the site. */
  function addListed(siteId: string): void {
    const e = explore.getState();
    const site = e.sites.find((s) => s.id === siteId);
    if (!site) return;
    const s = store.getState();
    if (s.scenarios.length >= SCENARIO_MAX) {
      store.setState({ note: FULL });
      pushList();
      return;
    }
    store.setState({ scenarios: [...s.scenarios, baselineFrom({ siteId, startUtc: e.startUtc, days: e.days, params: e.params }, newId(), siteLabel(site))] });
    changed();
  }

  // Explore's compare list, changed elsewhere: a new site becomes a scenario, a site taken off takes its scenarios.
  explore.subscribe((now, prev) => {
    if (now.compareIds === prev.compareIds) return;
    for (const id of prev.compareIds) {
      if (now.compareIds.includes(id)) continue;
      const left = store.getState().scenarios.filter((s) => s.siteId !== id);
      if (left.length !== store.getState().scenarios.length) {
        store.setState({ scenarios: left });
        changed();
      }
    }
    for (const id of now.compareIds) {
      if (prev.compareIds.includes(id)) continue;
      if (pushing.delete(id)) continue;
      if (!store.getState().scenarios.some((s) => s.siteId === id)) addListed(id);
    }
  });

  /** Explore's compare list made the comparison's catalogue sites, in order. */
  function pushList(): void {
    const e = explore.getState();
    const want = [...new Set(store.getState().scenarios.map((s) => s.siteId))].filter((id) => e.sites.some((s) => s.id === id));
    for (const id of e.compareIds) if (!want.includes(id)) explore.getState().removeFromCompare(id);
    for (const id of want) {
      if (explore.getState().compareIds.includes(id)) continue;
      pushing.add(id);
      void explore
        .getState()
        .addToCompare(id)
        .finally(() => {
          // Added, or refused: either way the change is no longer on its way.
          if (!explore.getState().compareIds.includes(id)) pushing.delete(id);
        });
    }
  }

  /** After any change to the scenarios: forget the runs of scenarios gone, work out the ones new or changed, keep the list. */
  function changed(): void {
    const { scenarios, runs } = store.getState();
    const ids = new Set(scenarios.map((s) => s.id));
    const kept = Object.fromEntries(Object.entries(runs).filter(([id]) => ids.has(id)));
    if (Object.keys(kept).length !== Object.keys(runs).length) store.setState({ runs: kept });
    for (const s of scenarios) if (store.getState().runs[s.id]?.key !== scenarioKey(s)) void run(s);
    pushList();
  }

  /** Works out one scenario's figures with its own settings and skyline, unless a run for the same settings is under way or done. */
  function run(s: Scenario): Promise<void> {
    const key = scenarioKey(s);
    const had = store.getState().runs[s.id];
    if (had?.key === key && had.status !== 'busy') return Promise.resolve();
    const joined = inflight.get(`${s.id}|${key}`);
    if (joined) return joined;
    const setRun = (r: Omit<ScenarioRun, 'key'>) => {
      // A run for settings since changed, or a scenario since removed, is dropped.
      const now = store.getState().scenarios.find((x) => x.id === s.id);
      if (!now || scenarioKey(now) !== key) return;
      store.setState({ runs: { ...store.getState().runs, [s.id]: { key, ...r } } });
    };
    const p = (async () => {
      const busy = { key, status: 'busy' as const, site: null, result: null, outcome: null, mask: null, error: null };
      store.setState({ runs: { ...store.getState().runs, [s.id]: busy } });
      try {
        await explore.getState().init();
        const { eph, sites } = explore.getState();
        if (!eph) throw new Error('The Sun and Earth table could not be loaded.');
        const site = siteFor(s.siteId, sites);
        if (!site) throw new Error(`The site “${s.siteId}” is not in this catalogue.`);
        const problem = periodProblem(s.startUtc, s.days);
        if (problem) {
          setRun({ status: 'error', site, result: null, outcome: null, mask: null, error: problem });
          return;
        }
        const { mask, meta } = await masks.get(site, s.mastM);
        const result = recompute(eph, site, mask, s.startUtc, s.days, paramsOf(s), s.mastM);
        setRun({ status: 'ready', site, result, outcome: outcomeOf(result, s, siteLabel(site)), mask: meta, error: null });
      } catch (err) {
        setRun({ status: 'error', site: null, result: null, outcome: null, mask: null, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    pending.add(p);
    inflight.set(`${s.id}|${key}`, p);
    void p.finally(() => {
      pending.delete(p);
      inflight.delete(`${s.id}|${key}`);
    });
    return p;
  }

  return store;
}

export const scenarioStore = createScenarioStore(exploreStore, browserLoaders);
