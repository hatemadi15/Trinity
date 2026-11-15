import { describe, expect, it } from 'vitest';
import { HOME, heroSeries } from '../data/home';
import { DEFAULT_POWER, powerBudget } from '../engine/power';
import { contactPlan } from './contact';
import { homeContact } from './homeContact';

describe('the home page’s contact lanes (spec 23.2)', () => {
  const c = homeContact();

  it('counts contact only where Earth is in view and the site has sunlight: 20 to 23 January, 3 days 5 hours', () => {
    expect(c.sunlight).toEqual([{ from: 0, to: 67 }, { from: 466, to: 720 }]);
    expect(c.earth).toEqual([{ from: 219, to: 543 }]);
    expect(c.both).toEqual([{ from: 466, to: 543 }]);
    expect(c.bothHours).toBe(77);
    for (let h = 0; h < c.hours; h++) expect(c.both.some((s) => s.from <= h && h < s.to)).toBe(HOME.sky.lit[h] === 1 && HOME.sky.earth_visible[h] === 1);
  });

  it('gives every other hour the one thing it lacks: Earth, or with Earth in view, power', () => {
    expect(c.none).toEqual([
      { from: 0, to: 219, why: 'earth' },
      { from: 219, to: 466, why: 'power' },
      { from: 543, to: 720, why: 'earth' },
    ]);
    // Earth is up for ten days of the night: in view, and no contact.
    expect(c.none[1].to - c.none[1].from).toBeGreaterThan(240);
    const covered = [...c.both, ...c.none].reduce((sum, s) => sum + s.to - s.from, 0);
    expect(covered).toBe(c.hours);
  });

  it('agrees with the engine’s battery walk and the pipeline’s figures', () => {
    const series = heroSeries();
    const plan = contactPlan(series, powerBudget(series, DEFAULT_POWER));
    // The hours with Earth in view and the lander powered are the hours with Earth in view and sunlight.
    expect(plan.poweredHours).toBe(c.bothHours);
    // Landing on 1 January the battery runs out before Earth rises: no contact.
    expect(c.firstLandingHours).toBe(0);
    // Landing on the better day, the contact is the month's overlap.
    expect(c.betterLandingHours).toBe(c.bothHours);
  });
});
