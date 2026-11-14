'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from '@/components/AppFrame';
import { DataProblem, SYNC_HINT } from '@/components/DataProblem';
import { NumberField } from '@/components/NumberField';
import { MissionRecommendation } from './MissionRecommendation';
import { DEFAULT_PREFERENCES, type MissionPreferences } from '@/lib/planner/mission';
import { LanderDialog } from '@/components/explore/LanderDialog';
import { Sources, lolaFor } from '@/components/Sources';
import { siteLabel } from '@/lib/data/loaders';
import { PANEL_LABELS } from '@/lib/engine/power';
import { landerLine } from '@/lib/lander';
import {
  assessRequirements, DEFAULT_REQUIREMENTS, MAX_SCENARIOS, parsePlan, scenarioHref,
  scenarioMetrics, serializePlan, snapshotScenario, validateScenario,
  type Scenario, type ScenarioRequirements,
} from '@/lib/planner/scenarios';
import { exploreStore, WINDOW_DAYS, type ExploreState, type MaskMeta, type SiteResult, type WindowDays } from '@/lib/store/explore';
import { dateTimeUtc, isoAt, spanShort } from '@/lib/viz/format';
import { nearestSites } from '@/lib/viz/relief';
import './planner.css';

const STORAGE_KEY = 'earthrise.landing-plan.v1';
const LIMITS = { min: 0, max: 2160, step: 1 };
type Evaluation = { signature?: string; result?: SiteResult & { maskMeta: MaskMeta }; error?: string };
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const signature = (scenario: Scenario) => JSON.stringify([scenario.site, scenario.startUtc, scenario.days, scenario.params]);
const delta = (value: number, baseline: number) => value === baseline ? 'same as baseline' : `${value > baseline ? '+' : '−'}${spanShort(Math.abs(value - baseline))} vs baseline`;
const percent = (value: number) => Number((value * 100).toPrecision(12));

/** Independent saved plans: changing a candidate never changes the baseline's assumptions. */
export function PlanningWorkbench({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [requirements, setRequirements] = useState<ScenarioRequirements>({ ...DEFAULT_REQUIREMENTS });
  const [preferences, setPreferences] = useState<MissionPreferences>({ ...DEFAULT_PREFERENCES });
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>({});
  const [delayDays, setDelayDays] = useState(7);
  const [alternativeId, setAlternativeId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [landerOpen, setLanderOpen] = useState(false);
  const landerRef = useRef<HTMLButtonElement>(null);
  const resultCache = useRef(new Map<string, Evaluation>());

  useEffect(() => {
    let active = true;
    void (async () => {
      await store.getState().init();
      if (!active || store.getState().status !== 'ready') return;
      const current = snapshotScenario(store.getState(), 'Original plan');
      const query = new URLSearchParams(window.location.search);
      let restored = null;
      let storageWarning = '';
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        restored = saved ? parsePlan(saved) : null;
      } catch { storageWarning = 'This browser cannot save plans locally. You can still share the comparison with a link.'; }
      let next = restored?.scenarios ?? [current];
      let nextRequirements = restored?.requirements ?? { ...DEFAULT_REQUIREMENTS };
      let nextPreferences = restored?.preferences ?? { ...DEFAULT_PREFERENCES };
      const imported = query.get('plan');
      if (imported !== null) {
        const parsed = parsePlan(imported);
        if (parsed) {
          next = parsed.scenarios;
          nextRequirements = parsed.requirements;
          nextPreferences = parsed.preferences;
          setNotice('Opened the shared scenarios with their saved settings.');
        } else {
          setError('This shared comparison is invalid or uses settings outside the supported range. Your saved plans were kept.');
        }
      } else if (query.get('pin') === '1') {
        if (next.length < MAX_SCENARIOS) next = [...(restored?.scenarios ?? []), current];
        else setError('Six scenarios are already saved. Remove one before saving another.');
      } else if (query.has('delay')) {
        const days = Number(query.get('delay'));
        if (Number.isInteger(days) && days >= 1 && days <= 365) {
          const delayed = snapshotScenario({ ...current, startUtc: isoAt(current.startUtc, days * 24) }, `Delayed by ${days} days`);
          if (validateScenario(delayed)) {
            next = [current, delayed];
            setDelayDays(days);
            setNotice('The original arrival is preserved beside the delayed arrival. Add a nearby alternative below.');
          } else setError('That delay puts the forecast outside the available Sun and Earth data.');
        } else setError('Choose a whole-number landing delay from 1 to 365 days.');
      }
      if (storageWarning) setNotice(storageWarning);
      setScenarios(next);
      setRequirements(nextRequirements);
      setPreferences(nextPreferences);
      setDraft(snapshotScenario(next[0] ?? current, 'Alternative plan'));
      setHydrated(true);
    })().catch((e) => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [store]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, serializePlan(scenarios, requirements, preferences)); }
    catch { /* Sharing remains available when browser storage is full or disabled. */ }
  }, [hydrated, scenarios, requirements, preferences]);

  useEffect(() => {
    if (!hydrated || s.status !== 'ready') return;
    let active = true;
    const initial = Object.fromEntries(scenarios.map((scenario) => [scenario.id, resultCache.current.get(signature(scenario)) ?? {}]));
    setEvaluations(initial);
    for (const scenario of scenarios) {
      const key = signature(scenario);
      if (resultCache.current.has(key)) continue;
      void store.getState().evaluateScenario(scenario).then((result) => {
        const value = { result, signature: key };
        resultCache.current.set(key, value);
        if (active) setEvaluations((previous) => ({ ...previous, [scenario.id]: value }));
      }).catch((e) => {
        if (active) setEvaluations((previous) => ({ ...previous, [scenario.id]: { error: message(e), signature: key } }));
      });
    }
    return () => { active = false; };
  }, [hydrated, scenarios, s.status, store]);

  const add = (candidate: Scenario) => {
    if (scenarios.length >= MAX_SCENARIOS) { setError('Six scenarios are the most this comparison saves. Remove one first.'); return false; }
    const validated = validateScenario(candidate);
    if (!validated) { setError('Check the arrival and settings. The entire forecast must fit within the 2024–2036 data, with an arrival on a whole UTC hour.'); return false; }
    setScenarios((previous) => [...previous, validated]);
    setShareUrl('');
    setError('');
    setNotice(`Saved “${validated.label}”. Its settings are independent of the other scenarios.`);
    return true;
  };
  const baseline = scenarios[0];
  const baselineResult = baseline && evaluations[baseline.id]?.signature === signature(baseline) ? evaluations[baseline.id]?.result : undefined;
  const baselineMetrics = baselineResult ? scenarioMetrics(baselineResult) : null;
  const nearby = baseline ? nearestSites(baseline.site, s.sites, 6) : [];
  const selectedNearby = nearby.find((candidate) => candidate.site.id === alternativeId) ?? nearby[0];
  const delayScenario = (nearbyAlternative = false) => {
    if (!baseline) return;
    const site = nearbyAlternative ? selectedNearby?.site : baseline.site;
    if (!site) return;
    try {
      add(snapshotScenario({ ...baseline, site, startUtc: isoAt(baseline.startUtc, delayDays * 24) }, nearbyAlternative ? `Nearby alternative, +${delayDays} days` : `Delayed by ${delayDays} days`));
    } catch (e) { setError(message(e)); }
  };
  const saveDraft = () => {
    if (!draft) return;
    if (editing) {
      const validated = validateScenario({ ...draft, id: editing });
      if (!validated) { setError('Check the arrival and settings. Choose a whole UTC hour and a forecast within the 2024–2036 data.'); return; }
      setScenarios((previous) => previous.map((scenario) => scenario.id === editing ? validated : scenario));
      setNotice(`Updated “${validated.label}”. Other scenarios retain their settings.`);
      setError('');
      setShareUrl('');
      setEditing(null);
      setDraft(snapshotScenario(validated, 'Alternative plan'));
    } else if (add(snapshotScenario(draft, draft.label))) {
      setDraft(snapshotScenario(draft, 'Alternative plan'));
    }
  };
  const share = async () => {
    try {
      const url = new URL('/plan', window.location.origin);
      url.searchParams.set('plan', serializePlan(scenarios, requirements, preferences));
      setShareUrl(url.href);
      try {
        await navigator.clipboard.writeText(url.href);
        setNotice('Comparison link copied, including every scenario, lander setting and requirement.');
      } catch { setNotice('Copy the comparison link below. It includes every scenario, lander setting and requirement.'); }
    } catch (e) { setError(message(e)); }
  };

  if (s.status === 'error') return <AppFrame><main className="wrap py-12"><DataProblem error={s.error} hint={SYNC_HINT} /></main></AppFrame>;
  if (!hydrated || !draft) return <AppFrame><main className="wrap py-12"><p role="status" className="text-ink-2">Loading the landing planner…</p>{error && <p role="alert">{error}</p>}</main></AppFrame>;

  return (
    <AppFrame>
      <main className="planning-workbench wrap flex flex-col gap-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[15px] font-medium uppercase tracking-wide text-ink-2">Landing decisions</p>
            <h1 data-band-end="" className="display mt-2 text-[34px] leading-tight sm:text-[40px]">Compare landing scenarios</h1>
            <p className="mt-3 max-w-[48em] text-lg text-ink-2">Keep the original plan. Test a delay, move to a nearby site, or change the lander. Each saved scenario keeps its own arrival and settings.</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" onClick={() => void share()} className="btn" disabled={!scenarios.length}>Share comparison</button>
            <button type="button" onClick={() => window.print()} className="btn" disabled={!scenarios.length || scenarios.some((scenario) => !evaluations[scenario.id]?.result)}>Print comparison estimates</button>
          </div>
        </div>
        {notice && <p role="status" className="no-print text-[15px] text-ink-2">{notice}</p>}
        {error && <p role="alert" className="no-print text-bad">{error}</p>}
        {shareUrl && <label className="no-print flex flex-col gap-2 text-[15px] text-ink-2">Full comparison link<input readOnly value={shareUrl} onFocus={(e) => e.target.select()} className="field w-full" /></label>}

        <MissionRecommendation
          candidates={scenarios.map((scenario) => ({ scenario, ...(evaluations[scenario.id]?.signature === signature(scenario) ? evaluations[scenario.id] : {}) }))}
          requirements={requirements}
          preferences={preferences}
          onPreferences={(next) => { setPreferences(next); setShareUrl(''); }}
          horizonDays={baseline?.days ?? s.days}
        />

        <section aria-labelledby="scenarios-title">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="scenarios-title" className="text-xl font-semibold">Saved scenarios</h2><p className="text-[15px] text-ink-2">{scenarios.length} of {MAX_SCENARIOS} · first scenario is the baseline</p></div>
          {scenarios.length === 0 && <p className="panel text-ink-2">No scenarios saved. Set up a landing below to start a comparison.</p>}
          <div className="scenario-comparison grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {scenarios.map((scenario, index) => {
              const evaluation = evaluations[scenario.id]?.signature === signature(scenario) ? evaluations[scenario.id] : undefined;
              const result = evaluation?.result;
              const metrics = result ? scenarioMetrics(result) : null;
              const assessment = result ? assessRequirements(result, requirements) : null;
              const incompleteTerrain = result ? result.maskMeta.failedTiles > 0 : false;
              return <article key={scenario.id} aria-label={scenario.label} className="scenario-card panel flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{index === 0 ? 'Baseline' : `Alternative ${index}`}</span><span className="text-[13px] text-ink-2">{scenario.days}-day forecast</span></div>
                <h3 className="text-xl font-semibold">{scenario.label}</h3>
                <p className="font-medium">{siteLabel(scenario.site)}</p>
                <p className="text-[15px] text-ink-2">Arrival: {dateTimeUtc(scenario.startUtc, 0)}</p>
                <p className="text-[15px] text-ink-2">{scenario.site.lat.toFixed(4)}°, {scenario.site.lon.toFixed(4)}°{scenario.site.approximate ? ' · illustrative point; region coordinates approximate to about 5 km' : ''}</p>
                {!result && !evaluation?.error && <p role="status" className="text-ink-2">Calculating this scenario…</p>}
                {evaluation?.error && <p role="alert" className="text-bad">Could not calculate this scenario: {evaluation.error}</p>}
                {metrics && <dl className="border-y border-line py-2">
                  {[
                    ['Continuous power from arrival', metrics.poweredHours, baselineMetrics?.poweredHours],
                    ['Powered with Earth in view', metrics.contactHours, baselineMetrics?.contactHours],
                    ['Longest Earth-hidden gap', metrics.longestEarthGapHours, baselineMetrics?.longestEarthGapHours],
                  ].map(([label, value, original]) => <div key={label as string} className="flex items-start justify-between gap-3 py-2"><dt className="max-w-[11em] text-[15px] text-ink-2">{label}</dt><dd className="text-right"><span className="text-lg font-semibold">{spanShort(value as number)}</span>{index > 0 && typeof original === 'number' && <span className="mt-0.5 block text-[13px] text-ink-2">{delta(value as number, original)}</span>}</dd></div>)}
                </dl>}
                {assessment && <div className={`rounded-lg border p-3 text-[15px] ${incompleteTerrain ? 'border-line-strong bg-surface-2' : assessment.passes ? 'border-good-line bg-good-bg' : 'border-bad-line bg-bad-bg'}`}><p className={`font-semibold ${incompleteTerrain ? 'text-ink' : assessment.passes ? 'text-good' : 'text-bad'}`}>{incompleteTerrain ? 'Requirements unconfirmed: incomplete terrain' : assessment.passes ? 'Meets selected requirements' : 'Does not meet selected requirements'}</p>{incompleteTerrain && <p className="mt-2 text-ink-2">These estimates are provisional. Missing terrain may change sunlight, Earth visibility and the power result.{assessment.reasons.length > 0 ? ' The incomplete model currently falls short in these ways:' : ''}</p>}{assessment.reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">{assessment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div>}
                {result && (result.maskMeta.failedTiles > 0 || result.maskMeta.source === 'flat') && <p className="text-[15px] text-ink-2">{result.maskMeta.source === 'flat' ? 'Flat horizon assumption: this site is outside the polar elevation maps.' : 'Some terrain tiles could not be loaded. Missing hills may affect this estimate.'}</p>}
                <details className="text-[15px] text-ink-2 print:block" open><summary className="cursor-pointer font-medium text-ink">Saved assumptions</summary><p className="mt-2">{landerLine(scenario.params.power)}. Panel efficiency {percent(scenario.params.power.efficiency)}%; battery at arrival {percent(scenario.params.power.initialSocFraction)}%; mast {scenario.params.mastM} m; Earth clearance {scenario.params.minEarthElDeg}°.</p><p className="mt-2">Panel model: {PANEL_LABELS[scenario.params.power.panel]}; area {scenario.params.power.areaM2} m²; saved fixed-panel azimuth {scenario.params.power.panelAzimuthDeg}° clockwise from north (used by fixed vertical panels); load {scenario.params.power.loadW} W; battery capacity {scenario.params.power.batteryWh} Wh.</p></details>
                <div className="no-print mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
                  <Link href={scenarioHref(scenario)} className="btn btn-sm">Open forecast</Link>
                  <button type="button" onClick={() => { setDraft({ ...scenario, site: { ...scenario.site }, params: { ...scenario.params, power: { ...scenario.params.power } } }); setEditing(scenario.id); document.getElementById('scenario-editor')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }} className="btn btn-sm" aria-label={`Edit ${scenario.label}`}>Edit</button>
                  {index > 0 && <button type="button" onClick={() => { setScenarios((previous) => [scenario, ...previous.filter((x) => x.id !== scenario.id)]); setShareUrl(''); }} className="btn btn-sm" aria-label={`Use ${scenario.label} as baseline`}>Use as baseline</button>}
                  <button type="button" onClick={() => { setScenarios((previous) => previous.filter((x) => x.id !== scenario.id)); setShareUrl(''); if (editing === scenario.id) setEditing(null); }} className="btn btn-sm" aria-label={`Remove ${scenario.label}`}>Remove</button>
                </div>
              </article>;
            })}
          </div>
        </section>

        <section aria-labelledby="requirements-title" className="panel">
          <h2 id="requirements-title" className="text-xl font-semibold">What must the plan provide?</h2>
          <p className="mt-2 max-w-[55em] text-ink-2">These are screening requirements, not a mission safety verdict. Powered time and Earth visibility together count only until the first power loss. The Earth-visibility gap covers the whole forecast.</p>
          <div className="no-print mt-4 flex flex-wrap gap-4">
            <NumberField label="Required continuous power (hours)" value={requirements.requiredHours} {...LIMITS} className="w-full sm:w-56" onChange={(requiredHours) => { setRequirements((r) => ({ ...r, requiredHours: Math.round(requiredHours) })); setShareUrl(''); }} />
            <NumberField label="Minimum powered Earth view (hours)" value={requirements.minContactHours} {...LIMITS} className="w-full sm:w-56" onChange={(minContactHours) => { setRequirements((r) => ({ ...r, minContactHours: Math.round(minContactHours) })); setShareUrl(''); }} />
            <NumberField label="Maximum Earth-hidden gap (hours)" value={requirements.maxGapHours} {...LIMITS} className="w-full sm:w-56" onChange={(maxGapHours) => { setRequirements((r) => ({ ...r, maxGapHours: Math.round(maxGapHours) })); setShareUrl(''); }} />
          </div>
          <p className="mt-3 text-[15px] text-ink-2">Selected: at least {requirements.requiredHours} hours continuously powered; at least {requirements.minContactHours} powered hours with Earth in view; no Earth-hidden gap longer than {requirements.maxGapHours} hours.</p>
        </section>

        {baseline && <section aria-labelledby="delay-title" className="no-print panel">
          <h2 id="delay-title" className="text-xl font-semibold">Landing delayed?</h2>
          <p className="mt-2 text-ink-2">Baseline: {baseline.label} · {siteLabel(baseline.site)} · {dateTimeUtc(baseline.startUtc, 0)}. Both alternatives keep its lander and forecast duration.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <NumberField label="Arrival delay (days)" value={delayDays} min={1} max={365} step={1} onChange={(days) => setDelayDays(Math.round(days))} />
            <button type="button" onClick={() => delayScenario()} disabled={scenarios.length >= MAX_SCENARIOS} className="btn">Add delayed arrival</button>
            <label className="flex min-w-0 flex-col gap-1.5 text-[15px] text-ink-2">Nearby alternative<select aria-label="Nearby alternative" value={selectedNearby?.site.id ?? ''} onChange={(e) => setAlternativeId(e.target.value)} className="field max-w-full sm:max-w-80">{nearby.map(({ site, km }) => <option key={site.id} value={site.id}>{siteLabel(site)} · {km.toFixed(1)} km away</option>)}</select></label>
            <button type="button" onClick={() => delayScenario(true)} disabled={!selectedNearby || scenarios.length >= MAX_SCENARIOS} className="btn">Add nearby site on delayed date</button>
          </div>
        </section>}

        <section id="scenario-editor" aria-labelledby="editor-title" className="no-print panel scroll-mt-6">
          <h2 id="editor-title" className="text-xl font-semibold">{editing ? 'Edit this scenario' : 'Save another scenario'}</h2>
          <p className="mt-2 text-ink-2">Changing these fields affects this candidate only. Add the same site with another arrival to compare dates directly.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">Scenario name<input value={draft.label} maxLength={120} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="field" /></label>
            <label className="flex min-w-0 flex-col gap-1.5 text-[15px] text-ink-2">Landing site<select value={draft.site.id} onChange={(e) => { const site = s.sites.find((candidate) => candidate.id === e.target.value); if (site) setDraft({ ...draft, site: { ...site } }); }} className="field">{!s.sites.some((site) => site.id === draft.site.id) && <option value={draft.site.id}>{siteLabel(draft.site)}</option>}{s.sites.map((site) => <option key={site.id} value={site.id}>{siteLabel(site)}</option>)}</select></label>
            <label className="flex min-w-0 flex-col gap-1.5 text-[15px] text-ink-2">Arrival (UTC)<input type="datetime-local" step={3600} min="2024-01-02T00:00" max={isoAt('2036-12-31T20:00:00', -draft.days * 24).slice(0, 16)} value={draft.startUtc.slice(0, 16)} onChange={(e) => e.target.value && setDraft({ ...draft, startUtc: e.target.value.length === 16 ? `${e.target.value}:00` : e.target.value.slice(0, 19) })} className="field min-w-0" /></label>
            <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">Forecast duration<select value={draft.days} onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) as WindowDays })} className="field">{WINDOW_DAYS.map((days) => <option key={days} value={days}>{days} days</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><button ref={landerRef} type="button" onClick={() => setLanderOpen(true)} className="btn">Change this scenario’s lander</button><p className="max-w-[44em] text-[15px] text-ink-2">{landerLine(draft.params.power)} · mast {draft.params.mastM} m · Earth clearance {draft.params.minEarthElDeg}°</p></div>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={saveDraft} disabled={!draft.label.trim() || (!editing && scenarios.length >= MAX_SCENARIOS)} className="btn btn-primary">{editing ? 'Save scenario changes' : 'Save scenario'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setDraft(snapshotScenario(draft, 'Alternative plan')); }} className="btn">Cancel editing</button>}<button type="button" onClick={() => { setDraft(snapshotScenario(store.getState(), 'Current Explore forecast')); setEditing(null); }} className="btn">Use current Explore settings</button></div>
          {scenarios.length >= MAX_SCENARIOS && <p className="mt-3 text-[15px] text-ink-2">Six scenarios saved. Edit one or remove one before adding another.</p>}
        </section>

        <section aria-labelledby="model-title" className="panel text-[15px] text-ink-2">
          <h2 id="model-title" className="text-lg font-semibold text-ink">What this comparison establishes</h2>
          <p className="mt-2">NASA JPL DE440 supplies the Sun and Earth positions; NASA LRO LOLA supplies the polar terrain horizons. Results use hourly samples and the saved panel, load and battery settings. Terrain uncertainty can shift rise and set times. Earth in view means geometric line of sight, not a verified radio link. Thermal survival, ground-station availability and restarting after a power loss are not modeled.</p>
          <p className="mt-2">Meeting these requirements is preliminary screening. A region-centre coordinate represents one illustrative point, not the whole landing region. A forecast is limited to its selected duration; powered operation beyond its end is not assessed.</p>
          <p className="no-print mt-3"><Link href="/validate" className="underline underline-offset-4">Inspect the accuracy checks</Link> · <Link href="/learn" className="underline underline-offset-4">How the model works</Link></p>
          {scenarios.length > 0 && <Sources of={['de440', ...lolaFor(...scenarios.map((scenario) => scenario.site))]} />}
        </section>
        {landerOpen && <LanderDialog params={draft.params} onPower={(patch) => setDraft((previous) => previous ? { ...previous, params: { ...previous.params, power: { ...previous.params.power, ...patch } } } : previous)} onParams={(patch) => setDraft((previous) => previous ? { ...previous, params: { ...previous.params, ...patch } } : previous)} busy={false} onClose={() => setLanderOpen(false)} returnFocus={landerRef} />}
      </main>
    </AppFrame>
  );
}
