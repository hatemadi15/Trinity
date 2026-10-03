import { describe, expect, it } from 'vitest';
import { portraitLift, starNamesShown } from './StandCanvas';

describe('the view on a tall screen', () => {
  it('rests a few degrees higher on a portrait screen, so the Sun sits below the answer, and not at all on a wide one', () => {
    expect(portraitLift(1440, 900)).toBe(0);
    expect(portraitLift(900, 900)).toBe(0);
    expect(portraitLift(390, 844)).toBeCloseTo(3, 0);
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
