import artifact from './model/ranker.json';
import { rankingFeatures, validPreferences, type MissionPreferences } from './mission';
import { assessRequirements, scenarioMetrics, type Scenario, type ScenarioRequirements } from './scenarios';
import type { MaskMeta, SiteResult } from '../store/explore';

export const RECOMMENDATION_MODEL = artifact;
export interface RecommendationCandidate {
  scenario: Scenario;
  result?: SiteResult & { maskMeta: MaskMeta };
  error?: string;
}
export interface RankedCandidate {
  scenario: Scenario;
  metrics: ReturnType<typeof scenarioMetrics>;
  score: number;
  /** Raw learned contributions; the displayed score normalizes their sum to 0–100. */
  contributions: { power: number; contact: number; gap: number };
}

export function preferenceScore(metrics: ReturnType<typeof scenarioMetrics>, horizonHours: number, preferences: MissionPreferences) {
  const features = rankingFeatures(metrics, horizonHours, preferences);
  if (artifact.weights.length !== features.length || artifact.weights.some((weight) => !Number.isFinite(weight) || weight < 0)) throw new Error('Invalid recommendation model.');
  const contributions = [0, 0, 0];
  features.forEach((value, i) => { contributions[Math.floor(i / 3)] += value * artifact.weights[i]; });
  const maximum = rankingFeatures({ poweredHours: horizonHours, contactHours: horizonHours, longestEarthGapHours: 0 }, horizonHours, preferences)
    .reduce((sum, value, i) => sum + value * artifact.weights[i], 0);
  if (maximum <= 0) throw new Error('Recommendation model has no usable weights.');
  return { score: 100 * contributions.reduce((a, b) => a + b, 0) / maximum,
    contributions: { power: contributions[0], contact: contributions[1], gap: contributions[2] } };
}

/** Hard eligibility checks precede learned ranking. Missing data is never scored as zero. */
export function recommendCandidates(candidates: RecommendationCandidate[], requirements: ScenarioRequirements, preferences: MissionPreferences, horizonDays: number) {
  const ranked: RankedCandidate[] = [];
  const excluded: { id: string; label: string; reasons: string[] }[] = [];
  let pending = 0;
  const preferenceError = !validPreferences(preferences) ? 'Give at least one metric a priority above zero.' : null;
  for (const { scenario, result, error } of candidates) {
    const reasons: string[] = [];
    if (scenario.days !== horizonDays) reasons.push(`Uses ${scenario.days} days; this ranking compares ${horizonDays}-day forecasts.`);
    if (error) reasons.push(`Calculation unavailable: ${error}`);
    if (!result && !error && reasons.length === 0) { pending++; continue; }
    if (result) {
      if (result.maskMeta.failedTiles > 0) reasons.push('Terrain data is incomplete.');
      if (result.maskMeta.source === 'flat') reasons.push('Uses an assumed flat horizon outside the polar terrain maps.');
      if (result.series.hours !== scenario.days * 24 || result.summary.hours !== result.series.hours) reasons.push('Forecast duration does not match its settings.');
      reasons.push(...assessRequirements(result, requirements).reasons);
      if (reasons.length === 0 && !preferenceError) {
        try {
          const metrics = scenarioMetrics(result);
          const scored = preferenceScore(metrics, horizonDays * 24, preferences);
          ranked.push({ scenario, metrics, ...scored });
        } catch { reasons.push('Forecast metrics are invalid for this model.'); }
      }
    }
    if (reasons.length > 0) excluded.push({ id: scenario.id, label: scenario.label, reasons });
  }
  ranked.sort((a, b) => b.score - a.score || a.scenario.id.localeCompare(b.scenario.id));
  const topIds = pending || preferenceError || ranked.length === 0 ? [] : ranked.filter((row) => Math.abs(row.score - ranked[0].score) < 1e-7).map((row) => row.scenario.id);
  return { ranked, excluded, pending, topIds, preferenceError };
}
