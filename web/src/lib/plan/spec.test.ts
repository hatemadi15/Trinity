import { describe, expect, it } from 'vitest';
import { sites } from '@/test/file-loaders';
import { applyPatch, DEFAULT_SPEC, hearSpec, mergeHeard, specLines, spokenReadBack, whereSites } from './spec';

const EXAMPLE =
  'We need at least five days of power, Earth in view when we land, no radio gap longer than three days, a 300 watt load and a 3 kilowatt-hour battery, landing between March and June 2027, near the Artemis III regions.';

describe('the mission specification, heard in plain words', () => {
  it('reads the example specification field by field, spoken numbers and all', () => {
    const h = hearSpec(EXAMPLE, sites);
    expect(h.patch).toMatchObject({
      minPoweredH: 120,
      contactWithinH: 0,
      maxOutageH: 72,
      loadW: 300,
      batteryWh: 3000,
      fromUtc: '2027-03-01T00:00:00',
      toUtc: '2027-07-01T00:00:00',
      where: { kind: 'category', category: 'artemis3' },
    });
    expect(h.leftover).toEqual([]);
  });

  it('reads other common phrasings: hours, kilowatts, a stay, a mast, named sites and a radius', () => {
    expect(hearSpec('power for at least 36 hours and earth in view within 12 hours of landing', sites).patch).toMatchObject({ minPoweredH: 36, contactWithinH: 12 });
    expect(hearSpec('a 1.5 kw load, battery of 20 kwh, a 6 metre mast, a 10 day mission', sites).patch).toMatchObject({ loadW: 1500, batteryWh: 20000, mastM: 6, stayH: 240 });
    expect(hearSpec('within 40 km of Shackleton crater', sites).patch.where).toEqual({ kind: 'near', id: 'shackleton_center', km: 40 });
    expect(hearSpec('landing in May 2028', sites).patch).toMatchObject({ fromUtc: '2028-05-01T00:00:00', toUtc: '2028-06-01T00:00:00' });
    expect(hearSpec('landing between 3 January and 20 February 2029', sites).patch).toMatchObject({ fromUtc: '2029-01-03T00:00:00', toUtc: '2029-02-21T00:00:00' });
  });

  it('keeps what it could not read, so nothing said is silently lost', () => {
    const h = hearSpec('at least 2 days of power and a purple antenna that sings', sites);
    expect(h.patch.minPoweredH).toBe(48);
    expect(h.leftover).toEqual(['a purple antenna that sings']);
  });

  it('merges a second utterance into the first, changing only what was said', () => {
    const first = mergeHeard(DEFAULT_SPEC, {}, hearSpec(EXAMPLE, sites));
    const second = mergeHeard(first.spec, first.from, hearSpec('make the battery 5 kilowatt hours', sites));
    expect(second.spec.lander.batteryWh).toBe(5000);
    expect(second.spec.lander.loadW).toBe(300);
    expect(second.spec.req.minPoweredH).toBe(120);
    expect(second.from.batteryWh).toBe('heard');
  });

  it('lengthens the stay to the power asked for, and says so', () => {
    const m = mergeHeard(DEFAULT_SPEC, {}, hearSpec('at least 20 days of power', sites));
    expect(m.spec.stayH).toBe(480);
    expect(m.notes.join(' ')).toMatch(/stay is 20 d/);
  });

  it('shows every field with the defaults marked, and reads the heard ones back aloud', () => {
    const m = mergeHeard(DEFAULT_SPEC, {}, hearSpec(EXAMPLE, sites));
    const lines = specLines(m.spec, m.from, sites);
    expect(lines.find((l) => l.label === 'Power from landing')).toMatchObject({ value: 'at least 5 d in a row', isDefault: false });
    expect(lines.find((l) => l.label === 'Stay')).toMatchObject({ value: '14 d', isDefault: true });
    expect(lines.find((l) => l.label === 'Panel')?.value).toBe('4 m², turns to the Sun');
    expect(lines.find((l) => l.label === 'Landing window')?.value).toBe('1 March to 30 June 2027, UTC');
    const said = spokenReadBack(m.spec, m.from, sites);
    expect(said).toMatch(/^I heard: at least 5 days of power, Earth in view at landing, no more than 3 days without Earth while powered, a 300 watt load, a 3 kilowatt-hour battery, landing from 1 March to 30 June 2027 UTC, at the Artemis III regions\./);
    expect(said).toMatch(/Say search to start/);
  });

  it('turns where to look into the sites to try, a derived high point only when named', () => {
    expect(whereSites({ kind: 'category', category: 'artemis3' }, sites).map((s) => s.id)).toHaveLength(9);
    const derived = sites.filter((s) => s.kind === 'derived');
    expect(derived.length).toBeGreaterThan(0);
    expect(whereSites({ kind: 'all' }, sites).length).toBe(sites.length - derived.length);
    const near = whereSites({ kind: 'near', id: 'shackleton_center', km: 40 }, sites).map((s) => s.id);
    expect(near).toContain('shackleton_center');
    expect(near).toContain('connecting_ridge');
    expect(near).not.toContain('shackleton_center_rim_high');
    expect(near).not.toContain('nobile_rim_2');
    expect(whereSites({ kind: 'sites', ids: ['shackleton_center_rim_high'] }, sites)).toHaveLength(1);
  });

  it('reads back a ranking by priorities with its weights, on the page and aloud', () => {
    const { spec, from } = applyPatch(DEFAULT_SPEC, {}, { objective: 'weighed', priorities: { power: 1, contact: 7, gap: 3 } }, 'edited');
    expect(specLines(spec, from, sites).find((l) => l.label === 'Ranked by')).toEqual({ label: 'Ranked by', value: 'requirements met first, then your priorities (power 1, Earth in view 7, shorter gaps 3)', isDefault: false });
    expect(spokenReadBack(spec, from, sites)).toContain('ranked by your priorities (power 1, Earth in view 7, shorter gaps 3)');
    expect(DEFAULT_SPEC.priorities).toEqual({ power: 1, contact: 1, gap: 1 });
  });
});
