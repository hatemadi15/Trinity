/** Preferences rank eligible plans; requirements remain separate must-have conditions. */
export interface MissionPreferences {
  power: number;
  contact: number;
  gap: number;
}
export const DEFAULT_PREFERENCES: MissionPreferences = { power: 1, contact: 1, gap: 1 };
export const MISSION_PROFILES = [
  { id: 'balanced', label: 'Balance all three metrics', preferences: DEFAULT_PREFERENCES },
  { id: 'power', label: 'Prioritize powered operation', preferences: { power: 5, contact: 1, gap: 1 } },
  { id: 'contact', label: 'Prioritize Earth-visible operating time', preferences: { power: 1, contact: 5, gap: 1 } },
  { id: 'gap', label: 'Prioritize shorter Earth-hidden gaps', preferences: { power: 1, contact: 1, gap: 5 } },
] as const;

export function validPreferences(input: unknown): input is MissionPreferences {
  if (!input || typeof input !== 'object') return false;
  const p = input as MissionPreferences;
  return [p.power, p.contact, p.gap].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100) && p.power + p.contact + p.gap > 0;
}

export interface RankingMetrics { poweredHours: number; contactHours: number; longestEarthGapHours: number }

/** Fixed normalization avoids scores depending on which other candidates happen to be present. */
export function rankingFeatures(metrics: RankingMetrics, horizonHours: number, preferences: MissionPreferences): number[] {
  if (!validPreferences(preferences) || !Number.isFinite(horizonHours) || horizonHours <= 0) throw new Error('Invalid mission priorities or forecast duration.');
  const { poweredHours: p, contactHours: c, longestEarthGapHours: g } = metrics;
  if (![p, c, g].every((n) => Number.isFinite(n) && n >= 0 && n <= horizonHours) || c > p) throw new Error('Invalid forecast metrics.');
  const total = preferences.power + preferences.contact + preferences.gap;
  const priorities = [preferences.power, preferences.contact, preferences.gap].map((n) => n / total);
  // Each feature increases when its metric improves; nonnegative learned weights preserve this.
  return [p / horizonHours, c / horizonHours, 1 - g / horizonHours].flatMap((value, i) => [value, Math.sqrt(value), value * value].map((basis) => basis * priorities[i]));
}
