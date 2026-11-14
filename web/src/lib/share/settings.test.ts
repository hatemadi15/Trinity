import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER, type PowerConfig } from '../engine/power';
import { LANDER_PRESETS } from '../lander';
import { DEFAULT_PARAMS, type PlannerParams } from '../store/explore';
import { LINK_DEFAULTS, mergeSettings, parseSettings, SETTING_NAMES, settingsEntries, withSettings } from './settings';

const params = (power: Partial<PowerConfig> = {}, rest: Partial<Omit<PlannerParams, 'power'>> = {}): PlannerParams => ({ ...DEFAULT_PARAMS, ...rest, power: { ...DEFAULT_POWER, ...power } });

describe('the settings a link carries', () => {
  it('leaves the defaults out, so a plain visit keeps its short link', () => {
    expect(LINK_DEFAULTS).toEqual(DEFAULT_PARAMS);
    expect(settingsEntries(DEFAULT_PARAMS)).toEqual([]);
    expect(withSettings('/explore?site=haworth&start=2027-01-01&days=30', DEFAULT_PARAMS)).toBe('/explore?site=haworth&start=2027-01-01&days=30');
  });

  it('writes every setting the figures depend on after the address’s own parameters, in one fixed order', () => {
    const odd = params({ panel: 'vertical', panelAzimuthDeg: 90, areaM2: 8, efficiency: 0.33, loadW: 400, batteryWh: 20000, initialSocFraction: 0.8 }, { mastM: 5, minEarthElDeg: 2.5 });
    expect(withSettings('/explore?site=haworth&start=2027-01-01&days=30', odd)).toBe(
      '/explore?site=haworth&start=2027-01-01&days=30&panel=vertical&facing=90&area=8&efficiency=0.33&load=400&battery=20000&charge=0.8&mast=5&earthmin=2.5',
    );
    // An address without parameters of its own takes them after a question mark.
    expect(withSettings('/brief', params({}, { mastM: 5 }))).toBe('/brief?mast=5');
    // Every field of the power model and the two radio and terrain settings has a name in a link.
    expect(Object.keys(SETTING_NAMES).sort()).toEqual([...Object.keys(DEFAULT_POWER), 'mastM', 'minEarthElDeg'].sort());
  });

  it('names a ready-made lander by its three numbers', () => {
    const medium = LANDER_PRESETS.find((p) => p.id === 'medium')!;
    expect(settingsEntries(params(medium.power))).toEqual([
      ['area', '8'],
      ['load', '400'],
      ['battery', '20000'],
    ]);
  });

  it('reads back exactly the numbers it wrote, a typed percentage’s long fraction included', () => {
    const typed = params({ efficiency: 33.3 / 100, initialSocFraction: 0.35, areaM2: 2.5 }, { mastM: 2.5, minEarthElDeg: 0.5 });
    const href = withSettings('/explore?site=haworth', typed);
    expect(mergeSettings(DEFAULT_PARAMS, parseSettings(href.slice(href.indexOf('?'))))).toEqual(typed);
  });

  it('leaves out what it cannot use, as a bad date is left out, and takes the rest', () => {
    expect(parseSettings('?mast=5&load=lots&battery=&area=-4&efficiency=0.9&panel=sideways&earthmin=2&charge=1')).toEqual({ mastM: 5, minEarthElDeg: 2, power: { initialSocFraction: 1 } });
    expect(parseSettings('?mast=1e1')).toEqual({ mastM: 10 });
    expect(parseSettings('?mast=11&facing=361&load=0x10&charge=Infinity')).toEqual({});
    expect(parseSettings('?panel=horizontal')).toEqual({ power: { panel: 'horizontal' } });
    expect(parseSettings('')).toEqual({});
    expect(parseSettings(new URLSearchParams('site=haworth&start=2027-01-01&days=30'))).toEqual({});
  });

  it('applies a link’s settings over the current ones and keeps those the link does not name', () => {
    const current = params({ loadW: 400 }, { mastM: 5 });
    expect(mergeSettings(current, { power: { batteryWh: 9000 }, minEarthElDeg: 1 })).toEqual(params({ loadW: 400, batteryWh: 9000 }, { mastM: 5, minEarthElDeg: 1 }));
    expect(mergeSettings(current, {})).toEqual(current);
  });
});
