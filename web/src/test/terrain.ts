import type { TerrainFindings } from '@/lib/engine/completeness';
import type { Coverage } from '@/lib/engine/horizon';

/** What a march over a full map reports: every 120 m step of the 720 rays out to 220 km has a height. */
export function fullCoverage(patch: Partial<Coverage> = {}): Coverage {
  return {
    samples: 1_319_760,
    missing: 0,
    nearestMissingM: null,
    openAzimuths: 0,
    nAz: 720,
    absentTiles: [],
    failedTiles: [],
    ranges: [
      { fromM: 0, toM: 6_000, samples: 36_000, missing: 0 },
      { fromM: 6_000, toM: 100_000, samples: 564_480, missing: 0 },
      { fromM: 100_000, toM: 220_000, samples: 719_280, missing: 0 },
    ],
    ...patch,
  };
}

/** The worker's record for a skyline traced through the tiles, complete unless `coverage` says otherwise. */
export function findingsWith(coverage: Partial<Coverage> = {}, patch: Partial<TerrainFindings> = {}): TerrainFindings {
  return { coverage: fullCoverage(coverage), fallbackBands: [], siteGrid: 'L1', plannedSiteGrid: 'L1', terrain: { version: 1, generatedUtc: '2026-11-12T09:07:07+00:00' }, ...patch };
}

/** A 240 m tile 100 km out lost to a 404: 95 steps without terrain, and seven rays where a hill there could rise above the skyline. */
export const LOST_TILE: Partial<Coverage> = {
  missing: 95,
  openAzimuths: 7,
  nearestMissingM: 100_080,
  absentTiles: ['L2/7_7'],
  ranges: [
    { fromM: 0, toM: 6_000, samples: 36_000, missing: 0 },
    { fromM: 6_000, toM: 100_000, samples: 564_480, missing: 0 },
    { fromM: 100_000, toM: 220_000, samples: 719_280, missing: 95 },
  ],
};
