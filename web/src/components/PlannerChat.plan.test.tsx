// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMaskSource } from '@/lib/scenario/masks';
import { PlanClient } from '@/lib/plan/search-client';
import { createPlanStore } from '@/lib/plan/store';
import { createExploreStore } from '@/lib/store/explore';
import { plannerLog } from '@/lib/store/planner-log';
import { fileLoaders } from '@/test/file-loaders';
import { PlannerChat } from './PlannerChat';

afterEach(() => {
  cleanup();
  plannerLog.getState().clear();
});

describe('the typed assistant takes a mission’s specification', () => {
  it('reads a specification itself, before any model, and opens the planner with it', async () => {
    const explore = createExploreStore(fileLoaders());
    await explore.getState().init();
    const plan = createPlanStore({ explore, masks: createMaskSource(fileLoaders()), client: () => new PlanClient() });
    const ask = vi.fn();
    const navigate = vi.fn();
    render(<PlannerChat store={explore} plan={plan} ask={ask} navigate={navigate} />);
    fireEvent.change(screen.getByLabelText('Ask the assistant'), { target: { value: 'at least five days of power, Earth in view when we land, landing in May 2027' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Question for the assistant' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/plan'));
    expect(ask).not.toHaveBeenCalled();
    expect(plan.getState().spec.req).toMatchObject({ minPoweredH: 120, contactWithinH: 0 });
    expect(plannerLog.getState().exchanges[0].reply).toMatch(/^I heard: at least 5 days of power, Earth in view at landing, landing from 1 May to 31 May 2027 UTC/);
  });
});
