import { describe, expect, it } from 'vitest';
import { checkPick } from './pick';

describe('checkPick', () => {
  it('globe pick north of 60S is refused with the coverage message', () => {
    const r = checkPick(18.56, 61.81);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/no DEM coverage north of 60S/);
  });
  it('accepts polar picks and normalises longitude', () => {
    const r = checkPick(-88.5, 200);
    expect(r).toEqual({ ok: true, lat: -88.5, lon: -160 });
  });
  it('rejects non-finite input', () => {
    expect(checkPick(NaN, 0).ok).toBe(false);
  });
});
