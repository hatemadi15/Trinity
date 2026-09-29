import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from '../engine/power';
import { allowedNumbers, checkNumbers, cleanNarration, narrationPrompt, numbersIn, stripForeignNumbers, templateBrief } from './narrate';
import type { StateSummary } from './state-summary';

const summary: StateSummary = {
  site: { id: 'nobile_rim_2', name: 'Nobile Rim 2 (Artemis III region)', lat: -84.20156, lon: 60.69989 },
  window: { startUtc: '2027-03-01T00:00:00', days: 14 },
  summary: { hours: 336, illumFraction: 1, meanSunFraction: 0.998, longestDarkH: 0, earthVisFraction: 0.67, longestEarthGapH: 225, jointFraction: 0.67 },
  power: { socMin: 1, brownoutHours: 0, survives: true, meanPowerW: 1118.4 },
  params: { power: DEFAULT_POWER, minEarthElDeg: 0, mastM: 2 },
  compare: [],
  audience: 'planner',
};

describe('numbersIn', () => {
  it('extracts every number, with thousands separators removed', () => {
    expect(numbersIn('Sun 100 % of the time; gap 9 d 9 h, load 200 W, 2,000 Wh, 1.5° above')).toEqual(['100', '9', '9', '200', '2000', '1.5']);
    expect(numbersIn('no digits here')).toEqual([]);
  });
});

describe('checkNumbers', () => {
  it('accepts a reply whose numbers all come from the state, in any of the usual forms', () => {
    expect(checkNumbers('Sun above the skyline 100 % of the time; longest Earth gap 9 d 9 h', summary)).toBe(true);
    expect(checkNumbers('Earth in view 67.0 % (0.67) of the 336 hours, longest gap 225 h or about 9.4 days; 14-day window from 1 March 2027', summary)).toBe(true);
    expect(checkNumbers('At 84.2°S, 60.7°E with a 2 m mast, 4 m² at 30 %, a 200 W load and a 2000 Wh battery, mean power 1118 W', summary)).toBe(true);
    expect(checkNumbers('No numbers at all.', summary)).toBe(true);
  });

  it('rejects invented figures', () => {
    expect(checkNumbers('Sun above the skyline 87 % of the time', summary)).toBe(false);
    expect(checkNumbers('longest Earth gap 10 d', summary)).toBe(false);
    expect(checkNumbers('a 3000 Wh battery', summary)).toBe(false);
  });
});

describe('templateBrief', () => {
  it('is deterministic, names the site and the verdict, and passes its own number check', () => {
    const a = templateBrief(summary);
    expect(templateBrief(summary)).toBe(a);
    expect(a).toContain('Nobile Rim 2');
    expect(a).toMatch(/survives/);
    expect(a).toMatch(/100\.0 %/);
    expect(checkNumbers(a, summary)).toBe(true);
  });

  it('says when the battery runs dry', () => {
    const dark: StateSummary = { ...summary, power: { socMin: 0, brownoutHours: 37, survives: false, meanPowerW: 40.2 } };
    const b = templateBrief(dark);
    expect(b).toMatch(/does not survive/);
    expect(b).toMatch(/37 h/);
    expect(checkNumbers(b, dark)).toBe(true);
  });
});

describe('narrationPrompt', () => {
  it('gives the model the state and the numbers rule', () => {
    const [system, user] = narrationPrompt(summary);
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/only numbers that appear/i);
    expect(user.role).toBe('user');
    expect(user.content).toContain('"illumFraction": 1');
    expect(user.content).toContain('Nobile Rim 2');
  });
});

describe('stripForeignNumbers', () => {
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
    const allowed = allowedNumbers(summary);
    for (const n of ['1.1', '1.12', '2', '0.2', '15', '3']) expect(allowed.has(n), n).toBe(true);
    expect(checkNumbers('Mean power about 1.1 kW, a 2 kWh battery and a 0.2 kW load; from 1 to 15 March 2027.', summary)).toBe(true);
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

  it('accepts whole days written in hours and the hours-per-day constant', () => {
    expect(checkNumbers('a longest gap of 216 hours plus 9, over more than 24 hours', summary)).toBe(true);
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
