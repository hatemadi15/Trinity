'use client';
import type { Site } from '@/lib/data/loaders';
import type { Series } from '@/lib/engine/metrics';
import type { Requirements } from '@/lib/plan/requirements';
import type { PlannerParams } from '@/lib/store/explore';
import { useTerrainVersions, type VersionsDeps } from '@/lib/ensemble/useTerrainVersions';
import { VersionsBody } from './explore/VersionsFold';

/**
 * The brief's printed part on the terrain versions, under how sure the times are: the same landing over every version of
 * the ground, as Explore's fold gives it, in full since a brief is printed. Nothing on a flat horizon.
 */
export function BriefVersions({
  site,
  series,
  params,
  requirements,
  mastM,
  startUtc,
  days,
  deps,
}: {
  site: Site;
  series: Series;
  params: PlannerParams;
  requirements: Requirements;
  /** The height the skyline shown is seen from (m). */
  mastM: number;
  startUtc: string;
  days: number;
  deps?: VersionsDeps;
}) {
  const state = useTerrainVersions({ site, series, hours: series.hours, params, requirements, mastM }, deps);
  if (state.status === 'none' && state.reason === null) return null;
  return (
    <section aria-labelledby="brief-versions" className="flex flex-col gap-1 text-[15px]">
      <h2 id="brief-versions" className="display text-[18px] font-semibold">
        Across terrain versions
      </h2>
      <VersionsBody state={state} startUtc={startUtc} days={days} printed />
    </section>
  );
}
