import { describe, expect, it } from 'vitest';
import type { BackcastsDoc, HorizonsDoc, MazaricoDoc } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { checkCards } from './checks';

const docs = {
  horizons: readJson<HorizonsDoc>('data', 'validation', 'horizons.json'),
  mazarico: readJson<MazaricoDoc>('data', 'validation', 'mazarico.json'),
  backcasts: readJson<BackcastsDoc>('data', 'validation', 'backcasts.json'),
};

describe('checkCards', () => {
  it('gives the three checks in the home page\'s order and words', () => {
    expect(checkCards(docs).map((c) => c.title)).toEqual(['Where the Sun and Earth are in the sky', 'How much sunlight a site gets', 'When night falls on a real mission']);
  });

  it('passes the directions check under the 0.01° target, with the largest gap as its figure', () => {
    const c = checkCards(docs)[0];
    expect(c).toMatchObject({ pass: true, mark: 'Passes: under the 0.01° target', figure: '0.00003°', figureWords: 'the largest gap in 300 test cases' });
    expect(c.sentence).toMatch(/^Our directions to the Sun and Earth against JPL Horizons, NASA's own position calculator/);
    const off = checkCards({ ...docs, horizons: { ...docs.horizons, max_abs_delta_el_deg: 0.02 } })[0];
    expect(off).toMatchObject({ pass: false, mark: 'Misses the 0.01° target' });
  });

  it('passes the sunlight check when the typical gap is within 5 points, and names the largest misses', () => {
    const c = checkCards(docs)[1];
    expect(c).toMatchObject({ pass: true, figure: '2.6 points', figureWords: 'the typical gap at 15 sites; 72 % against 70 % is a gap of 2 points', mark: 'Passes: the typical gap is under 5 points' });
    expect(c.sentence).toMatch(/11 of 15 sites are within 5 points\./);
    const worst = docs.mazarico.rows
      .filter((r) => r.covered && r.delta_points !== undefined)
      .sort((a, b) => Math.abs(b.delta_points!) - Math.abs(a.delta_points!))
      .slice(0, 2)
      .map((r) => r.name);
    for (const name of worst) expect(c.sentence).toContain(name.replace(/\s*\(.*\)$/, '').split(',')[0]);
    expect(c.sentence).toMatch(/are narrow high features; NASA's map averages the ground over 60 m squares, wider than they are\./);
    expect(c.sentence).not.toMatch(/highest point|sampling/);
  });

  it('passes the nights check when the lander that lived to sunset ended within 6 hours of it, and says why the others ended early', () => {
    const c = checkCards(docs)[2];
    expect(c).toMatchObject({ pass: true, figure: '2.4 hours', figureWords: "between Blue Ghost's last signal and our predicted sunset" });
    expect(c.mark).toBe('Passes: within 6 hours of sunset');
    expect(c.sentence).toMatch(/Blue Ghost Mission 1 ended within 2\.4 h of the predicted sunset; IM-1 Odysseus and IM-2 Athena ended early for known reasons \(see the numbers\), so their rows only show that the Sun was still up\./);
    expect(c.sentence).not.toMatch(/landing site|died/);
    const late = { ...docs.backcasts, rows: docs.backcasts.rows.map((r) => (r.site_id === 'blue_ghost_m1' ? { ...r, end_minus_sunset_h: 30 } : r)) };
    expect(checkCards({ ...docs, backcasts: late })[2]).toMatchObject({ pass: false, mark: 'Misses: more than 6 hours from sunset' });
  });
});
