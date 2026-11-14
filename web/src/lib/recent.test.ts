import { describe, expect, it } from 'vitest';
import { RecentCache } from './recent';

describe('RecentCache', () => {
  it('keeps the most recent entries, a lookup counting as a use', () => {
    const c = new RecentCache<string>(2);
    c.set('a', 'A');
    c.set('b', 'B');
    expect(c.get('a')).toBe('A');
    c.set('c', 'C');
    expect([c.get('a'), c.get('b'), c.get('c'), c.size]).toEqual(['A', undefined, 'C', 2]);
  });

  it('keeps the total weight under its cap, and never keeps something heavier than the cap', () => {
    const c = new RecentCache<Uint8Array>(10, (v) => v.byteLength, 10);
    c.set('a', new Uint8Array(4));
    c.set('b', new Uint8Array(4));
    c.set('c', new Uint8Array(4));
    expect([c.get('a'), c.get('b')?.byteLength, c.get('c')?.byteLength]).toEqual([undefined, 4, 4]);
    c.set('huge', new Uint8Array(11));
    expect([c.get('huge'), c.size]).toEqual([undefined, 2]);
    // Replacing an entry counts its new weight only: 6 and 4 fit the cap of 10, 7 and 4 do not.
    c.set('b', new Uint8Array(6));
    expect([c.get('b')?.byteLength, c.get('c')?.byteLength]).toEqual([6, 4]);
    c.set('b', new Uint8Array(7));
    expect([c.get('b')?.byteLength, c.get('c')]).toEqual([7, undefined]);
  });
});
