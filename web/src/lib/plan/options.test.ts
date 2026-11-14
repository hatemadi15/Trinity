import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { hourlySeries, type Series } from '../engine/metrics';
import { DEFAULT_POWER, type PowerConfig } from '../engine/power';
import { utcToEt } from '../engine/time';
import { eph, fileLoaders, sites } from '../../test/file-loaders';
import { recompute, DEFAULT_PARAMS } from '../store/explore';
import { placeOptions, timeOptions, yearOptions } from './options';
import { periodOutcome, type Outcome } from './outcome';
import { checksWords, NO_REQUIREMENTS, type Requirements } from './requirements';

// 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
const rep = (v: number, n: number) => new Array<number>(n).fill(v);
const req = (r: Partial<Requirements>): Requirements => ({ ...NO_REQUIREMENTS, ...r });

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

describe('better landing times inside the period', () => {
  // A 2-day period, scanned 4 days: night until hour 12, Sun to 22, night to 36, Sun to 60, then night. Earth is in view
  // from hour 12 to hour 40. Landing at 36 keeps power longest (34 h) but loses Earth for 29 of them; landing at 12 keeps
  // power 20 h with Earth in view throughout.
  const scan = series([...rep(0, 12), ...rep(1, 10), ...rep(0, 14), ...rep(1, 24), ...rep(0, 36)], [...rep(0, 12), ...rep(1, 29), ...rep(0, 55)]);
  const plan = (r: Requirements) => timeOptions({ scan, cfg: CFG, req: r, hours: 48, startUtc: '2027-01-01T00:00:00', apartH: 6 });

  it('recommends the longest power when no requirement is set', () => {
    const p = plan(NO_REQUIREMENTS);
    expect(p.current.outcome).toMatchObject({ hour: 0, poweredH: 10 });
    expect(p.better?.item).toEqual({ hour: 36, startUtc: '2027-01-02T12:00:00' });
    expect(p.betterWhy).toBe('Power lasts 1 d longer than landing at the period start.');
  });

  it('recommends a time that meets every requirement over a longer one that fails one, and says why', () => {
    const p = plan(req({ maxOutageH: 12 }));
    expect(p.better?.item.hour).toBe(12);
    expect(p.better?.checks.map((c) => c.words)).toEqual(['Longest time without Earth while powered at most 12 h: 0 h, 12 h to spare']);
    expect(p.betterWhy).toBe('Power lasts 10 h longer than landing at the period start.');
    // The alternatives, best first and kept apart, each with its checks, its trade-offs and why it ranks above the next.
    expect(p.alternatives.map((a) => a.item.hour)).toEqual([12, 18, 36]);
    expect(p.alternatives.map((a) => a.why)).toEqual([
      'Power lasts 6 h longer than the next.',
      'It meets every requirement; the next fails one: longest time without Earth while powered at most 12 h (1 d 5 h).',
      'Power lasts 6 h longer than the next.',
    ]);
    expect(checksWords(p.alternatives[2].checks)).toBe('Fails your requirement: longest time without Earth while powered at most 12 h (1 d 5 h).');
    expect(p.alternatives[0].trade.map((t) => t.text)).toEqual(['Power +10 h', 'Sunlight +12 h', 'Earth in view same', 'Contact while powered +20 h', 'Longest time without Earth while powered −10 h']);
  });

  it('recommends nothing when no time does better than landing at the start', () => {
    const allDay = series(rep(1, 96), rep(1, 96));
    const p = timeOptions({ scan: allDay, cfg: CFG, req: NO_REQUIREMENTS, hours: 48, startUtc: '2027-01-01T00:00:00' });
    expect(p.better).toBeNull();
    expect(p.betterWhy).toBeNull();
    expect(p.alternatives.length).toBeGreaterThan(0);
  });
});

describe('better places nearby', () => {
  const here: Site = { id: 'here', name: 'Here', label: 'Here', lat: -88.3, lon: -64.3, category: 'artemis3', polar: true, source: 'x' };
  // About 12 km, 6 km and 55 km from here, on the same meridian.
  const summit = { ...here, id: 'summit', name: 'Summit', label: 'Summit', lat: -88.7 };
  const step = { ...here, id: 'step', name: 'Step', label: 'Step', lat: -88.1 };
  const far = { ...here, id: 'far', name: 'Far', label: 'Far', lat: -86.5 };
  const all = [here, summit, step, far];
  const o = (poweredH: number, poweredOutageH = 50): Outcome => ({ hour: 0, stayH: 720, poweredH, sunH: 300, contactH: 300, poweredContactH: 20, outageH: 200, poweredOutageH, firstContactH: 0, sunlitAtLanding: true });

  it('ranks the catalogue sites within 30 km from the same landing hour and recommends one that keeps power at least a day longer', () => {
    const p = placeOptions({ site: here, sites: all, outcomes: { summit: o(720), step: o(90), far: o(720) }, current: o(76), req: NO_REQUIREMENTS });
    expect(p.alternatives.map((a) => a.item.site.id)).toEqual(['summit', 'step']);
    expect(p.better?.item.site.id).toBe('summit');
    expect(p.betterWhy).toBe('Power lasts 26 d 20 h longer than this site.');
    // A site 14 hours better is not worth a move: the terrain data cannot tell that apart.
    expect(placeOptions({ site: here, sites: all, outcomes: { step: o(90) }, current: o(76), req: NO_REQUIREMENTS }).better).toBeNull();
    expect(placeOptions({ site: here, sites: all, outcomes: {}, current: o(76), req: NO_REQUIREMENTS }).alternatives).toEqual([]);
  });

  it('ranks the spots worked out round the site with the catalogue sites, nearer first on a tie', () => {
    const spot = { site: { ...here, id: 'custom_-88.2575_-64.3100', name: 'the spot 2.5 km north', label: 'the spot 2.5 km north', category: 'custom' }, km: 2.5 };
    const p = placeOptions({ site: here, sites: all, outcomes: { summit: o(720), step: o(90) }, extra: [{ place: spot, outcome: o(720) }], current: o(76), req: NO_REQUIREMENTS });
    expect(p.alternatives.map((a) => a.item.site.id)).toEqual(['custom_-88.2575_-64.3100', 'summit', 'step']);
    expect(p.better?.item.km).toBe(2.5);
  });

  it('recommends a site that meets a requirement the current one fails, even for less power', () => {
    const p = placeOptions({ site: here, sites: all, outcomes: { summit: o(720, 200), step: o(90, 20) }, current: o(76, 76), req: req({ maxOutageH: 72 }) });
    expect(p.alternatives.map((a) => a.item.site.id)).toEqual(['step', 'summit']);
    expect(p.better?.item.site.id).toBe('step');
    expect(p.betterWhy).toBe('It meets every requirement; this site fails one: longest time without Earth while powered at most 3 d (3 d 4 h).');
  });
});

describe('the 12-month search', () => {
  // Two sites, 100 hours scanned every 10 hours for a 20-hour stay: A is sunlit to hour 60, B from hour 30.
  const a = series([...rep(1, 60), ...rep(0, 40)], rep(1, 100));
  const b = series([...rep(0, 30), ...rep(1, 70)], rep(1, 100));
  const scan = { from: 0, to: 80, step: 10, capHours: 20 };

  it('only tries hours sunlit at every site, and ranks each by the worst site, never the mean', () => {
    const p = yearOptions({ scans: [a, b], cfg: CFG, req: NO_REQUIREMENTS, scan, startUtc: '2027-01-01T00:00:00', top: 3, apartH: 10 });
    // Hours 30 to 50 are sunlit at both. At 50, A keeps power only 20 h (to 60 plus the battery's 10): the stay's 20 h, as at 30 and 40.
    expect(p.alternatives.map((x) => x.item.hour)).toEqual([30, 40, 50]);
    expect(p.alternatives[0].item.perSite.map((x) => x.poweredH)).toEqual([20, 20]);
    expect(p.alternatives[0].item.startUtc).toBe('2027-01-02T06:00:00');
    expect(p.alternatives[0].why).toBe('It ties with the next and comes first as the earlier time.');
  });

  it('honours the requirements at every site', () => {
    // From hour 60, A is in the dark: its power lasts only the battery's 10 hours.
    const late = { from: 30, to: 80, step: 10, capHours: 30 };
    const p = yearOptions({ scans: [a, b], cfg: CFG, req: req({ minPoweredH: 30 }), scan: late, startUtc: '2027-01-01T00:00:00', apartH: 10 });
    expect(p.alternatives[0].item.hour).toBe(30);
    expect(p.alternatives[0].failed).toBe(0);
    expect(p.alternatives[1].checks[0].words).toBe('Power for at least 1 d 6 h: 1 d 6 h, 0 h to spare');
    expect(p.alternatives[2]).toMatchObject({ failed: 1 });
  });
});

describe('the recommendation at de Gerlache Rim 2 from 1 January 2027, for 30 days', () => {
  const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
  const two = req({ minPoweredH: 5 * 24, maxOutageH: 3 * 24 });

  it('lists the requirements the recommended time meets and fails, and why it ranks above landing at the start and above the next alternative (review acceptance)', async () => {
    const mask = Float64Array.from((await fileLoaders().loadMask(site.id)).elevation_deg);
    const scan = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 60 * 24);
    const p = timeOptions({ scan, cfg: DEFAULT_PARAMS.power, req: two, hours: 720, startUtc: '2027-01-01T00:00:00' });
    expect(checksWords(p.current.checks)).toBe('Fails 2 of your 2 requirements: power for at least 5 d (3 d 4 h); longest time without Earth while powered at most 3 d (3 d 4 h).');
    expect(p.better?.item.startUtc).toBe('2027-01-20T10:00:00');
    expect(p.better?.checks.map((c) => [c.met, c.words])).toEqual([
      [true, 'Power for at least 5 d: 12 d 15 h, 7 d 15 h to spare'],
      [false, 'Longest time without Earth while powered at most 3 d: 9 d 10 h, 6 d 10 h too long'],
    ]);
    expect(p.betterWhy).toBe('It fails fewer requirements than landing at the period start: 1 against 2.');
    expect(p.alternatives[0].why).toBe('Power lasts 3 d longer than the next.');
    expect(p.alternatives[0].trade.map((t) => t.text)).toEqual(['Power +9 d 11 h', 'Sunlight −1 d 3 h', 'Earth in view +2 d 19 h', 'Contact while powered +3 d 5 h', 'Longest time without Earth while powered +6 d 6 h']);
  });

  it('puts the rim summit 12 km away first among the places nearby, with its checks and trade-offs', async () => {
    const outcomeOf = async (s: Site) => {
      const r = recompute(eph, s, Float64Array.from((await fileLoaders().loadMask(s.id)).elevation_deg), '2027-01-01T00:00:00', 30, DEFAULT_PARAMS);
      return periodOutcome(r.series, r.power);
    };
    const summit = sites.find((s) => s.id === 'de_gerlache_center_rim_high')!;
    const center = sites.find((s) => s.id === 'de_gerlache_center')!;
    const p = placeOptions({ site, sites, outcomes: { [summit.id]: await outcomeOf(summit), [center.id]: await outcomeOf(center) }, current: await outcomeOf(site), req: two });
    expect(p.better?.item.site.id).toBe('de_gerlache_center_rim_high');
    expect(checksWords(p.better!.checks)).toBe('Fails 1 of your 2 requirements: longest time without Earth while powered at most 3 d (8 d 23 h).');
    expect(p.betterWhy).toBe('It fails fewer requirements than this site: 1 against 2.');
    expect(p.alternatives[0].why).toBe('Power lasts 29 d 14 h longer than the next.');
  });
});
