import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { moonMatrixAt, parseMoonOrientation } from './moonOrientation';

const header = readJson<{ start_utc: string; step_hours: number; count: number }>('data', 'sky', 'moon_me_6h.json');
const table = parseMoonOrientation(readBytes('data', 'sky', 'moon_me_6h.f32').buffer as ArrayBuffer, header);

/** Angle (degrees) of the rotation between two row-major 3×3 matrices. */
function angleDeg(a: number[], b: number[]): number {
  let tr = 0;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) tr += a[i * 3 + k] * b[i * 3 + k];
  return (Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2))) * 180) / Math.PI;
}

describe('the Moon’s orientation', () => {
  it('matches SPICE at 60 off-grid times to 0.001°', () => {
    const { cases } = readJson<{ cases: { utc: string; matrix: number[] }[] }>('data', 'fixtures', 'sky', 'moon_orientation_offgrid.json');
    expect(cases.length).toBe(60);
    for (const c of cases) expect(angleDeg(moonMatrixAt(table, Date.parse(c.utc + 'Z')), c.matrix), c.utc).toBeLessThan(0.001);
  });

  it('clamps before the first and after the last sample instead of reading outside the table', () => {
    const before = moonMatrixAt(table, Date.parse('2023-06-01T00:00:00Z'));
    const first = moonMatrixAt(table, Date.parse(header.start_utc + 'Z'));
    expect(before.every(Number.isFinite)).toBe(true);
    expect(angleDeg(before, first)).toBeLessThan(1e-9);
    expect(moonMatrixAt(table, Date.parse('2040-01-01T00:00:00Z')).every(Number.isFinite)).toBe(true);
  });
});
