'use client';
import Link from 'next/link';
import { NumberField } from '@/components/NumberField';
import { DEFAULT_PREFERENCES, MISSION_PROFILES, type MissionPreferences } from '@/lib/planner/mission';
import { recommendCandidates, RECOMMENDATION_MODEL, type RecommendationCandidate } from '@/lib/planner/recommendation';
import { scenarioHref, type ScenarioRequirements } from '@/lib/planner/scenarios';
import { spanShort } from '@/lib/viz/format';

export function MissionRecommendation({ candidates, requirements, preferences = DEFAULT_PREFERENCES, onPreferences, horizonDays }: {
  candidates: RecommendationCandidate[];
  requirements: ScenarioRequirements;
  preferences?: MissionPreferences;
  onPreferences: (preferences: MissionPreferences) => void;
  horizonDays: number;
}) {
  const recommendation = recommendCandidates(candidates, requirements, preferences, horizonDays);
  const profile = MISSION_PROFILES.find((p) => Object.keys(preferences).every((key) => preferences[key as keyof MissionPreferences] === p.preferences[key as keyof MissionPreferences]));
  const leader = recommendation.topIds.length ? recommendation.ranked[0] : null;
  return <section aria-labelledby="recommendation-title" className="panel">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="recommendation-title" className="text-xl font-semibold">AI mission recommendation</h2><span className="text-[13px] font-medium text-ink-2">Experimental · trained preference model</span></div>
    <p className="mt-2 max-w-[58em] text-ink-2">First, every plan must meet your requirements below. The trained model then weighs all three metrics using your priorities. It compares only saved {horizonDays}-day forecasts, matching the first scenario, so a longer forecast does not get an unfair advantage.</p>
    <div className="no-print mt-4 flex flex-wrap items-end gap-4">
      <label className="flex min-w-0 flex-col gap-1.5 text-[15px] text-ink-2">Mission priority
        <select className="field w-full sm:max-w-80" value={profile?.id ?? 'custom'} onChange={(event) => {
          const selected = MISSION_PROFILES.find((p) => p.id === event.target.value);
          if (selected) onPreferences({ ...selected.preferences });
        }}>
          {MISSION_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          <option value="custom" disabled>Custom priorities</option>
        </select>
      </label>
      {([
        ['power', 'Power priority'], ['contact', 'Earth-view time priority'], ['gap', 'Shorter-gap priority'],
      ] as const).map(([key, label]) => <NumberField key={key} label={label} min={0} max={100} step={1} value={preferences[key]} className="w-32" onChange={(value) => onPreferences({ ...preferences, [key]: value })} />)}
    </div>
    <p className="mt-3 text-[15px] text-ink-2">Higher priority means more influence on ranking: power {preferences.power}, Earth-view time {preferences.contact}, shorter gaps {preferences.gap}. A zero ignores that preference; must-have requirements still apply.</p>
    <div className="mt-4 rounded-lg border border-line-strong p-4" aria-live="polite">
      {recommendation.preferenceError ? <p className="text-bad">{recommendation.preferenceError}</p> : recommendation.pending ? <p>Waiting for {recommendation.pending} forecast{recommendation.pending === 1 ? '' : 's'} before recommending a plan.</p> : leader ? <>
        <p className="font-semibold">{recommendation.topIds.length > 1 ? 'Joint top choices' : recommendation.ranked.length === 1 ? 'Only eligible saved plan' : 'Recommended among your saved plans'}: {recommendation.ranked.filter((r) => recommendation.topIds.includes(r.scenario.id)).map((r) => r.scenario.label).join(', ')}</p>
        <p className="mt-2 text-ink-2">{leader.scenario.label}: {spanShort(leader.metrics.poweredHours)} continuously powered; {spanShort(leader.metrics.contactHours)} powered with Earth in view; longest Earth-hidden gap {spanShort(leader.metrics.longestEarthGapHours)}. It meets the selected requirements.</p>
        <Link href={scenarioHref(leader.scenario)} className="btn btn-sm mt-3">Open recommended forecast</Link>
      </> : <p className="font-semibold">{candidates.length ? 'No saved plan can be recommended under these requirements.' : 'Save a scenario to get a recommendation.'}</p>}
    </div>
    {!recommendation.pending && !recommendation.preferenceError && recommendation.ranked.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full border-collapse text-left text-[15px]">
      <caption className="mb-2 text-left text-ink-2">Learned preference score (0–100), not a probability of mission success. Contributions show which metrics drive the score.</caption>
      <thead><tr>{['Plan', 'Score', 'Power contribution', 'Earth-view contribution', 'Shorter-gap contribution'].map((label) => <th key={label} scope="col" className="border-b border-line p-2">{label}</th>)}</tr></thead>
      <tbody>{recommendation.ranked.map((row) => {
        const sum = Object.values(row.contributions).reduce((a, b) => a + b, 0);
        return <tr key={row.scenario.id}><th scope="row" className="border-b border-line p-2">{row.scenario.label}</th><td className="border-b border-line p-2">{row.score.toFixed(1)}</td>{Object.values(row.contributions).map((value, i) => <td key={i} className="border-b border-line p-2">{(sum > 0 ? value / sum * row.score : 0).toFixed(1)}</td>)}</tr>;
      })}</tbody>
    </table></div>}
    {recommendation.excluded.length > 0 && <details className="mt-4 text-[15px]" open={!leader && !recommendation.pending}><summary className="cursor-pointer font-medium">Why {recommendation.excluded.length} plan{recommendation.excluded.length === 1 ? ' is' : 's are'} excluded</summary><ul className="mt-2 space-y-2 text-ink-2">{recommendation.excluded.map((row) => <li key={row.id}><strong>{row.label}:</strong> {row.reasons.join(' ')}</li>)}</ul></details>}
    <details className="mt-4 text-[15px] text-ink-2"><summary className="cursor-pointer font-medium text-ink">What the model learned</summary>
      <p className="mt-2">{RECOMMENDATION_MODEL.algorithm}. Training and evaluation use {RECOMMENDATION_MODEL.scenario_count.toLocaleString('en-US')} simulated forecasts from the existing DE440/LOLA engine, with rule-generated preference labels. Of these, {RECOMMENDATION_MODEL.scenario_splits.train.toLocaleString('en-US')} forecasts are used for training. It learned a declared preference policy, not expert mission decisions or real mission outcomes. It does not predict new physical conditions or mission success.</p>
      <p className="mt-2">Training uses 2027 examples. Testing holds out catalogue sites and the year 2028. Agreement with synthetic preferences on the 2028 test pairs: {(RECOMMENDATION_MODEL.validation.held_out_year_2028.synthetic_policy_agreement * 100).toFixed(1)}%. This measures policy imitation, not flight reliability. Model: {RECOMMENDATION_MODEL.id}.</p>
      <p className="mt-2">Higher power and Earth-view time, and shorter gaps, cannot lower a score when other inputs stay fixed. Incomplete terrain, assumed flat horizons and failed requirements are excluded before scoring. Landing hazards, science value, thermal survival and actual radio-link performance are not assessed.</p>
    </details>
  </section>;
}
