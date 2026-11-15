'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { DataProblem, SYNC_HINT } from './DataProblem';
import { PlannerChat } from './PlannerChat';
import { lolaFor, Sources } from './Sources';
import { AddLanding } from './compare/AddLanding';
import { Fold } from './Fold';
import { Assumptions, CompareStory } from './compare/CompareStory';
import { LandingStrips } from './compare/LandingStrips';
import { MetricBars } from './compare/MetricBars';
import { checkWords, ComparisonFiles, saveFile, useDataVersions, type Opened } from './compare/ComparisonFiles';
import { ScenarioCard } from './compare/ScenarioCard';
import { ScenarioEditor } from './compare/ScenarioEditor';
import { ScenarioTable } from './compare/ScenarioTable';
import { columnsOf } from './compare/columns';
import { LanderDialog } from './explore/LanderDialog';
import { siteLabel } from '@/lib/data/loaders';
import type { VersionsDeps } from '@/lib/ensemble/useTerrainVersions';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { comparisonHref, readComparison, SCENARIO_MAX } from '@/lib/scenario/codec';
import { fileName, scenarioFile } from '@/lib/scenario/file';
import { paramsOf, scenarioKey } from '@/lib/scenario/scenario';
import { DEFAULT_PARAMS, DEFAULT_START, exploreStore, type ExploreState } from '@/lib/store/explore';
import { scenarioStore, type ScenarioState } from '@/lib/store/scenarios';
import { figureRows, landingShort, READY_PAIRS, timingLine, verdictLine } from '@/lib/viz/compare';

const LINK = 'font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink';
/** The example the empty page leads with: a five-day slip at de Gerlache Rim 2, from the forecast's first landing. */
const EXAMPLE_SITE = 'de_gerlache_rim_2';
const EXAMPLE_SLIP_H = 5 * 24;

/**
 * Compare: the visitor's landing and up to three more, each with its own site, landing time, stay, lander, mast and
 * clearance for Earth, worked out on its own. The page reads top to bottom: which landing works best and why, the
 * landings as cards with "Add a landing" beside them, then every setting and figure side by side with the best of each
 * row marked and the change from the visitor's landing. In the code a landing is a scenario and the first is the
 * baseline; the address carries the whole comparison.
 */
export function CompareView({
  store = exploreStore,
  scenarios = scenarioStore,
  terrainVersions,
}: {
  store?: StoreApi<ExploreState>;
  scenarios?: StoreApi<ScenarioState>;
  /** Injected in tests; by default each site's data/ensemble file and the versions' worker. */
  terrainVersions?: VersionsDeps;
}) {
  const s = useStore(store);
  const sc = useStore(scenarios);
  useDemoMode(store);
  const versions = useDataVersions();
  const [linkRead, setLinkRead] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [landerFor, setLanderFor] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // "Add a landing" starts open beside a landing on its own, as the next step; a press opens or closes it after.
  const [adding, setAdding] = useState<boolean | null>(null);
  const addId = useId();
  const addButton = useRef<HTMLButtonElement>(null);

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
        // The requirements the link names replace the visit's, so every scenario is checked against the sender's.
        if (r.requirements) store.getState().setRequirements(r.requirements);
        scenarios.getState().takeList();
        setLinkRead(true);
      });
    return () => {
      live = false;
    };
  }, [store, scenarios]);

  // The address carries the comparison and the requirements set, so copying it from the browser shares every setting too.
  useEffect(() => {
    if (!linkRead) return;
    const href = comparisonHref(sc.scenarios, '/compare', s.requirements);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, '', href);
  }, [linkRead, sc.scenarios, s.requirements]);

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
  // Each scenario checked against the requirements set on Explore (Options), when any is set.
  const cols = columnsOf(sc.scenarios, sc.runs, s.sites, s.requirements);
  const full = sc.scenarios.length >= SCENARIO_MAX;
  // The file's figures are checked only while the page holds the scenarios the file gave, unchanged.
  const unchanged = opened !== null && opened.scenarios.length === sc.scenarios.length && opened.scenarios.every((x, i) => scenarioKey(x) === scenarioKey(sc.scenarios[i]));
  const check = opened && unchanged ? checkWords(opened, cols) : null;
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
  const addOpen = !full && (adding ?? cols.length === 1);
  /** A landing was added: the choices close, and the keyboard stays on the button that opened them. */
  const added = (id: string | null) => {
    if (!id) return;
    setAdding(false);
    addButton.current?.focus();
  };
  const verdict = verdictLine(cols);
  const best = verdict?.index ?? null;
  const rows = figureRows(cols);
  const cellOf = (id: 'power' | 'contact', i: number) => rows.find((r) => r.id === id)?.cells[i]?.value ?? null;
  /** The visitor's own landing, from the one Explore shows, with its place, date and lander open to set. */
  const own = () => {
    setOpened(null);
    const id = act.startFrom(store.getState());
    if (id) setEditing(id);
  };

  return (
    <AppFrame>
      <main className="wrap flex flex-col gap-5 pb-12 pt-8">
        <div>
          <h1 data-band-end="" className="display text-[34px] leading-tight sm:text-[40px]">
            Compare landings
          </h1>
          <p className="mt-1 max-w-[46em] text-lg text-ink-2">Up to four landings side by side: which has the most power and radio contact.</p>
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
          <section aria-labelledby="h-start" className="rounded-lg border border-line border-l-[6px] border-l-accent bg-band px-5 py-5 sm:px-6">
            <h2 id="h-start" className="display text-[23px] font-semibold">
              Start here
            </h2>
            <p className="mt-1 text-ink-2">Press the example. Then add a landing of your own.</p>
            <p className="mt-4">
              <button type="button" onClick={example} className="btn btn-primary h-auto min-h-[64px] max-w-full whitespace-normal px-5 py-3 text-left">
                <span>
                  <span className="block text-xl font-semibold">What if our landing is 5 days late?</span>
                  <span className="block text-[15px] font-normal">de Gerlache Rim 2 on {landingShort(DEFAULT_START).split(',')[0]}, 5 days later, and the best place nearby</span>
                </span>
              </button>
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {READY_PAIRS.map((p, i) => (
                <button key={p.title} type="button" onClick={() => addPair(p.ids)} className="panel flex flex-col gap-1 text-left hover:border-line-strong" style={{ borderTop: `6px solid var(--landing-${i + 1})` }}>
                  <span className="text-[15px] text-ink-2">Example</span>
                  <span className="font-semibold text-ink">{p.title}</span>
                  <span className="text-[15px] text-ink-2">{p.ids.map((id) => siteLabel(s.sites.find((x) => x.id === id) ?? { name: id })).join(' and ')}</span>
                </button>
              ))}
              <div className="panel flex flex-col items-start gap-2" style={{ borderTop: '6px solid var(--landing-3)' }}>
                <span className="text-[15px] text-ink-2">Your own</span>
                <button type="button" onClick={own} className="btn">
                  Set up my own landing
                </button>
                <span className="text-[15px] text-ink-2">
                  Or pick one in{' '}
                  <Link href="/explore" className={LINK}>
                    Explore
                  </Link>
                  .
                </span>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* Alone, a landing has nothing to compare with yet: its card, with the ways to add another, comes first. */}
            {cols.length > 1 && <CompareStory cols={cols} />}
            <section aria-labelledby="h-scenarios" className="flex flex-col gap-4">
              <h2 id="h-scenarios" className="display text-[23px] font-semibold">
                The landings
              </h2>
              {cols.length === 1 && <p className="max-w-[60em] text-ink">{timingLine(cols)} Now add a second landing to compare.</p>}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cols.map((c, i) => (
                  <ScenarioCard
                    key={c.scenario.id}
                    col={c}
                    index={i}
                    run={sc.runs[c.scenario.id]}
                    full={full}
                    best={best === i}
                    reason={verdict?.reason}
                    power={cellOf('power', i)}
                    contact={cellOf('contact', i)}
                    onEdit={() => setEditing(c.scenario.id)}
                    onDuplicate={() => act.duplicate(c.scenario.id)}
                    onBaseline={() => act.makeBaseline(c.scenario.id)}
                    onRemove={() => act.remove(c.scenario.id)}
                    onSave={() => saveFile(fileName([c]), `${JSON.stringify(scenarioFile([c], versions, new Date(), s.requirements), null, 2)}\n`)}
                  />
                ))}
                {full ? null : (
                  <button
                    ref={addButton}
                    type="button"
                    aria-expanded={addOpen}
                    aria-controls={addId}
                    onClick={() => setAdding(!addOpen)}
                    className="btn btn-primary h-auto min-h-[96px] flex-col items-start justify-center gap-1 whitespace-normal px-5 py-4 text-left"
                  >
                    <span className="text-xl font-semibold">
                      <span aria-hidden="true">+ </span>Add a landing
                    </span>
                    <span className="text-[15px] font-normal">Another place, another date, or both</span>
                  </button>
                )}
              </div>
              {full && <p className="text-[15px] text-ink-2">Four landings is the most. Remove one to add another.</p>}
              {addOpen && (
                <AddLanding
                  // A landing removed or replaced starts the choices again from the visitor's own.
                  key={cols.map((c) => c.scenario.id).join(' ')}
                  id={addId}
                  cols={cols}
                  sites={s.sites}
                  searching={sc.searching !== null}
                  onLater={(from, hours) => added(act.slip(from, hours))}
                  onNearby={(from) => void act.findNearby(from).then(added)}
                  onAny={(from, siteId, startUtc) => {
                    const id = act.duplicate(from);
                    const site = s.sites.find((x) => x.id === siteId);
                    if (id) update(id, { siteId, startUtc, timing: 'set', label: `${site ? siteLabel(site) : siteId}, ${landingShort(startUtc).split(',')[0]}` });
                    added(id);
                  }}
                />
              )}
            </section>
            <LandingStrips cols={cols} runs={sc.runs} />
            <MetricBars cols={cols} />
            <section aria-label="All figures" className="panel !py-3">
              <Fold label="All figures">
                <ScenarioTable cols={cols} runs={sc.runs} onUseBest={(id) => act.useSiteBest(id)} requirements={s.requirements} versions={terrainVersions} />
              </Fold>
              {/* DE440 gives every figure, and LOLA the hills on the grids of the sites compared. */}
              <Sources of={['de440', ...lolaFor(...cols.map((c) => c.site))]} />
            </section>
          </>
        )}

        <div className="flex flex-col gap-1 rounded-lg border border-line bg-band px-5 py-3">
        <ComparisonFiles
          cols={cols}
          requirements={s.requirements}
          check={check}
          onOpen={(o) => {
            setOpened(o);
            if (o.scenarios.length === 0) {
              act.setNote(o.problem ?? 'This file holds no landings.');
              return;
            }
            act.load(o.scenarios, o.problem);
            // The requirements saved with the file are set, as one set, so the checks are the ones it was saved with.
            if (o.requirements) store.getState().setRequirements(o.requirements);
            act.setNote(`The file’s ${o.scenarios.length === 1 ? 'landing replaces' : `${o.scenarios.length} landings replace`} the ones that were on this page${o.requirements ? ', and the requirements saved with it are set' : ''}.`);
          }}
        />
          {cols.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <Assumptions />
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
            </div>
          )}
        </div>
        <PlannerChat store={store} scenarios={scenarios} />
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
