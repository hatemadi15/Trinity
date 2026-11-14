import { describe, expect, it, vi } from 'vitest';
import { readComparison } from '@/lib/scenario/codec';
import { createMaskSource } from '@/lib/scenario/masks';
import { createExploreStore } from '@/lib/store/explore';
import { createScenarioStore } from '@/lib/store/scenarios';
import { fileLoaders } from '@/test/file-loaders';
import { PlanClient } from './search-client';
import { createPlanStore } from './store';

const EXAMPLE =
  'We need at least five days of power, Earth in view when we land, no radio gap longer than three days, a 300 watt load and a 3 kilowatt-hour battery, landing between March and June 2027, near the Artemis III regions.';

async function stores() {
  const explore = createExploreStore(fileLoaders());
  await explore.getState().init();
  const scenarios = createScenarioStore(explore, fileLoaders());
  const plan = createPlanStore({ explore, masks: createMaskSource(fileLoaders()), scenarios, client: () => new PlanClient() });
  return { explore, plan, scenarios };
}

describe('the planner’s store', () => {
  it('hears a specification, reads it back, and searches only when asked', async () => {
    const { plan } = await stores();
    const said = plan.getState().hear(EXAMPLE);
    expect(said).toMatch(/^I heard: at least 5 days of power/);
    expect(plan.getState().status).toBe('heard');
    expect(plan.getState().answer).toBeNull();
    const progress: number[] = [];
    const off = plan.subscribe((s) => s.progress && progress.push(s.progress.done));
    const answer = await plan.getState().search();
    off();
    expect(plan.getState().status).toBe('done');
    expect(answer!.shown.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(9);
    expect(plan.getState().stats).toMatchObject({ sites: 9, landingTimes: 9 * 2928, stepH: 1 });
  });

  it('stops a search when cancelled, and keeps the specification', async () => {
    const { plan } = await stores();
    plan.getState().hear(EXAMPLE);
    const running = plan.getState().search();
    plan.getState().cancel();
    expect(await running).toBeNull();
    expect(plan.getState().status).toBe('cancelled');
    expect(plan.getState().spec.req.minPoweredH).toBe(120);
  });

  it('plans the chosen landing in Explore: the site, the landing time, the period and the lander', async () => {
    const { plan, explore } = await stores();
    plan.getState().hear(EXAMPLE);
    const answer = (await plan.getState().search())!;
    const first = answer.shown[0];
    const navigate = vi.fn();
    const said = await plan.getState().land(0, navigate);
    const s = explore.getState();
    expect(s.siteId).toBe(first.site.id);
    expect(s.startUtc).toBe(first.best!.item.utc);
    expect(s.days).toBe(14);
    expect(s.params.power).toMatchObject({ loadW: 300, batteryWh: 3000 });
    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^/explore\\?site=${first.site.id}&start=`)));
    expect(said).toMatch(/^Explore is on /);
    // The requirements the landing was chosen by go with it, as one set, in the store and in the link with the lander.
    expect(s.requirements).toEqual({ minPoweredH: 120, contactWithinH: 0, maxOutageH: 72, minPoweredContactH: null });
    expect(navigate.mock.calls[0][0]).toMatch(/&days=14&load=300&battery=3000&minpower=120&earthby=0&maxgap=72$/);
  });

  it('takes the planner’s priorities to Explore with the landing, and a month’s own best landing when one is asked for', async () => {
    const { plan, explore } = await stores();
    plan.getState().hear(EXAMPLE);
    plan.getState().edit({ objective: 'weighed', priorities: { power: 1, contact: 5, gap: 1 } });
    const answer = (await plan.getState().search())!;
    const month = answer.shown[0].byDate!.find((o) => o !== null)!;
    const navigate = vi.fn();
    await plan.getState().land(0, navigate, month.item.utc);
    expect(explore.getState().rankBy).toEqual({ kind: 'weighed', priorities: { power: 1, contact: 5, gap: 1 } });
    expect(explore.getState().startUtc).toBe(month.item.utc);
    expect(navigate.mock.calls[0][0]).toMatch(/&rank=contact$/);
    // A plain objective leaves Explore on its own default ranking, the longest time with power.
    plan.getState().edit({ objective: 'power' });
    await plan.getState().search();
    await plan.getState().land(0, vi.fn());
    expect(explore.getState().rankBy).toEqual({ kind: 'power' });
  });

  it('opens Compare with the top results as scenarios, each at its own best landing time', async () => {
    const { plan, scenarios, explore } = await stores();
    plan.getState().hear(EXAMPLE);
    const answer = (await plan.getState().search())!;
    const navigate = vi.fn();
    await plan.getState().compareTop(navigate);
    const href: string = navigate.mock.calls[0][0];
    expect(href).toMatch(/^\/compare\?v=1&s=/);
    const read = readComparison(href.slice(href.indexOf('?')));
    expect(read.scenarios.map((x) => [x.siteId, x.startUtc, x.days, x.timing])).toEqual(answer.shown.map((f) => [f.site.id, f.best!.item.utc, 14, 'site-best']));
    expect(read.scenarios[0].power).toMatchObject({ loadW: 300, batteryWh: 3000 });
    expect(scenarios.getState().scenarios.map((x) => x.siteId)).toEqual(answer.shown.map((f) => f.site.id));
    // Compare checks each against the requirements they were ranked by.
    const req = { minPoweredH: 120, contactWithinH: 0, maxOutageH: 72, minPoweredContactH: null };
    expect(read.requirements).toEqual(req);
    expect(explore.getState().requirements).toEqual(req);
  });

  it('takes the model’s fields only where the words did not give them, and only numbers found in the words', async () => {
    const { plan } = await stores();
    plan.getState().hear('at least 5 days of power, and keep the lander chatting with home for most of a day');
    const taken = plan.getState().takeAssistant({ minPoweredH: 200, minPoweredContactH: 18, loadW: 450 }, 'at least 5 days of power, and keep the lander chatting with home for most of a day');
    expect(plan.getState().spec.req.minPoweredH).toBe(120);
    expect(taken.fields).toEqual([]);
    expect(taken.dropped.join(' ')).toMatch(/18/);
    const ok = plan.getState().takeAssistant({ minPoweredContactH: 24 }, 'at least 5 days of power, and contact with home for one day while it has power');
    expect(ok.fields).toEqual(['minPoweredContactH']);
    expect(plan.getState().from.minPoweredContactH).toBe('assistant');
  });
});
