import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER, type PowerConfig } from '../engine/power';
import { LANDER_PRESETS } from '../lander';
import { DEFAULT_PARAMS, type PlannerParams } from '../store/explore';
import { NO_REQUIREMENTS, type Requirements } from '../plan/requirements';
import { LINK_DEFAULTS, mergeSettings, parseRequirements, parseSettings, replaceSettings, REQUIREMENT_NAMES, requirementEntries, SETTING_NAMES, settingsEntries, withSettings } from './settings';

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
});

describe('the requirements a link carries', () => {
  const all: Requirements = { minPoweredH: 120, contactWithinH: 0, maxOutageH: 72, minPoweredContactH: 24 };

  it('writes each requirement that is set, in hours, after the settings, and none when none is set', () => {
    expect(requirementEntries(NO_REQUIREMENTS)).toEqual([]);
    expect(withSettings('/explore?site=haworth', DEFAULT_PARAMS, NO_REQUIREMENTS)).toBe('/explore?site=haworth');
    expect(withSettings('/explore?site=haworth', params({ loadW: 400 }), { ...NO_REQUIREMENTS, minPoweredH: 120, contactWithinH: 0 })).toBe('/explore?site=haworth&load=400&minpower=120&earthby=0');
    expect(withSettings('/brief', DEFAULT_PARAMS, all)).toBe('/brief?minpower=120&earthby=0&maxgap=72&mincontact=24');
    // Every requirement has a name in a link, and none takes a setting's.
    expect(Object.keys(REQUIREMENT_NAMES).sort()).toEqual(Object.keys(NO_REQUIREMENTS).sort());
    for (const name of Object.values(REQUIREMENT_NAMES)) expect(Object.values(SETTING_NAMES)).not.toContain(name);
  });

  it('reads back exactly the requirements it wrote', () => {
    for (const req of [all, { ...NO_REQUIREMENTS, maxOutageH: 79.5 }, { ...NO_REQUIREMENTS, minPoweredContactH: 2160 }]) {
      const href = withSettings('/explore?site=haworth', params({ batteryWh: 9000 }), req);
      const read = parseRequirements(href.slice(href.indexOf('?')));
      expect({ ...NO_REQUIREMENTS, ...read }).toEqual(req);
    }
    // The settings beside them read back as they were.
    const href = withSettings('/explore?site=haworth', params({ batteryWh: 9000 }), all);
    expect(parseSettings(href.slice(href.indexOf('?')))).toEqual({ power: { batteryWh: 9000 } });
  });

  it('leaves out a requirement it cannot use, as a bad setting is left out, and takes the rest', () => {
    expect(parseRequirements('?minpower=lots&earthby=&maxgap=-1&mincontact=2161')).toEqual({});
    expect(parseRequirements('?minpower=1e2&maxgap=0x10&earthby=Infinity&mincontact=24')).toEqual({ minPoweredH: 100, minPoweredContactH: 24 });
    expect(parseRequirements('')).toEqual({});
    expect(parseRequirements(new URLSearchParams('site=haworth&load=400'))).toEqual({});
  });

  it('puts the current requirements in an address in place of the ones it had, every other part kept', () => {
    expect(replaceSettings('?site=x&hour=10&minpower=48&quality=fast', DEFAULT_PARAMS, { ...NO_REQUIREMENTS, maxOutageH: 72 })).toBe('?site=x&hour=10&quality=fast&maxgap=72');
    expect(replaceSettings('?site=x&maxgap=72&battery=6000', params({ batteryWh: 6000 }), NO_REQUIREMENTS)).toBe('?site=x&battery=6000');
  });
});
