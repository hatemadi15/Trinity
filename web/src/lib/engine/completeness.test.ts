import { describe, expect, it } from 'vitest';
import { computedReport, featuredReport, flatReport, unreportedReport, type TerrainFindings } from './completeness';
import type { Coverage } from './horizon';

/** A march that found terrain at every step of every ray. */
function coverage(patch: Partial<Coverage> = {}): Coverage {
  return {
    samples: 1_319_760,
    missing: 0,
    ranges: [
      { fromM: 0, toM: 6_000, samples: 36_000, missing: 0 },
      { fromM: 6_000, toM: 100_000, samples: 564_480, missing: 0 },
      { fromM: 100_000, toM: 220_000, samples: 719_280, missing: 0 },
    ],
    nearestMissingM: null,
    openAzimuths: 0,
    nAz: 720,
    absentTiles: [],
    failedTiles: [],
    ...patch,
  };
}

function findings(patch: Partial<TerrainFindings> = {}, cov: Partial<Coverage> = {}): TerrainFindings {
  return { coverage: coverage(cov), fallbackBands: [], siteGrid: 'L0', plannedSiteGrid: 'L0', terrain: { version: 1, generatedUtc: '2026-11-12T09:07:07+00:00' }, ...patch };
}

describe('how complete the terrain behind a skyline is', () => {
  it('calls a skyline complete when every step of every ray has terrain from the grid planned for it', () => {
    const r = computedReport(findings(), 5);
    expect(r.quality).toBe('complete');
    expect(r.reasons).toEqual([]);
    expect(r.mastM).toBe(5);
    expect(r.source).toEqual({ kind: 'computed', version: 1, generatedUtc: '2026-11-12T09:07:07+00:00' });
  });

  it('calls it incomplete as soon as one ray has a missing step where a hill could stand above the skyline found', () => {
    const r = computedReport(findings({}, { missing: 95, openAzimuths: 1, nearestMissingM: 100_080, absentTiles: ['L2/7_7'] }), 2);
    expect(r.quality).toBe('incomplete');
    expect(r.reasons).toContainEqual({ kind: 'open', azimuths: 1, nAz: 720, nearestM: 100_080, missingShare: 95 / 1_319_760 });
    expect(r.reasons).toContainEqual({ kind: 'tiles', absent: ['L2/7_7'], failed: [] });
  });

  it('calls it degraded when steps are missing only where no hill could rise above the skyline', () => {
    const r = computedReport(findings({}, { missing: 7_598, openAzimuths: 0, nearestMissingM: 100_080, absentTiles: ['L2/7_7'] }), 2);
    expect(r.quality).toBe('degraded');
    expect(r.reasons).toContainEqual({ kind: 'gaps', missingShare: 7_598 / 1_319_760, nearestM: 100_080 });
  });

  it('calls it degraded when a coarser grid stood in for part of a ray, or for the site’s own height', () => {
    const coarser = computedReport(findings({ fallbackBands: [{ grid: 'L2', rMinM: 6_000, rMaxM: 100_000, stepM: 120 }] }, { absentTiles: ['L1/7_7'] }), 2);
    expect(coarser.quality).toBe('degraded');
    expect(coarser.reasons).toEqual([
      { kind: 'coarser', bands: [{ grid: 'L2', rMinM: 6_000, rMaxM: 100_000, stepM: 120 }] },
      { kind: 'tiles', absent: ['L1/7_7'], failed: [] },
    ]);
    const site = computedReport(findings({ siteGrid: 'L1' }), 2);
    expect(site.quality).toBe('degraded');
    expect(site.reasons).toEqual([{ kind: 'site-grid', grid: 'L1', planned: 'L0' }]);
  });

  it('never calls a computed skyline complete without the march’s own record of what it found', () => {
    const r = unreportedReport(3);
    expect(r.quality).toBe('incomplete');
    expect(r.reasons).toEqual([{ kind: 'unreported' }]);
    expect(r.mastM).toBe(3);
  });

  it('takes a featured file as complete unless it lists a coarser band, and names the file and what made it', () => {
    const doc = {
      site_id: 'im1_odysseus', lat: -80.13, lon: 1.44, mast_m: 2, site_height_m: 2593.39, elevation_deg: [],
      bands: [{ grid: 'ldem_80s_80m', r_min_m: 40, r_max_m: 100_000, step_m: 20 }],
      fallback_bands: [{ grid: 'ldem_60s_240m', r_min_m: 3880, r_max_m: 100_000, step_m: 120 }],
      method: 'Barker et al. 2021 nested-grid horizon', generated_utc: '2026-09-28T20:31:39+00:00',
    };
    const r = featuredReport(doc);
    expect(r.quality).toBe('degraded');
    expect(r.reasons).toEqual([{ kind: 'coarser', bands: [{ grid: 'L2', rMinM: 3880, rMaxM: 100_000, stepM: 120 }] }]);
    expect(r.source).toEqual({ kind: 'featured', file: 'masks/im1_odysseus.json', generatedUtc: '2026-09-28T20:31:39+00:00', method: 'Barker et al. 2021 nested-grid horizon' });
    expect(r.mastM).toBe(2);
    expect(featuredReport({ ...doc, fallback_bands: [] }).quality).toBe('complete');
  });

  it('shows a flat horizon as an assumption, the same from any mast', () => {
    const r = flatReport();
    expect(r.quality).toBe('degraded');
    expect(r.reasons).toEqual([{ kind: 'flat' }]);
    expect(r.mastM).toBeNull();
    expect(r.source).toEqual({ kind: 'flat' });
  });
});
