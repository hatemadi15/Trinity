import { describe, expect, it } from 'vitest';
import { HOME } from '../data/home';
import { sites } from '@/test/file-loaders';
import { distanceKm, nearestSites, reliefUV } from './relief';

describe('reliefUV', () => {
  it('puts the pole at the centre and longitude 0 straight up', () => {
    expect(reliefUV(-90, 0, 250)).toEqual({ u: 0.5, v: 0.5 });
    const up = reliefUV(-86, 0, 250);
    expect(up.u).toBeCloseTo(0.5, 6);
    expect(up.v).toBeCloseTo(0.2573, 3);
  });

  it('agrees with the pins the pipeline wrote for the relief picture', () => {
    for (const pin of HOME.relief.sites) {
      const site = sites.find((s) => s.id === pin.id)!;
      const { u, v } = reliefUV(site.lat, site.lon, HOME.relief.half_km);
      expect(u, pin.id).toBeCloseTo(pin.u, 3);
      expect(v, pin.id).toBeCloseTo(pin.v, 3);
    }
  });
});

describe('distances', () => {
  const site = (id: string) => sites.find((s) => s.id === id)!;

  it('measures along the surface of the Moon', () => {
    expect(distanceKm({ lat: -90, lon: 0 }, { lat: -89, lon: 123 })).toBeCloseTo(30.32, 1);
    expect(distanceKm(site('de_gerlache_rim_2'), site('de_gerlache_center_rim_high'))).toBeCloseTo(12.1, 0);
    expect(distanceKm(site('haworth'), site('haworth'))).toBe(0);
  });

  it('lists the nearest catalogue sites, nearest first, without the site itself or custom places', () => {
    const custom = { id: 'custom_x', name: 'Custom', lat: -88.3, lon: -64, category: 'custom', polar: true, source: 'user' };
    const near = nearestSites(site('de_gerlache_rim_2'), [...sites, custom], 3);
    expect(near.map((n) => n.site.id)).toEqual(['de_gerlache_center_rim_high', 'de_gerlache_center', 'south_pole']);
    expect(near[0].km).toBeCloseTo(12.1, 0);
    expect(near.map((n) => n.km)).toEqual([...near.map((n) => n.km)].sort((a, b) => a - b));
  });
});
