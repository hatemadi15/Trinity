// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '../store/explore';
import { PlanClient } from '../plan/search-client';
import { createPlanStore } from '../plan/store';
import { fileLoaders, sites } from '@/test/file-loaders';
import { parseCommand } from './commands';
import { runCommand, type LunaDeps } from './run';

const EXAMPLE =
  'We need at least five days of power, Earth in view when we land, no radio gap longer than three days, a three hundred watt load and a three kilowatt hour battery, landing between March and June twenty twenty seven, near the Artemis three regions';

async function setup(at = '/explore') {
  const store = createExploreStore(fileLoaders());
  await store.getState().init();
  const plan = createPlanStore({ explore: store, loadMask: fileLoaders().loadMask, client: () => new PlanClient() });
  const deps: LunaDeps = { store, plan, navigate: vi.fn(), path: () => at, ask: vi.fn(async () => ({ source: 'none' as const, actions: [], reply: '' })), setTheme: vi.fn(), turnOff: vi.fn() };
  return { store, plan, deps };
}

describe('Luna plans a landing', () => {
  it('hears "plan a landing" and the planner’s own words, and a dictated specification anywhere', () => {
    expect(parseCommand('Luna, plan a landing', sites)).toEqual({ kind: 'plan', step: 'open' });
    expect(parseCommand('open the planner', sites)).toEqual({ kind: 'plan', step: 'open' });
    expect(parseCommand('search', sites)).toEqual({ kind: 'plan', step: 'search' });
    expect(parseCommand('cancel the search', sites)).toEqual({ kind: 'plan', step: 'cancel' });
    expect(parseCommand('plan this landing', sites)).toEqual({ kind: 'plan', step: 'land' });
    expect(parseCommand('compare them', sites)).toEqual({ kind: 'plan', step: 'compare' });
    expect(parseCommand('read it back', sites)).toEqual({ kind: 'plan', step: 'read' });
    expect(parseCommand(EXAMPLE, sites).kind).toBe('spec');
  });

  it('takes a single field as the specification on the planner, and as the planner’s own command elsewhere', () => {
    expect(parseCommand('set the battery to 5000 wh', sites, { planning: true }).kind).toBe('spec');
    expect(parseCommand('set the battery to 5000 wh', sites).kind).toBe('planner');
  });

  it('opens the planner, reads back what she heard, searches when asked and reads the answer, then plans the landing', async () => {
    const { deps, plan, store } = await setup();
    expect(await runCommand({ kind: 'plan', step: 'open' }, deps)).toMatch(/^Opening the planner\. Tell me what the mission needs/);
    expect(deps.navigate).toHaveBeenCalledWith('/plan');
    const said = await runCommand(parseCommand(EXAMPLE, sites), deps);
    expect(said).toMatch(/^I heard: at least 5 days of power, Earth in view at landing, no more than 3 days without Earth while powered, a 300 watt load, a 3 kilowatt-hour battery, landing from 1 March to 30 June 2027 UTC/);
    expect(plan.getState().answer).toBeNull();
    const summary = await runCommand({ kind: 'plan', step: 'search' }, deps);
    expect(summary).toMatch(/^I searched 9 sites and 26,352 landing times in .+ seconds\. The best is /);
    const landed = await runCommand({ kind: 'plan', step: 'land' }, deps);
    expect(landed).toMatch(/^Explore is on /);
    expect(store.getState().siteId).toBe(plan.getState().answer!.shown[0].site.id);
  });

  it('asks for the specification before a search, and says when there is nothing to plan', async () => {
    const { deps } = await setup('/plan');
    expect(await runCommand({ kind: 'plan', step: 'search' }, deps)).toMatch(/^Tell me what the mission needs first/);
    expect(await runCommand({ kind: 'plan', step: 'land' }, deps)).toMatch(/say search first|Tell me what the mission needs/);
  });
});
