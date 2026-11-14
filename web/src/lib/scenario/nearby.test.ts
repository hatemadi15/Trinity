import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import type { Outcome as PlanOutcome } from '../plan/outcome';
import { NO_REQUIREMENTS } from '../plan/requirements';
import { bestNearbyFor } from './nearby';

const site = (id: string): Site => ({ id, name: id, label: id, lat: -88, lon: 0, category: 'artemis3', polar: true, source: 'x' });
const plan = (poweredH: number, poweredOutageH: number): PlanOutcome => ({ hour: 0, stayH: 720, poweredH, sunH: 300, contactH: 300, poweredContactH: 0, outageH: 200, poweredOutageH, firstContactH: 0, sunlitAtLanding: true });

describe('the nearby alternative for a scenario, ranked with the requirements', () => {
  const here = site('here');
  const own = plan(76, 76);
  const tried = [
    { site: site('summit'), km: 12, plan: plan(720, 215) },
    { site: site('step'), km: 6, plan: plan(200, 40) },
  ];

  it('takes the longest power when no requirement is set, as before', () => {
    expect(bestNearbyFor(here, own, tried, NO_REQUIREMENTS)?.site.id).toBe('summit');
  });

  it('takes a site that meets every requirement over a longer-powered one that fails one', () => {
    expect(bestNearbyFor(here, own, tried, { ...NO_REQUIREMENTS, maxOutageH: 72 })?.site.id).toBe('step');
  });

  it('takes none when no site does better than the scenario itself', () => {
    expect(bestNearbyFor(here, plan(720, 10), tried, NO_REQUIREMENTS)).toBeNull();
    expect(bestNearbyFor(here, own, [], NO_REQUIREMENTS)).toBeNull();
  });
});
