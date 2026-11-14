import type { TerrainQuality } from '@/lib/uncertainty/budget';

const deg = (x: number) => `${x.toFixed(1)}°`;

/**
 * The ground at a site in one line, from NASA's adjusted south-pole maps (PGDA product 90): its slope and the
 * slope's error, how well its height is known, the finest detail the map resolves there, its roughness over
 * 100 m and the nearest permanently shadowed ground. Each figure the maps lack is left out.
 */
export function groundWords(q: TerrainQuality): string {
  const parts: string[] = [];
  if (q.slope_deg !== null) parts.push(`slope ${deg(q.slope_deg)}${q.slope_error_deg !== null ? ` (±${deg(q.slope_error_deg)})` : ''}`);
  if (q.height_error_m !== null) parts.push(`height known to ±${q.height_error_m.toFixed(1)} m`);
  if (q.effective_resolution_m !== null) parts.push(`detail to about ${Math.round(q.effective_resolution_m)} m`);
  if (q.roughness_100m_m !== null) parts.push(`roughness ${q.roughness_100m_m.toFixed(1)} m across 100 m`);
  const psr = q.nearest_psr_km !== null ? `permanently shadowed ground ${q.nearest_psr_km.toFixed(1)} km away` : `no permanently shadowed ground within ${Math.round(q.psr_search_km)} km`;
  return `The ground here, from NASA’s adjusted south-pole maps: ${parts.join(', ')}; ${psr}.`;
}

export function GroundQuality({ q, className = 'mt-2' }: { q: TerrainQuality | null; className?: string }) {
  if (!q) return null;
  return <p className={`text-[15px] text-ink-2 ${className}`}>{groundWords(q)}</p>;
}
