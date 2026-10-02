import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import { compassWord, groundWords } from './ground';

function series(hours: { f: number; el: number; az: number; earth?: { el: number; az: number; seen: boolean } }[]): Series {
  const n = hours.length;
  return {
    i0: 0,
    hours: n,
    sunAz: Float64Array.from(hours.map((h) => h.az)),
    sunEl: Float64Array.from(hours.map((h) => h.el)),
    earthAz: Float64Array.from(hours.map((h) => h.earth?.az ?? 60)),
    earthEl: Float64Array.from(hours.map((h) => h.earth?.el ?? -2)),
    sunFraction: Float64Array.from(hours.map((h) => h.f)),
    earthVisible: Uint8Array.from(hours.map((h) => (h.earth?.seen ? 1 : 0))),
    sunAu: new Float64Array(n).fill(1),
  };
}

describe('compassWord', () => {
  it('names the nearest of the eight compass points', () => {
    expect([0, 44, 46, 90, 181, 226, 270, 315, 359.9].map(compassWord)).toEqual(['north', 'north-east', 'north-east', 'east', 'south', 'south-west', 'west', 'north-west', 'north']);
  });
});

describe('groundWords', () => {
  it('says the site is in sunlight, and where the Sun is', () => {
    expect(groundWords(series([{ f: 1, el: 2.4, az: 268 }]), 0).sun).toBe('The site is in sunlight: the Sun is 2° above the horizon, to the west.');
  });

  it('says why the site is dark when the Sun is up: it is behind the hills', () => {
    expect(groundWords(series([{ f: 0, el: 1.6, az: 250 }]), 0).sun).toBe('The site is in shadow: the Sun is 1.6° above the horizon but behind the hills to the west.');
  });

  it('calls it night when the Sun is below the horizon', () => {
    expect(groundWords(series([{ f: 0, el: -1.2, az: 170 }]), 0).sun).toBe('It is night at the site: the Sun is below the horizon, to the south.');
  });

  it('gives the map its short words: the site lit or not, and which body the hills hide', () => {
    const w = (h: Parameters<typeof series>[0][0]) => groundWords(series([h]), 0);
    expect(w({ f: 1, el: 2, az: 0 })).toMatchObject({ siteState: 'in sunlight', sunHidden: 'no' });
    expect(w({ f: 0.4, el: 2, az: 0 })).toMatchObject({ siteState: 'partly in sunlight', sunHidden: 'partly' });
    expect(w({ f: 0, el: 2, az: 0 })).toMatchObject({ siteState: 'in shadow', sunHidden: 'yes' });
    expect(w({ f: 0, el: -2, az: 0 })).toMatchObject({ siteState: 'at night', sunHidden: 'no' });
    expect(w({ f: 1, el: 2, az: 0, earth: { el: 3, az: 0, seen: false } }).earthHidden).toBe('yes');
    expect(w({ f: 1, el: 2, az: 0, earth: { el: 3, az: 0, seen: true } }).earthHidden).toBe('no');
  });

  it('says whether the Sun is rising or setting behind the hills when part of it shows', () => {
    const setting = series([
      { f: 1, el: 2, az: 280 },
      { f: 0.4, el: 2, az: 279 },
      { f: 0, el: 2, az: 278 },
    ]);
    expect(groundWords(setting, 1).sun).toBe('The site is partly in sunlight: the Sun is setting behind the hills to the west.');
    const rising = series([
      { f: 0, el: 2, az: 100 },
      { f: 0.4, el: 2, az: 99 },
      { f: 1, el: 2, az: 98 },
    ]);
    expect(groundWords(rising, 1).sun).toBe('The site is partly in sunlight: the Sun is rising behind the hills to the east.');
  });

  it('says whether Earth can be reached by radio, and if not, why', () => {
    expect(groundWords(series([{ f: 1, el: 2, az: 0, earth: { el: 4.2, az: 72, seen: true } }]), 0).earth).toBe('Earth is in view, 4° above the horizon to the east: radio contact is possible.');
    expect(groundWords(series([{ f: 1, el: 2, az: 0, earth: { el: -1, az: 72, seen: false } }]), 0).earth).toBe('Earth is below the horizon: no radio contact.');
    expect(groundWords(series([{ f: 1, el: 2, az: 0, earth: { el: 3, az: 72, seen: false } }]), 0).earth).toBe('Earth is behind the hills to the east: no radio contact.');
  });

  it('says "on the horizon" for a Sun or Earth that shows from a high site while at or just below level, never a negative height above it', () => {
    expect(groundWords(series([{ f: 1, el: -0.4, az: 300 }]), 0).sun).toBe('The site is in sunlight: the Sun is on the horizon, to the north-west.');
    expect(groundWords(series([{ f: 1, el: 0.02, az: 300 }]), 0).sun).toBe('The site is in sunlight: the Sun is on the horizon, to the north-west.');
    expect(groundWords(series([{ f: 1, el: 2, az: 0, earth: { el: -0.4, az: 72, seen: true } }]), 0).earth).toBe('Earth is in view on the horizon to the east: radio contact is possible.');
  });
});
