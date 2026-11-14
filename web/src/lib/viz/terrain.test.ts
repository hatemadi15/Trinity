import { describe, expect, it } from 'vitest';
import { computedReport, featuredReport, flatReport, unreportedReport } from '../engine/completeness';
import type { Answer } from './answer';
import { findingsWith, LOST_TILE } from '@/test/terrain';
import { pendingWords, pickProblem, provenanceWords, skylineProblem, statusLines, terrainDetails, terrainLimitation, terrainTag, trustedAnswer, trustedOverview, withheldNote } from './terrain';

const complete = computedReport(findingsWith(), 5);
const lost = computedReport(findingsWith(LOST_TILE), 5);
const im1 = featuredReport({
  site_id: 'im1_odysseus',
  mast_m: 2,
  fallback_bands: [{ grid: 'ldem_60s_240m', r_min_m: 3880, r_max_m: 100_000, step_m: 120 }],
  generated_utc: '2026-09-28T20:31:39+00:00',
});
const filledTile = computedReport(findingsWith({ absentTiles: ['L1/7_7'] }, { fallbackBands: [{ grid: 'L2', rMinM: 6_000, rMaxM: 100_000, stepM: 120 }] }), 2);

describe('the limits of the terrain, in plain words', () => {
  it('says nothing about a complete terrain', () => {
    expect(terrainLimitation(complete)).toBeNull();
    expect(terrainTag(complete)).toBeNull();
  });

  it('says what is missing from an incomplete terrain, where, and which way it errs', () => {
    expect(terrainLimitation(lost)).toBe(
      'Terrain incomplete: the elevation map is missing in 7 of 720 directions, from 100 km out. Hills there are left out, so the Sun and Earth may be in view less than these figures say.',
    );
    expect(terrainTag(lost)).toBe('terrain incomplete');
    expect(terrainLimitation(unreportedReport(5))).toBe('Terrain unchecked: these hills came without a record of how much of the elevation map was found, so some may be left out.');
  });

  it('names a coarser map standing in, and why: the end of the finer map, or tiles missing from it', () => {
    expect(terrainLimitation(im1)).toBe('Part of the horizon comes from a coarser map: 240 m pixels from 3.9 km to 100 km out, where the 80 m map ends.');
    expect(terrainLimitation(filledTile)).toBe('Part of the horizon comes from a coarser map: 240 m pixels from 6 km to 100 km out, where tiles of the 80 m map are missing.');
    expect(terrainTag(im1)).toBe('coarser map in places');
    const siteGrid = computedReport(findingsWith({}, { siteGrid: 'L1', plannedSiteGrid: 'L0' }), 2);
    expect(terrainLimitation(siteGrid)).toBe('The site’s own height comes from the 80 m map: the 20 m map has no data under it.');
  });

  it('calls a flat horizon an assumption', () => {
    expect(terrainLimitation(flatReport())).toBe('Flat horizon assumed: the elevation maps used here reach only south of 60° S, so the hills around this place are left out.');
    expect(terrainTag(flatReport())).toBe('flat horizon assumed');
  });

  it('says a gap that no hill could rise from leaves the figures as they are', () => {
    const gaps = computedReport(findingsWith({ missing: 7_598, nearestMissingM: 100_080, absentTiles: ['L2/7_7'] }), 2);
    expect(terrainLimitation(gaps)).toBe('Some of the elevation map is missing from 100 km out, but no hill there could rise above the horizon found, so the figures stand.');
    expect(terrainTag(gaps)).toBeNull();
  });

  it('gives a planner every number: where the hills come from, the share with terrain, the gaps by distance and the tiles', () => {
    expect(terrainDetails(lost)).toBe(
      'Terrain incomplete. Terrain found at 99.993 % of the steps along 720 directions out to 220 km; missing: none within 6 km, none from 6 to 100 km, 0.013 % from 100 to 220 km. 7 directions may have hills the map lacks. Tiles not on the server: L2/7_7.',
    );
    expect(terrainDetails(complete)).toBe('Terrain complete: terrain found at every step along 720 directions out to 220 km.');
    expect(terrainDetails(im1)).toBe('Part of the horizon comes from a coarser map: 240 m pixels from 3.9 km to 100 km out, where the 80 m map ends. The file was made from the whole maps, so no piece of them could be missing.');
  });

  it('says where the hills come from and the height they are seen from', () => {
    expect(provenanceWords(im1)).toBe('hills measured from NASA elevation data ahead of time (masks/im1_odysseus.json, made 28 September 2026, from a 2 m mast)');
    expect(provenanceWords(complete)).toBe('hills worked out in your browser from NASA elevation data, from a 5 m mast (tiles cut 12 November 2026)');
    expect(provenanceWords(flatReport())).toBe('a flat horizon, assumed: no polar height data there, and no mast height changes it');
  });
});

describe('what waits and what failed, in plain words', () => {
  it('says how many sites wait for the hills seen from the new height', () => {
    expect(pendingWords(5, 3)).toBe('Working out the hills seen from a 5 m mast for 3 sites…');
    expect(pendingWords(5, 1)).toBe('Working out the hills seen from a 5 m mast…');
  });

  it('says what actually failed: tiles not on this server, a tile that did not load, or a point north of 60° S', () => {
    expect(skylineProblem('could not load /data/tiles/manifest.json (HTTP 404)')).toBe('the elevation map tiles are not on this server');
    expect(skylineProblem('no grid covers site (-88.28, -64.31)')).toBe('no elevation map has data at this point: its tiles are missing or failed to load');
    expect(skylineProblem('tile L1 7_7: HTTP 503')).toBe('a piece of the elevation map failed to load; try again in a minute');
    expect(skylineProblem('Failed to fetch')).toBe('a piece of the elevation map failed to load; try again in a minute');
    expect(skylineProblem('no DEM coverage north of 60S (lat -40.00)')).toBe('this tool covers the Moon south of 60° S');
    expect(pickProblem('no DEM coverage north of 60S (lat -40.00)')).toBe('That place cannot be worked out: this tool covers the Moon south of 60° S.');
    expect(pickProblem('could not load /data/tiles/manifest.json (HTTP 404)')).toBe('That place cannot be worked out: the elevation map tiles are not on this server.');
  });
});

describe('no confident recommendation from an incomplete terrain', () => {
  const answer: Answer = {
    tone: 'bad',
    kind: 'night',
    title: 'Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night',
    sentences: ['No radio contact: Earth is out of view for all 3 days 4 hours with power.'],
    better: { hour: 466, startUtc: '2027-01-20T10:00:00', label: 'Land on 20 January instead', note: 'From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.' },
    hint: null,
    poweredHours: 76,
    contactHours: 0,
  };

  it('keeps the better day of a complete or degraded terrain', () => {
    expect(trustedAnswer(answer, complete, false)).toBe(answer);
    expect(trustedAnswer(answer, im1, false)).toBe(answer);
  });

  it('names no better day from an incomplete terrain, and says why', () => {
    const r = trustedAnswer(answer, lost, false);
    expect(r.better).toBeNull();
    expect(r.hint).toBe('No better landing day is named: the terrain here is incomplete, so these figures may be too high.');
    expect(r.title).toBe(answer.title);
  });

  it('names no better day while the hills for the chosen mast are still being worked out', () => {
    const r = trustedAnswer(answer, complete, true);
    expect(r.better).toBeNull();
    expect(r.hint).toBe('The better landing day waits for the hills seen from the new mast height.');
  });

  it('leaves out of the nearby search every place whose terrain is incomplete, or is from another mast height', () => {
    const o = { a: { nowHours: 300, mastM: 5, terrain: complete }, b: { nowHours: 400, mastM: 5, terrain: lost }, c: { nowHours: 500, mastM: 2, terrain: complete }, d: { nowHours: 200, mastM: 5 } };
    expect(Object.keys(trustedOverview(o, 5))).toEqual(['a']);
  });

  it('says why a measure names no best site', () => {
    expect(withheldNote(['Haworth'], ['the longest time with power', 'the most sunlight'])).toBe(
      'The terrain at Haworth is incomplete, so no site is named for the longest time with power or the most sunlight: its figures may be too high.',
    );
  });
});

describe('the status line a page shows while its hills are worked out', () => {
  const base = { params: { mastM: 5 }, pendingSkylines: [] as string[], skylineProblems: {} as Record<string, string>, site: { id: 'rim' }, maskMeta: { source: 'featured' as const, mastM: 2, siteHeightM: 0, failedTiles: 0 } };

  it('says nothing once every figure on the page is from the chosen mast', () => {
    expect(statusLines({ ...base, maskMeta: { ...base.maskMeta, mastM: 5 } }, ['rim', 'a'], true)).toEqual([]);
  });

  it('counts the sites of the page still waiting, and says what height the selected site’s figures are still from', () => {
    const s = { ...base, pendingSkylines: ['rim', 'a', 'b', 'elsewhere'] };
    expect(statusLines(s, ['rim', 'a', 'b'], true)).toEqual(['Working out the hills seen from a 5 m mast for 3 sites… The figures below are still from 2 m.']);
    expect(statusLines(s, ['a', 'b'], false)).toEqual(['Working out the hills seen from a 5 m mast for 2 sites…']);
  });

  it('says what failed for the selected site, and for the other sites of the page', () => {
    const s = { ...base, skylineProblems: { rim: 'could not load /data/tiles/manifest.json (HTTP 404)', a: 'could not load /data/tiles/manifest.json (HTTP 404)', b: 'tile L1 3_4: HTTP 503' } };
    expect(statusLines(s, ['rim'], true)).toEqual(['The hills seen from a 5 m mast could not be worked out: the elevation map tiles are not on this server. The figures below are still from 2 m.']);
    expect(statusLines(s, ['a', 'b'], false)).toEqual(['The hills seen from a 5 m mast could not be worked out for 2 sites: the elevation map tiles are not on this server.']);
    expect(statusLines(s, ['rim', 'a'], true)).toEqual(['The hills seen from a 5 m mast could not be worked out for 2 sites: the elevation map tiles are not on this server. The figures below are still from 2 m.']);
  });
});
