import { describe, expect, it } from 'vitest';
import { verdictFor } from './verdict';

const base = { powerW: new Float64Array(0), energyWh: new Float64Array(0), meanPowerW: 100 };

describe('verdictFor', () => {
  it('good when the battery never empties', () => {
    const v = verdictFor({ ...base, socMin: 0.63, brownoutHours: 0, firstBrownoutHour: null, survives: true });
    expect(v.tone).toBe('good');
    expect(v.label).toBe('Survives the window');
    expect(v.detail).toBe('battery never below 63 %');
  });
  it('bad with the first empty hour and the brownout total', () => {
    const v = verdictFor({ ...base, socMin: 0, brownoutHours: 37, firstBrownoutHour: 118, survives: false });
    expect(v.tone).toBe('bad');
    expect(v.label).toBe('Battery empties after 4 d 22 h');
    expect(v.detail).toBe('37 h without full power');
  });
});
