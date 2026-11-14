'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { DataProblem, SYNC_HINT } from './DataProblem';
import { PlannerChat } from './PlannerChat';
import { lolaFor, Sources } from './Sources';
import { CompareStory } from './compare/CompareStory';
import { checkWords, ComparisonFiles, saveFile, useDataVersions, type Opened } from './compare/ComparisonFiles';
import { ScenarioCard } from './compare/ScenarioCard';
import { ScenarioEditor } from './compare/ScenarioEditor';
import { ScenarioTable } from './compare/ScenarioTable';
import { columnsOf } from './compare/columns';
import { LanderDialog } from './explore/LanderDialog';
import { siteLabel } from '@/lib/data/loaders';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { comparisonHref, readComparison, SCENARIO_MAX } from '@/lib/scenario/codec';
import { fileName, scenarioFile } from '@/lib/scenario/file';
import { paramsOf } from '@/lib/scenario/scenario';
import { DEFAULT_PARAMS, DEFAULT_START, exploreStore, type ExploreState } from '@/lib/store/explore';
import { scenarioStore, type ScenarioState } from '@/lib/store/scenarios';
import { READY_PAIRS } from '@/lib/viz/compare';

const LINK = 'font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink';
/** The example the empty page leads with: a five-day slip at de Gerlache Rim 2, from the forecast's first landing. */
const EXAMPLE_SITE = 'de_gerlache_rim_2';
const EXAMPLE_SLIP_H = 5 * 24;

/**
 * Compare: a baseline scenario and up to three more, each with its own site, landing time, stay, lander, mast and
 * clearance for Earth, worked out on its own. The page reads top to bottom: what changed at the original site and why,
 * the alternative that works better and its trade-offs, the scenarios, then every setting and figure side by side with
 * the change from the baseline. The address carries the whole comparison.
 */
export function CompareView({ store = exploreStore, scenarios = scenarioStore }: { store?: StoreApi<ExploreState>; scenarios?: StoreApi<ScenarioState> }) {
  const s = useStore(store);
  const sc = useStore(scenarios);
  useDemoMode(store);
  const versions = useDataVersions();
  const [linkRead, setLinkRead] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [landerFor, setLanderFor] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);

  // A shared link's comparison replaces the one on the page; an old /compare address keeps it, and the sites on Explore's list join it.
  useEffect(() => {
    let live = true;
    void store
      .getState()
      .init()
      .then(() => {
        if (!live) return;
        const r = readComparison(window.location.search);
        if (r.found) scenarios.getState().load(r.scenarios, r.problem);
        scenarios.getState().takeList();
        setLinkRead(true);
      });
    return () => {
      live = false;
    };
  }, [store, scenarios]);

  // The address carries the comparison, so copying it from the browser shares every setting too.
  useEffect(() => {
    if (!linkRead) return;
    const href = comparisonHref(sc.scenarios);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, '', href);
  }, [linkRead, sc.scenarios]);

  if (s.status !== 'ready') {
    return (
      <AppFrame>
        <main className="wrap py-12">
          {s.status === 'error' ? <DataProblem error={s.error} hint={SYNC_HINT} /> : <p className="text-ink-2">Loading NASA data…</p>}
        </main>
      </AppFrame>
    );
  }

  const act = scenarios.getState();
  const cols = columnsOf(sc.scenarios, sc.runs, s.sites);
  const full = sc.scenarios.length >= SCENARIO_MAX;
  const check = opened ? checkWords(opened, cols) : null;
  const editingScenario = sc.scenarios.find((x) => x.id === editing) ?? null;
  const landerScenario = sc.scenarios.find((x) => x.id === landerFor) ?? null;
  const example = () => {
    setOpened(null);
    const a = act.startFrom({ siteId: EXAMPLE_SITE, startUtc: DEFAULT_START, days: 30, params: DEFAULT_PARAMS });
    const b = a ? act.slip(a, EXAMPLE_SLIP_H) : null;
    if (b) void act.findNearby(b);
  };
  const addPair = (ids: [string, string]) => {
    void (async () => {
      for (const id of ids) await store.getState().addToCompare(id);
    })();
  };
  const update = (id: string, patch: Parameters<ScenarioState['update']>[1]) => act.update(id, patch);

  return (
    <AppFrame>
      <main className="wrap flex flex-col gap-6 pb-12 pt-8">
        <div>
          <h1 data-band-end="" className="display text-[34px] leading-tight sm:text-[40px]">
            Compare sites
          </h1>
          <p className="mt-2 max-w-[46em] text-lg text-ink-2">A baseline and up to three changes to it: another landing time, another site, another lander. Each is worked out with its own settings.</p>
        </div>
        {sc.problem && (
          <p role="status" className="text-[15px] text-bad">
            {sc.problem}
          </p>
        )}
        {sc.note && (
          <p role="status" className="text-[15px] text-ink">
            {sc.note}
          </p>
        )}

        {cols.length === 0 ? (
          <section aria-labelledby="h-start" className="panel">
            <h2 id="h-start" className="display text-[23px] font-semibold">
              Start with an example
            </h2>
            <p className="mt-2 text-ink-2">Each shows how much a few days or a few kilometres change.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={example} className="btn btn-primary h-auto min-h-[48px] max-w-full whitespace-normal py-2.5 text-left">
                <span>
                  <span className="block font-semibold">Our landing slipped by five days</span>
                  <span className="block text-[15px] font-normal">de Gerlache Rim 2, five days later, and the best place nearby</span>
                </span>
              </button>
              {READY_PAIRS.map((p) => (
                <button key={p.title} type="button" onClick={() => addPair(p.ids)} className="btn h-auto min-h-[48px] max-w-full whitespace-normal py-2.5 text-left">
                  <span>
                    <span className="block font-semibold">{p.title}</span>
                    <span className="block text-[15px] text-ink-2">{p.ids.map((id) => siteLabel(s.sites.find((x) => x.id === id) ?? { name: id })).join(' and ')}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-ink-2">
              Or choose a landing in{' '}
              <Link href="/explore" className={LINK}>
                Explore
              </Link>{' '}
              and press “Compare from here”.
            </p>
          </section>
        ) : (
          <>
            <CompareStory cols={cols} />
            <section aria-labelledby="h-scenarios" className="flex flex-col gap-4">
              <h2 id="h-scenarios" className="display text-[23px] font-semibold">
                The scenarios
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cols.map((c, i) => (
                  <ScenarioCard
                    key={c.scenario.id}
                    col={c}
                    index={i}
                    run={sc.runs[c.scenario.id]}
                    full={full}
                    searching={sc.searching === c.scenario.id}
                    onSlip={(h) => act.slip(c.scenario.id, h)}
                    onNearby={() => void act.findNearby(c.scenario.id)}
                    onChange={() => setEditing(c.scenario.id)}
                    onDuplicate={() => act.duplicate(c.scenario.id)}
                    onBaseline={() => act.makeBaseline(c.scenario.id)}
                    onRemove={() => act.remove(c.scenario.id)}
                    onSave={() => saveFile(fileName([c]), `${JSON.stringify(scenarioFile([c], versions), null, 2)}\n`)}
                  />
                ))}
              </div>
              <div className="panel">
                <ScenarioTable cols={cols} runs={sc.runs} onUseBest={(id) => act.useSiteBest(id)} />
                {/* DE440 gives every figure, and LOLA the hills on the grids of the sites compared. */}
                <Sources of={['de440', ...lolaFor(...cols.map((c) => c.site))]} />
              </div>
            </section>
          </>
        )}

        <ComparisonFiles
          cols={cols}
          check={check}
          onOpen={(o) => {
            setOpened(o);
            if (o.scenarios.length === 0) {
              act.setNote(o.problem ?? 'This file holds no scenarios.');
              return;
            }
            act.load(o.scenarios, o.problem);
            act.setNote(`The file’s ${o.scenarios.length === 1 ? 'scenario replaces' : `${o.scenarios.length} scenarios replace`} the ones that were on this page.`);
          }}
        />
        {cols.length > 0 && (
          <p>
            <button
              type="button"
              onClick={() => {
                setOpened(null);
                act.clear();
              }}
              className="btn btn-sm"
            >
              Start again
            </button>
          </p>
        )}
        <PlannerChat store={store} />
      </main>
      {editingScenario && (
        <ScenarioEditor
          scenario={editingScenario}
          sites={s.sites}
          onChange={(patch) => update(editingScenario.id, patch)}
          onLander={() => {
            setEditing(null);
            setLanderFor(editingScenario.id);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {landerScenario && (
        <LanderDialog
          params={paramsOf(landerScenario)}
          onPower={(patch) => {
            const now = scenarios.getState().scenarios.find((x) => x.id === landerScenario.id);
            if (now) update(now.id, { power: { ...now.power, ...patch } });
          }}
          onParams={(patch) => update(landerScenario.id, patch)}
          busy={sc.runs[landerScenario.id]?.status === 'busy'}
          onClose={() => setLanderFor(null)}
        />
      )}
    </AppFrame>
  );
}
