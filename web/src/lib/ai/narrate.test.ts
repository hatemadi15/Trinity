import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { hasFile, readBytes, readJson } from '../engine/__tests__/helpers';
import { DEFAULT_POWER, type PanelModel } from '../engine/power';
import { createExploreStore } from '../store/explore';
import { checkNumbers, cleanNarration, narrationPrompt, narrationProblems, numbersIn, stripForeignNumbers, templateBrief } from './narrate';
import { summarizeState, type StateSummary } from './state-summary';

const summary: StateSummary = {
  site: { id: 'nobile_rim_2', name: 'Nobile Rim 2 (Artemis III region)', label: 'Nobile Rim 2', lat: -84.20156, lon: 60.69989 },
  window: { startUtc: '2027-03-01T00:00:00', days: 14 },
  summary: { hours: 336, illumFraction: 1, meanSunFraction: 0.998, longestDarkH: 0, earthVisFraction: 0.67, longestEarthGapH: 225, jointFraction: 0.67 },
  power: { socMin: 1, brownoutHours: 0, survives: true, meanPowerW: 1118.4, poweredHours: 336, contactHours: 225 },
  params: { power: DEFAULT_POWER, minEarthElDeg: 0, mastM: 2 },
  compare: [],
};

describe('numbersIn', () => {
  it('extracts every number, with thousands separators removed', () => {
    expect(numbersIn('Sun 100 % of the time; gap 9 d 9 h, load 200 W, 2,000 Wh, 1.5° above')).toEqual(['100', '9', '9', '200', '2000', '1.5']);
    expect(numbersIn('no digits here')).toEqual([]);
  });

  it('keeps a minus sign, and reads a hyphen between words or numbers as no sign', () => {
    expect(numbersIn('-3 degrees, (−84.2°), from 1-15 March, IM-1')).toEqual(['-3', '-84.2', '1', '15', '1']);
  });
});

describe('checkNumbers', () => {
  it('accepts a reply whose numbers all come from the state, in any of the usual forms', () => {
    expect(checkNumbers('Sun above the skyline 100 % of the time; longest Earth gap 9 d 9 h', summary)).toBe(true);
    expect(checkNumbers('Earth in view 67.0 % (0.67) of the 336 hours, longest gap 225 h or about 9.4 days; 14-day window from 1 March 2027', summary)).toBe(true);
    expect(checkNumbers('At 84.2°S, 60.7°E with a 2 m mast, a 4 m² panel at 30 %, a 200 W load and a 2000 Wh battery, mean power 1118 W', summary)).toBe(true);
    expect(checkNumbers('No numbers at all.', summary)).toBe(true);
  });

  it('rejects invented figures', () => {
    expect(checkNumbers('Sun above the skyline 87 % of the time', summary)).toBe(false);
    expect(checkNumbers('longest Earth gap 10 d', summary)).toBe(false);
    expect(checkNumbers('a 3000 Wh battery', summary)).toBe(false);
  });
});

describe('templateBrief', () => {
  it('is deterministic, names the site and how long the power lasts, in the verdict\'s words, and passes its own number check', () => {
    const a = templateBrief(summary);
    expect(templateBrief(summary)).toBe(a);
    expect(a).toMatch(/^Nobile Rim 2 \(84\.202°S, 60\.700°E\), 14 days from 1 March 2027: /);
    expect(a).toMatch(/landing on 1 March, keeps power for all 14 days, with Earth in view for 9 days 9 hours of that time\.$/);
    // The paragraph's figures read as the page prints them: whole percents, kWh.
    expect(a).toMatch(/sunlight 100\u00a0% of the time/);
    expect(a).not.toMatch(/\d\.\d\s?%/);
    expect(a).toMatch(/a 2 kWh battery/);
    expect(a).not.toMatch(/surviv|skyline|window/);
    // Every percent keeps its sign on the same line, as pct0 writes it.
    expect(a).toMatch(new RegExp(`A lander with a ${DEFAULT_POWER.areaM2} m² upright panel that turns to the Sun \\(${Math.round(DEFAULT_POWER.efficiency * 100)}\u00a0% efficiency\\), a ${DEFAULT_POWER.loadW} W load`));
    expect(a).toMatch(/starting 100\u00a0% full/);
    expect(a).not.toMatch(/\d %/);
    expect(checkNumbers(a, summary)).toBe(true);
  });

  it('says when the power ends and when there is no radio contact', () => {
    const dark: StateSummary = { ...summary, summary: { ...summary.summary, longestDarkH: 40 }, power: { socMin: 0, brownoutHours: 37, survives: false, meanPowerW: 40.2, poweredHours: 37, contactHours: 0, endsAtNight: true } };
    const b = templateBrief(dark);
    expect(b).toMatch(/has power for 1 day 13 hours, then night, with no radio contact in that time\.$/);
    expect(checkNumbers(b, dark)).toBe(true);
  });

  it('says "then too little sunlight", as the verdict does, when power ends with the Sun up', () => {
    const lowSun: StateSummary = { ...summary, power: { socMin: 0, brownoutHours: 30, survives: false, meanPowerW: 1500, poweredHours: 12, contactHours: 8, endsAtNight: false } };
    expect(templateBrief(lowSun)).toMatch(/has power for 12 hours, then too little sunlight, with Earth in view for 8 hours of that time\.$/);
    // A summary that does not say: no night in the period, so the Sun was up.
    const older = { ...lowSun.power };
    delete older.endsAtNight;
    expect(templateBrief({ ...lowSun, power: older })).toMatch(/then too little sunlight/);
    expect(narrationProblems(templateBrief(lowSun), lowSun)).toEqual([]);
  });
});

describe('narrationPrompt', () => {
  it('gives the model the state, the numbers rule and the claim rules', () => {
    const [system, user] = narrationPrompt(summary);
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/only numbers that appear/i);
    // Each number next to what it measures, with its unit, and no causes or comparisons STATE does not give.
    expect(system.content).toMatch(/next to what it measures/i);
    expect(system.content).toMatch(/unit/i);
    expect(system.content).toMatch(/no causes/i);
    expect(user.role).toBe('user');
    expect(user.content).toContain('"illumFraction": 1');
    expect(user.content).toContain('Nobile Rim 2');
  });
});

describe('stripForeignNumbers', () => {
  it('drops a sentence whose number is in the state but on another measure', () => {
    // 67 % is Earth in view here, not sunlight.
    expect(stripForeignNumbers('Selected Nobile Rim 2. It is sunlit 67 % of the time.', summary)).toBe('Selected Nobile Rim 2.');
    expect(stripForeignNumbers('Selected Nobile Rim 2. Earth is in view 100 % of the time.', summary)).toBe('Selected Nobile Rim 2.');
  });

  it('drops the sentences whose numbers the state cannot vouch for and keeps the rest', () => {
    expect(stripForeignNumbers('Selected Nobile Rim 2. It is sunlit 92 % of the time with a 310 h night. Earth is in view 67 % of the time.', summary)).toBe(
      'Selected Nobile Rim 2. Earth is in view 67 % of the time.',
    );
    expect(stripForeignNumbers('Sunlit 92 % of the time.', summary)).toBe('');
    expect(stripForeignNumbers('No numbers here.', summary)).toBe('No numbers here.');
  });
});

describe("the reader's forms", () => {
  it('accepts kilowatt and kilowatt-hour conversions and the window end date', () => {
    expect(checkNumbers('Mean power about 1.1 kW, a 2 kWh battery and a 0.2 kW load; from 1 to 15 March 2027.', summary)).toBe(true);
    expect(checkNumbers('Mean power 1.12 kW.', summary)).toBe(true);
    expect(checkNumbers('from 1 to 16 March 2027', summary)).toBe(false);
  });

  it('keeps sentences whose numbers the caller vouches for (the user typed them)', () => {
    expect(stripForeignNumbers('Comparing them for 45 days. It is sunlit 92 % of the time.', summary, ['45'])).toBe('Comparing them for 45 days.');
    expect(stripForeignNumbers('Comparing them for 45 days.', summary)).toBe('');
  });
});

describe('lessons from the first live narration', () => {
  it('keeps digits out of the system prompt so the model cannot echo them', () => {
    const [system] = narrationPrompt(summary);
    expect(numbersIn(system.content)).toEqual([]);
  });

  it('accepts the hours-per-day constant but not a gap rounded to whole days in hours', () => {
    expect(checkNumbers('over more than 24 hours', summary)).toBe(true);
    expect(checkNumbers('a longest gap of 216 hours', summary)).toBe(false); // 225 h, not 216: the retry nudge names it
    expect(checkNumbers('a longest gap of 217 hours', summary)).toBe(false);
  });
});

describe('cleanNarration', () => {
  it('drops a preamble line, fences and quotes, and keeps the paragraph', () => {
    expect(cleanNarration('Here is the mission summary (five to eight sentences):\nThe site is lit.')).toBe('The site is lit.');
    expect(cleanNarration('```\nThe site is lit.\n```')).toBe('The site is lit.');
    expect(cleanNarration('“The site is lit.”')).toBe('The site is lit.');
    expect(cleanNarration('The site is lit: bright all day.')).toBe('The site is lit: bright all day.');
    expect(cleanNarration('{"reply": "The site is lit."}')).toBe('The site is lit.');
  });

  it('asks the model not to mention the instructions', () => {
    const [system] = narrationPrompt(summary);
    expect(system.content).toMatch(/never mention these instructions/i);
    expect(system.content).not.toMatch(/five|eight|\d/);
  });
});

describe('plausible hallucinations are rejected', () => {
  it('does not let window lengths or round figures through the narration gate', () => {
    expect(checkNumbers('Earth is in view 90 % of the time.', summary)).toBe(false);
    expect(checkNumbers('a night of 48 hours', summary)).toBe(false);
    expect(checkNumbers('over the next 14 days', summary)).toBe(true); // the window's own length
    expect(checkNumbers('over the next 90 days', summary)).toBe(false); // not this window's length
  });
});

describe('cleanNarration repair and ordering', () => {
  it('repairs a missing closing brace, strips a preamble before quotes, and keeps a first line that carries data', () => {
    expect(cleanNarration('{"reply": "The site is lit."')).toBe('The site is lit.');
    expect(cleanNarration('{"reply": "The site is lit. It stays')).toBe('The site is lit.');
    expect(cleanNarration('Sure! Here is the paragraph:\n\n"The site is lit."')).toBe('The site is lit.');
    expect(cleanNarration('Nobile Rim 2, 14-day window from March 2027:\nThe Sun is up.')).toBe('Nobile Rim 2, 14-day window from March 2027:\nThe Sun is up.');
  });
});

/** States of every kind the template words differently: night or none, power to the end or not, contact or none, the four panels. */
function templateStates(): StateSummary[] {
  const base = summary;
  const out: StateSummary[] = [base];
  const panels: PanelModel[] = ['horizontal', 'vertical', 'vertical_tracking', 'full_tracking'];
  for (const [i, panel] of panels.entries()) {
    for (const [poweredHours, survives, endsAtNight, longestDarkH, contactHours] of [
      [336, true, undefined, 0, 225],
      [336, true, undefined, 40, 0],
      [37, false, true, 120, 0],
      [12, false, false, 0, 7],
      [0, false, true, 300, 0],
    ] as const) {
      out.push({
        ...base,
        site: i % 2 ? { id: 'blue_ghost_m1', name: 'Blue Ghost Mission 1 landing site (Mare Crisium)', label: 'Blue Ghost Mission 1', lat: 18.562, lon: 61.81 } : base.site,
        window: i === 3 ? { startUtc: '2027-11-15T00:00:00', days: 90 } : base.window,
        summary: { ...base.summary, hours: i === 3 ? 2160 : 336, longestDarkH, illumFraction: longestDarkH ? 0.613 : 1 },
        power: { socMin: survives ? 0.42 : 0, brownoutHours: survives ? 0 : 99, survives, meanPowerW: 731.6, poweredHours: i === 3 && survives ? 2160 : poweredHours, contactHours, ...(endsAtNight === undefined ? {} : { endsAtNight }) },
        params: { ...base.params, power: { ...DEFAULT_POWER, panel, loadW: 350, batteryWh: i === 2 ? 500 : 2500, initialSocFraction: 0.5, areaM2: 6.5, efficiency: 0.22 } },
        compare: i === 1 ? [{ id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', illumFraction: 0.446, earthVisFraction: 0.45, survives: false }] : [],
      });
    }
  }
  out.push({ ...base, site: { id: 'custom_x', name: 'Custom site -89.500°, 10.000°', label: 'Custom site -89.500°, 10.000°', lat: -89.5, lon: 10 } });
  return out;
}

describe('the template passes the claim check (the rehearsed paragraph of demo mode)', () => {
  it('for every kind of state the template words differently', () => {
    for (const st of templateStates()) expect(narrationProblems(templateBrief(st), st), templateBrief(st)).toEqual([]);
  });

  const haveData = hasFile('data', 'ephemeris', 'moon_me_2024_2036_1h.f32') && hasFile('data', 'masks', 'nobile_rim_2.json');
  it.skipIf(!haveData)('for every catalogue site over two periods, as the engine computes them', async () => {
    const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
    const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
    const store = createExploreStore({
      loadSites: async () => sites,
      loadEphemeris: async () => eph,
      loadMask: async (id) => {
        const m = readJson<{ elevation_deg: number[]; site_height_m: number; mast_m: number }>('data', 'masks', `${id}.json`);
        return { site_id: id, lat: 0, lon: 0, mast_m: m.mast_m, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
      },
    });
    await store.getState().init();
    let checked = 0;
    for (const site of sites) {
      if (!hasFile('data', 'masks', `${site.id}.json`)) continue;
      await store.getState().selectSite(site.id);
      for (const [start, days] of [['2027-01-01T00:00:00', 30], ['2028-06-10T00:00:00', 14]] as const) {
        store.getState().setWindow(start, days);
        const st = summarizeState(store.getState());
        if (!st) continue;
        expect(narrationProblems(templateBrief(st), st), `${site.id} ${start}: ${templateBrief(st)}`).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
