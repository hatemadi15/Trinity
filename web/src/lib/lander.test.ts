import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from './engine/power';
import { batteryHours, landerLine, landerName, LANDER_PRESETS, presetOf } from './lander';
import { POWER_RANGES } from './planner-ranges';

describe('lander presets', () => {
  it('names three landers by their numbers, the first being the default', () => {
    expect(LANDER_PRESETS.map((p) => p.label)).toEqual(['4 m² panel, 200 W, 2 kWh battery', '8 m² panel, 400 W, 20 kWh battery', '20 m² panel, 500 W, 50 kWh battery']);
    expect(presetOf(DEFAULT_POWER)?.id).toBe('small');
    expect(landerName(DEFAULT_POWER)).toBe('4 m² panel, 200 W, 2 kWh battery');
  });

  it('stays inside the ranges the settings accept', () => {
    for (const p of LANDER_PRESETS) {
      expect(p.power.areaM2).toBeLessThanOrEqual(POWER_RANGES.areaM2.max);
      expect(p.power.loadW).toBeLessThanOrEqual(POWER_RANGES.loadW.max);
      expect(p.power.batteryWh).toBeLessThanOrEqual(POWER_RANGES.batteryWh.max);
    }
  });

  it('calls anything else a custom lander', () => {
    expect(presetOf({ ...DEFAULT_POWER, loadW: 250 })).toBeNull();
    expect(presetOf({ ...DEFAULT_POWER, panel: 'horizontal' })).toBeNull();
    expect(landerName({ ...DEFAULT_POWER, loadW: 250 })).toBe('Custom lander');
  });

  it('describes a lander in one line and says how long its battery lasts in the dark', () => {
    expect(landerLine(DEFAULT_POWER)).toBe('4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery');
    expect(landerLine({ ...DEFAULT_POWER, panel: 'horizontal', areaM2: 2.5, loadW: 1500, batteryWh: 500 })).toBe('flat 2.5 m² panel, uses 1.5 kW, 0.5 kWh battery');
    expect(landerLine({ ...DEFAULT_POWER, panel: 'vertical', panelAzimuthDeg: 90 })).toBe('upright 4 m² panel facing 90°, uses 200 W, 2 kWh battery');
    expect(landerLine({ ...DEFAULT_POWER, panel: 'full_tracking' })).toBe('4 m² panel that follows the Sun, uses 200 W, 2 kWh battery');
    expect(batteryHours(DEFAULT_POWER)).toBe(10);
    expect(batteryHours({ ...DEFAULT_POWER, loadW: 0 })).toBe(Infinity);
  });
});
