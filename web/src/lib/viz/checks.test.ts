import { describe, expect, it } from 'vitest';
import type { BackcastsDoc, HorizonsDoc, MazaricoDoc, PowerDoc, ValidationDocs } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { appAnswer, checksVerdict, evidenceCards, POWER_TOLERANCE } from './checks';

const docs: ValidationDocs = {
  horizons: readJson<HorizonsDoc>('data', 'validation', 'horizons.json'),
  mazarico: readJson<MazaricoDoc>('data', 'validation', 'mazarico.json'),
  power: readJson<PowerDoc>('data', 'validation', 'power.json'),
  backcasts: readJson<BackcastsDoc>('data', 'validation', 'backcasts.json'),
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const part = (card: ReturnType<typeof evidenceCards>[number], label: string) => card.parts.find((p) => p.label === label)?.text ?? '';

describe('evidenceCards', () => {
  it('gives four kinds of evidence in order: three checks, then the missions as context', () => {
    const cards = evidenceCards(docs);
    expect(cards.map((c) => c.id)).toEqual(['directions', 'sunlight', 'sums', 'missions']);
    expect(cards.map((c) => c.title)).toEqual(['Where the Sun and Earth are in the sky', 'How much sunlight a site gets', 'The power and battery sums', 'When night falls on a real mission']);
    expect(cards.map((c) => c.kind)).toEqual(['check', 'check', 'check', 'context']);
  });

  it('says for every check what it shows, when it passes, what it was tested on and what it leaves out', () => {
    for (const card of evidenceCards(docs).filter((c) => c.kind === 'check')) {
      expect(card.parts.map((p) => p.label)).toEqual(['What it shows', 'Passes when', 'Tested on', 'What it leaves out']);
      for (const p of card.parts) expect(p.text, `${card.id}: ${p.label}`).toMatch(/^[A-Z0-9].{30,}\.$/);
    }
  });

  it('passes the directions check under the 0.01° target, with its coverage from the table and its limits', () => {
    const c = evidenceCards(docs)[0];
    expect(c).toMatchObject({ pass: true, mark: 'Passes: under the 0.01° target', figure: '0.00003°', figureWords: 'the largest gap in 300 test cases' });
    expect(c.sentence).toMatch(/^Our directions to the Sun and Earth against JPL Horizons, NASA's own position calculator/);
    expect(part(c, 'Tested on')).toBe('6 sites, the Sun and Earth, every 30 days from 1 January 2025 to 22 December 2026 at 00:00 UTC: 300 test cases.');
    expect(part(c, 'What it leaves out')).toMatch(/not the tables/);
    expect(part(c, 'What it leaves out')).toMatch(/whole hour/);
    expect(part(c, 'What it shows')).toMatch(/does not involve hills or sunlight/);
    const off = evidenceCards({ ...docs, horizons: { ...docs.horizons, max_abs_delta_el_deg: 0.02 } })[0];
    expect(off).toMatchObject({ pass: false, mark: 'Misses the 0.01° target' });
  });

  it('judges the sunlight check on the comparison made the map’s way, and shows the app’s own gap beside it', () => {
    const c = evidenceCards(docs)[1];
    const covered = docs.mazarico.rows.filter((r) => r.covered && r.sun && r.earth);
    const typical = median(covered.map((r) => Math.abs(r.sun!.gap_points)));
    const earth = median(covered.map((r) => Math.abs(r.earth!.gap_points)));
    const app = median(covered.map((r) => Math.abs(r.sun!.app_gap_points)));
    expect(covered).toHaveLength(15);
    expect(c).toMatchObject({ pass: true, mark: 'Passes: the typical gap is under 5 points', figure: `${typical.toFixed(1)} points` });
    expect(c.figureWords).toBe("the typical gap at 15 sites, worked out the map's way; 72 % against 70 % is a gap of 2 points");
    expect(c.sentence).toMatch(/averaged over 18\.6 years/);
    expect(c.sentence).toMatch(/from the ground, on 60 m terrain, any part of the Sun counting/);
    expect(c.sentence).toContain(`for Earth in view the typical gap is ${earth.toFixed(1)} points`);
    expect(c.sentence).not.toMatch(/13 years/);
    expect(part(c, 'What it leaves out')).toContain(`a typical ${app.toFixed(1)} points from the map`);
    expect(part(c, 'What it leaves out')).toMatch(/waits for its centre/);
    expect(part(c, 'What it leaves out')).toMatch(/^Ours and NASA's both come from the same laser measurements of the ground/);
    expect(part(c, 'What it leaves out')).toMatch(/, up to 10\.8 at Shackleton crater rim\./);
    expect(part(c, 'Tested on')).toMatch(/^15 of the 18 sites near the south pole/);
    expect(part(c, 'Tested on')).toMatch(/every hour for 18\.6 years from 1 January 2024/);
    // A miss on either map is a miss: forcing every sunlight gap to 9 points, or every Earth gap.
    const far = (key: 'sun' | 'earth') => ({ ...docs.mazarico, rows: docs.mazarico.rows.map((r) => (r.covered && r[key] ? { ...r, [key]: { ...r[key]!, gap_points: 9 } } : r)) });
    for (const key of ['sun', 'earth'] as const) expect(evidenceCards({ ...docs, mazarico: far(key) })[1]).toMatchObject({ pass: false, mark: 'Misses: the typical gap is over 5 points' });
  });

  it('works the power sums out in the browser with the app’s own engine and holds them to the hand answers', () => {
    const c = evidenceCards(docs)[2];
    const n = docs.power.cases.length;
    expect(c).toMatchObject({ pass: true, mark: 'Passes: every case to 0.000001 W', figure: `${n} of ${n}`, figureWords: 'worked cases agree, run in this browser just now' });
    expect(c.sentence).toContain('0.3 × 4 m² × 1,361 W/m² = 1,633.2 W');
    expect(part(c, 'What it leaves out')).toMatch(/^It checks the sums, not real hardware/);
    for (const k of docs.power.cases) {
      const got = appAnswer(k.inputs);
      k.expected.power_w.forEach((w, h) => expect(Math.abs(got.powerW[h] - w)).toBeLessThanOrEqual(POWER_TOLERANCE));
      k.expected.energy_wh.forEach((e, h) => expect(Math.abs(got.energyWh[h] - e)).toBeLessThanOrEqual(POWER_TOLERANCE));
      expect([got.brownoutHours, got.firstBrownoutHour]).toEqual([k.expected.brownout_hours, k.expected.first_brownout_hour]);
    }
    // A wrong hand answer is caught by the browser's own sums, whatever the pipeline said.
    const wrong = { ...docs.power, cases: docs.power.cases.map((k, i) => (i === 0 ? { ...k, expected: { ...k.expected, power_w: k.expected.power_w.map((w) => w + 1) } } : k)) };
    expect(evidenceCards({ ...docs, power: wrong })[2]).toMatchObject({ pass: false, figure: `${n - 1} of ${n}` });
  });

  it('shows the missions as context with no pass mark, and says what they can and cannot tell', () => {
    const c = evidenceCards(docs)[3];
    expect(c).toMatchObject({ kind: 'context', pass: null, mark: 'Context, not a check', figure: '2.4 hours', figureWords: "between Blue Ghost's last reported signal and our predicted sunset" });
    expect(c.parts.map((p) => p.label)).toEqual(['What it can tell', 'What it cannot tell', 'Covers']);
    expect(part(c, 'What it cannot tell')).toMatch(/not sunsets anyone observed/);
    expect(part(c, 'What it cannot tell')).toMatch(/Whether a battery lasts the night/);
    expect(part(c, 'Covers')).toMatch(/^3 landings: IM-1 Odysseus on 22 February 2024, Blue Ghost Mission 1 on 2 March 2025 and IM-2 Athena on 6 March 2025\./);
    expect(c.sentence).toMatch(/Blue Ghost Mission 1 ended within 2\.4 h of the predicted sunset; IM-1 Odysseus and IM-2 Athena ended early for known reasons \(see the numbers\), so their rows only show that the Sun was still up\./);
    expect(c.sentence).not.toMatch(/landing site|died|Passes/);
    // However far the end falls from sunset, context never passes or misses.
    const late = { ...docs.backcasts, rows: docs.backcasts.rows.map((r) => (r.site_id === 'blue_ghost_m1' ? { ...r, end_minus_sunset_h: 30 } : r)) };
    expect(evidenceCards({ ...docs, backcasts: late })[3]).toMatchObject({ pass: null, mark: 'Context, not a check' });
  });
});

describe('checksVerdict', () => {
  it('counts the checks that meet their criteria in words, of however many there are', () => {
    expect(checksVerdict(3, 3)).toBe('Three checks meet their criteria');
    expect(checksVerdict(2, 3)).toBe('Two of three checks meet their criteria');
    expect(checksVerdict(1, 3)).toBe('One of three checks meets its criteria');
    expect(checksVerdict(0, 3)).toBe('No check meets its criteria');
    expect(checksVerdict(4, 4)).toBe('Four checks meet their criteria');
    expect(checksVerdict(3, 4)).toBe('Three of four checks meet their criteria');
    expect(checksVerdict(1, 4)).toBe('One of four checks meets its criteria');
  });
});
