import { describe, expect, it } from 'vitest';
import { readJson } from '../engine/__tests__/helpers';
import { landedWords, POINT_KINDS, pointKind, radiusText, type PointKind } from './kind';
import type { Site } from './loaders';

const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
const byId = (id: string) => sites.find((s) => s.id === id)!;

describe('the kind of point a site is', () => {
  it('gives every catalogue site one of the five kinds, with the radius its source states', () => {
    for (const s of sites) {
      const k = pointKind(s);
      expect(POINT_KINDS, s.id).toContain(k.kind);
      expect(k.kind, s.id).not.toBe('picked');
      expect(k.radiusKm, s.id).toBe(s.uncertainty_km ?? null);
    }
    const count = (kind: PointKind) => sites.filter((s) => pointKind(s).kind === kind).length;
    expect([count('surveyed'), count('target'), count('region_centre'), count('derived'), count('reference')]).toEqual([15, 5, 9, 2, 3]);
  });

  it('says what a surveyed point, a target and a region centre are, with the radius where it is known', () => {
    expect(pointKind(byId('apollo_11'))).toEqual({
      kind: 'surveyed',
      radiusKm: null,
      short: 'Surveyed point',
      sentence: 'A surveyed point: the lander has been found in images taken from orbit.',
    });
    expect(pointKind(byId('change4')).short).toBe('Surveyed point, ±20 m');
    expect(pointKind(byId('change4')).sentence).toBe('A surveyed point: the lander has been found in images taken from orbit, to within 20 m.');
    expect(pointKind(byId('luna25_target')).short).toBe('Landing target, ±15 km');
    expect(pointKind(byId('luna25_target')).sentence).toBe('A landing target: a point chosen in advance, give or take 15 km, not a place where a lander stands.');
    expect(pointKind(byId('haworth')).short).toBe('Centre of a region, ±5 km');
    expect(pointKind(byId('haworth')).sentence).toBe('The rough centre of a wider region, give or take 5 km, not a chosen landing point.');
    expect(pointKind(byId('malapert_massif')).short).toBe('Centre of a region');
    expect(pointKind(byId('cp12_schrodinger')).short).toBe('Centre of a region, ±158 km');
    expect(pointKind(byId('south_pole')).sentence).toBe('A reference point to compare with, not a landing site.');
  });

  it('never presents a derived high point as a place checked for landing', () => {
    for (const id of ['shackleton_center_rim_high', 'de_gerlache_center_rim_high']) {
      const k = pointKind(byId(id));
      expect(k.kind).toBe('derived');
      expect(k.short).toBe('Derived high point, not checked as safe to land');
      expect(k.sentence).toBe("A derived point: the highest ground on the crater rim in NASA's height data, worked out by this app. It has not been checked as a safe place to land.");
    }
  });

  it('calls a point picked on the map the user’s own', () => {
    const custom: Site = { id: 'custom_-89.5000_10.0000', name: 'Custom site', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };
    expect(pointKind(custom)).toMatchObject({ kind: 'picked', radiusKm: null, short: 'Point you chose' });
  });

  it('writes a radius in metres below a kilometre and in kilometres above', () => {
    expect(radiusText(0.02)).toBe('20 m');
    expect(radiusText(0.03)).toBe('30 m');
    expect(radiusText(5)).toBe('5 km');
    expect(radiusText(158)).toBe('158 km');
  });
});

describe('the day a lander landed', () => {
  it('opens a landing inside the 2024 to 2036 table on the first whole hour after it', () => {
    expect(landedWords(byId('change6'))).toEqual({ date: '1 June 2024', inTable: true, startUtc: '2024-06-01T23:00:00' });
    expect(landedWords(byId('slim'))).toEqual({ date: '19 January 2024', inTable: true, startUtc: '2024-01-19T16:00:00' });
    expect(landedWords(byId('im2_athena'))?.startUtc).toBe('2025-03-06T18:00:00');
  });

  it('never offers a day before the table: Apollo and the landers before 2024 keep only their date', () => {
    for (const id of ['apollo_11', 'apollo_17', 'change3', 'change4', 'change5', 'chandrayaan3_vikram']) {
      const w = landedWords(byId(id))!;
      expect(w.inTable, id).toBe(false);
      expect(w.startUtc, id).toBeNull();
    }
    expect(landedWords(byId('apollo_11'))!.date).toBe('20 July 1969');
  });

  it('has no landing day for a target or a region: nothing landed there', () => {
    for (const id of ['luna25_target', 'im3_reiner_gamma', 'cp12_schrodinger', 'haworth']) expect(landedWords(byId(id)), id).toBeNull();
  });
});
