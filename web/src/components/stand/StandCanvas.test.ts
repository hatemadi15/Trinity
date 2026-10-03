import { describe, expect, it } from 'vitest';
import { horizonLift, starNamesShown } from './StandCanvas';

describe('the view on a tall screen', () => {
  it('rests higher on a tall screen so the horizon sits a little above the middle of the band free of words and buttons, the lander and the ground below it', () => {
    // A phone: words down to 330 px, buttons from 614 px; the horizon at 40 % of the band, 444 px.
    const lift = horizonLift(390, 844, 80, 330, 614);
    const y = 422 + 422 * (Math.tan((lift * Math.PI) / 180) / Math.tan((40 * Math.PI) / 180));
    expect(y).toBeCloseTo(330 + 0.4 * 284, 0);
    // With the words hidden the band starts at the top, and the view rests lower.
    expect(horizonLift(390, 844, 80, 0, 614)).toBeLessThan(lift);
  });

  it('does not tilt a wide screen, where the words sit at the sides', () => {
    expect(horizonLift(1440, 900, 60, 360, 700)).toBe(0);
    expect(horizonLift(900, 900, 60, 360, 700)).toBe(0);
  });

  it('keeps the tilt within bounds when the free band is odd', () => {
    expect(horizonLift(390, 844, 80, 800, 820)).toBe(0);
    expect(Math.abs(horizonLift(390, 844, 80, 700, 840))).toBeLessThanOrEqual(15);
  });
});

describe('the star names', () => {
  const at = (name: string, visible = true) => ({ name, x: 0.5, y: 0.5, visible });
  it('names the bright stars only at night or looking up', () => {
    expect(starNamesShown([at('Sirius')], true)).toEqual([true]);
    expect(starNamesShown([at('Sirius')], false)).toEqual([false]);
    expect(starNamesShown([at('Sirius', false)], true)).toEqual([false]);
  });

  it('names the Southern Cross rather than its four stars, so the names do not pile up on it', () => {
    const sky = [at('Acrux'), at('Mimosa'), at('Gacrux'), at('Imai'), at('Hadar'), at('Southern Cross')];
    expect(starNamesShown(sky, true)).toEqual([false, false, false, false, true, true]);
    // With the cross itself out of sight, its stars keep their names.
    const hidden = [at('Acrux'), at('Southern Cross', false)];
    expect(starNamesShown(hidden, true)).toEqual([true, false]);
  });
});
