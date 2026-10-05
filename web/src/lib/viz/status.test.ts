import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '../engine/power';
import { statusSentence } from './status';

const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };

function series(sun: number[], earth: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(sun),
    earthVisible: Uint8Array.from(earth),
    sunAu: new Float64Array(n).fill(1),
  };
}

describe('statusSentence', () => {
  // Sun up, setting, then 14 dark hours (the battery carries ten), rising, up.
  const sun = [1, 1, 0.5, ...new Array<number>(14).fill(0), 0.3, 1, 1];
  const earth = [0, 0, 0, ...new Array<number>(7).fill(1), ...new Array<number>(7).fill(0), 1, 1, 1];
  const s = series(sun, earth);
  const p = powerBudget(s, CFG);

  it('says where the Sun and Earth are and how full the battery is', () => {
    expect(statusSentence(s, p, 0, CFG.batteryWh)).toBe('Sun up, Earth behind a hill, battery 100 %');
    expect(statusSentence(s, p, 2, CFG.batteryWh)).toBe('Sun setting, Earth behind a hill, battery 100 %');
    expect(statusSentence(s, p, 5, CFG.batteryWh)).toBe('Sun behind a hill, Earth in view, battery 70 %');
    expect(statusSentence(s, p, 17, CFG.batteryWh)).toMatch(/^Sun rising, Earth in view/);
  });

  it('says when the lander is off', () => {
    expect(p.powered[13]).toBe(0);
    expect(statusSentence(s, p, 13, CFG.batteryWh)).toBe('Sun behind a hill, Earth behind a hill, lander off, battery empty');
    const contact = series(sun, new Array<number>(sun.length).fill(1));
    expect(statusSentence(contact, powerBudget(contact, CFG), 13, CFG.batteryWh)).toBe('Sun behind a hill, Earth in view but the lander is off, battery empty');
  });

  it('leaves the battery out before the power budget is known, and for a lander without one', () => {
    expect(statusSentence(s, null, 0, CFG.batteryWh)).toBe('Sun up, Earth behind a hill');
    expect(statusSentence(s, powerBudget(s, { ...CFG, batteryWh: 0 }), 0, 0)).toBe('Sun up, Earth behind a hill, no battery');
  });

  it('says below the horizon, not behind the hills, when the body is under it', () => {
    const low = { ...series([0, 0], [0, 0]), sunEl: Float64Array.from([-3, -3]), earthEl: Float64Array.from([-4, -4]) };
    expect(statusSentence(low, null, 0, 0)).toBe('Sun below the horizon, Earth below the horizon');
  });

  it('calls a Sun that is partly hidden at a standstill what it is', () => {
    const flat = series([0.4, 0.4, 0.4], [1, 1, 1]);
    expect(statusSentence(flat, null, 1, 0)).toBe('Sun partly behind a hill, Earth in view');
  });
});
