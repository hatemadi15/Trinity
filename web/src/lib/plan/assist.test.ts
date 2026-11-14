import { describe, expect, it, vi } from 'vitest';
import { validateActions } from '@/lib/ai/actions';
import { systemPrompt } from '@/lib/ai/protocol';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders, sites } from '@/test/file-loaders';
import { assistSpec } from './assist';
import { createMaskSource } from '@/lib/scenario/masks';
import { PlanClient } from './search-client';
import { createPlanStore } from './store';

describe('the model fills what the parser could not read', () => {
  it('passes a plan_mission action through the validator with only known fields, sites and categories', () => {
    const ids = new Set(sites.map((s) => s.id));
    const { actions, dropped } = validateActions(
      [{ type: 'plan_mission', spec: { minPoweredH: 120, loadW: '300', where: { kind: 'category', category: 'artemis3' }, panel: 'solar sail', fromUtc: '2027-03-01' } }, { type: 'plan_mission', spec: { where: { kind: 'sites', ids: ['atlantis'] } } }],
      ids,
    );
    expect(actions).toEqual([{ type: 'plan_mission', spec: { minPoweredH: 120, loadW: 300, where: { kind: 'category', category: 'artemis3' }, fromUtc: '2027-03-01T00:00:00' } }]);
    // An action with nothing usable is dropped with its reason; a field that does not fit is left out of the one kept.
    expect(dropped).toEqual(['plan_mission: unknown sites or category in where']);
  });

  it('tells the model it may only fill the specification, never search or rank', () => {
    const p = systemPrompt(sites);
    expect(p).toMatch(/"type": "plan_mission"/);
    expect(p).toMatch(/never search, rank or name a best site yourself/);
  });

  it('asks the model only about words the parser left, and keeps the fields whose numbers were said', async () => {
    const explore = createExploreStore(fileLoaders());
    await explore.getState().init();
    const plan = createPlanStore({ explore, masks: createMaskSource(fileLoaders()), client: () => new PlanClient() });
    const text = 'at least 5 days of power, and keep talking to mission control for a day while the batteries last';
    plan.getState().hear(text);
    expect(plan.getState().leftover.length).toBeGreaterThan(0);
    const ask = vi.fn(async () => ({ source: 'model' as const, actions: [{ type: 'plan_mission', spec: { minPoweredContactH: 24, minPoweredH: 96 } }], reply: 'Filled.' }));
    const note = await assistSpec(text, plan, ask as never, 'live');
    expect(ask).toHaveBeenCalledWith(expect.stringMatching(/^Plan a landing: /), null, 'live');
    expect(plan.getState().spec.req.minPoweredContactH).toBe(24);
    expect(plan.getState().spec.req.minPoweredH).toBe(120);
    expect(note).toMatch(/The assistant also read: Earth contact while powered/);
    // Demo mode and words fully read ask nothing.
    plan.getState().hear('at least 5 days of power');
    const idle = vi.fn();
    plan.getState().clear();
    plan.getState().hear('at least 5 days of power');
    expect(await assistSpec('at least 5 days of power', plan, idle as never, 'live')).toBeNull();
    expect(idle).not.toHaveBeenCalled();
  });
});
