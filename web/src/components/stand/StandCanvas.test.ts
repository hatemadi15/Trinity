import { describe, expect, it } from 'vitest';
import { portraitLift } from './StandCanvas';

describe('the view on a tall screen', () => {
  it('rests a few degrees higher on a portrait screen, so the Sun sits below the answer, and not at all on a wide one', () => {
    expect(portraitLift(1440, 900)).toBe(0);
    expect(portraitLift(900, 900)).toBe(0);
    expect(portraitLift(390, 844)).toBeCloseTo(8, 0);
  });
});
