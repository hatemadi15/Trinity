import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER, type PowerConfig } from '../engine/power';
import { LANDER_PRESETS } from '../lander';
import { DEFAULT_PARAMS, type PlannerParams } from '../store/explore';
import { LINK_DEFAULTS, mergeSettings, parseRank, parseSettings, rankEntry, replaceSettings, SETTING_NAMES, settingsEntries, withSettings } from './settings';

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

  it('puts the current settings in an address in place of the ones it had, and leaves every other part as it was', () => {
    const was = '?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&battery=6000&quality=fast&earthmin=1';
    expect(replaceSettings(was, params({ loadW: 400, batteryWh: 6000 }))).toBe('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&quality=fast&load=400&battery=6000');
    expect(replaceSettings(was, DEFAULT_PARAMS)).toBe('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&quality=fast');
    expect(replaceSettings('', params({}, { mastM: 5 }))).toBe('?mast=5');
    expect(replaceSettings('?quality=fast', DEFAULT_PARAMS)).toBe('?quality=fast');
    expect(replaceSettings('?mast=5', DEFAULT_PARAMS)).toBe('');
  });

  it('carries the priorities the recommendations are ranked by beside the other settings, and the default ranking not at all', () => {
    const href = '/explore?site=haworth&start=2027-01-01&days=30';
    expect(rankEntry({ kind: 'power' })).toBeNull();
    expect(withSettings(href, DEFAULT_PARAMS, { kind: 'power' })).toBe(href);
    // A named profile by its name, weights of one's own as three numbers: power, Earth in view, shorter gaps.
    expect(withSettings(href, DEFAULT_PARAMS, { kind: 'weighed', priorities: { power: 1, contact: 1, gap: 1 } })).toBe(`${href}&rank=balanced`);
    expect(withSettings(href, params({ loadW: 400 }), { kind: 'weighed', priorities: { power: 1, contact: 5, gap: 1 } })).toBe(`${href}&load=400&rank=contact`);
    expect(withSettings(href, DEFAULT_PARAMS, { kind: 'weighed', priorities: { power: 1, contact: 7, gap: 3 } })).toBe(`${href}&rank=1%2C7%2C3`);
    expect(parseRank('?rank=balanced')).toEqual({ kind: 'weighed', priorities: { power: 1, contact: 1, gap: 1 } });
    expect(parseRank('?rank=1,7,3')).toEqual({ kind: 'weighed', priorities: { power: 1, contact: 7, gap: 3 } });
    expect(parseRank('?rank=power')).toEqual({ kind: 'weighed', priorities: { power: 5, contact: 1, gap: 1 } });
    // None asked for, or one the rule cannot use: the link leaves the ranking as it is.
    for (const bad of ['', '?rank=', '?rank=0,0,0', '?rank=1,2', '?rank=-1,1,1', '?rank=500,1,1', '?rank=fast', '?rank=0x1,1,1']) expect(parseRank(bad)).toBeNull();
    // Following a change, the address drops the old ranking and writes the new one.
    expect(replaceSettings('?site=haworth&rank=gap&hour=3', DEFAULT_PARAMS, { kind: 'weighed', priorities: { power: 5, contact: 1, gap: 1 } })).toBe('?site=haworth&hour=3&rank=power');
    expect(replaceSettings('?site=haworth&rank=gap', DEFAULT_PARAMS)).toBe('?site=haworth');
  });
});
