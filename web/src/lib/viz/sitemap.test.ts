import { describe, expect, it } from 'vitest';
import { HOME } from '@/lib/data/home';
import { layoutSiteMap, onInset, onRelief, RELIEF_BAND, spreadMarkers, type Spot } from './sitemap';

const nearest = (points: { x: number; y: number }[]) => {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
  return min;
};

describe('the layout of the Choose a site map', () => {
  it('fills a wide window with the relief picture, cropped so that every polar site stays in view', () => {
    for (const [w, h] of [[1440, 763], [1920, 943], [1280, 663], [1024, 600]]) {
      const l = layoutSiteMap(w, h, 'fill');
      expect(l.relief.w).toBe(w);
      // The picture covers the box: no edge of it shows.
      expect(l.relief.y).toBeLessThanOrEqual(0);
      expect(l.relief.y + l.relief.h).toBeGreaterThanOrEqual(h);
      for (const p of HOME.relief.sites) {
        const at = onRelief(l, p.u, p.v);
        expect(at.y, `${p.id} at ${w}×${h}`).toBeGreaterThan(20);
        expect(at.y, `${p.id} at ${w}×${h}`).toBeLessThan(h - 20);
        // No polar site lies under the inset of the whole Moon.
        expect(at.x > l.inset.x - 14 && at.y > l.inset.y - 44, `${p.id} under the inset at ${w}×${h}`).toBe(false);
      }
      expect(l.inset.x + l.inset.w).toBeLessThan(w);
      expect(l.inset.y + l.inset.h).toBeLessThan(h);
    }
  });

  it('names the rows of the picture that hold its sites', () => {
    const vs = HOME.relief.sites.map((p) => p.v);
    expect(Math.min(...vs)).toBeGreaterThanOrEqual(RELIEF_BAND.top - 0.001);
    expect(Math.max(...vs)).toBeLessThanOrEqual(RELIEF_BAND.bottom + 0.001);
  });

  it('stacks the whole relief square over the inset on a phone, and takes the height it needs', () => {
    const l = layoutSiteMap(390, 0, 'stack');
    expect(l.relief).toEqual({ x: 0, y: 0, w: 390, h: 390 });
    expect(l.inset.y).toBeGreaterThan(390);
    expect(l.inset.w).toBe(358);
    expect(l.height).toBe(l.inset.y + l.inset.h + 16);
  });

  it('puts 0° of longitude at the centre of the inset, north up', () => {
    const l = layoutSiteMap(1440, 763, 'fill');
    expect(onInset(l, 0, 0)).toEqual({ x: l.inset.x + l.inset.w / 2, y: l.inset.y + l.inset.h / 2 });
    expect(onInset(l, 90, -180).x).toBe(l.inset.x);
    expect(onInset(l, -45.457, 177.589).x).toBeGreaterThan(l.inset.x + 0.99 * l.inset.w);
  });
});

describe('markers that sit close together', () => {
  it('are moved apart on a phone until each has room for a finger, and stay on the map', () => {
    const l = layoutSiteMap(390, 0, 'stack');
    const spots: Spot[] = HOME.relief.sites.map((p) => ({ id: p.id, ...onRelief(l, p.u, p.v), within: l.relief }));
    // At this width the pole, Shackleton's floor and the connecting ridge are under 15 px apart.
    expect(nearest(spots)).toBeLessThan(15);
    const moved = spreadMarkers(spots, 30);
    const at = [...moved.values()];
    expect(nearest(at)).toBeGreaterThanOrEqual(29.5);
    for (const p of at) {
      expect(p.x).toBeGreaterThanOrEqual(15);
      expect(p.x).toBeLessThanOrEqual(375);
    }
    // No marker strays far from its site.
    for (const s of spots) expect(Math.hypot(moved.get(s.id)!.x - s.x, moved.get(s.id)!.y - s.y), s.id).toBeLessThan(40);
    // The same sites give the same picture.
    expect(spreadMarkers(spots, 30)).toEqual(moved);
  });

  it('are left where they are when they have room', () => {
    const spots: Spot[] = [
      { id: 'a', x: 100, y: 100, within: { x: 0, y: 0, w: 400, h: 400 } },
      { id: 'b', x: 200, y: 100, within: { x: 0, y: 0, w: 400, h: 400 } },
    ];
    expect(spreadMarkers(spots, 30).get('a')).toEqual({ x: 100, y: 100 });
  });

  it('parts two sites on the same spot', () => {
    const within = { x: 0, y: 0, w: 400, h: 400 };
    const moved = spreadMarkers([{ id: 'a', x: 100, y: 100, within }, { id: 'b', x: 100, y: 100, within }], 30);
    expect(nearest([...moved.values()])).toBeGreaterThanOrEqual(29.9);
  });
});
