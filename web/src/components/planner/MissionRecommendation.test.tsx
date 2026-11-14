// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { snapshotScenario } from '@/lib/planner/scenarios';
import { DEFAULT_PREFERENCES } from '@/lib/planner/mission';
import { MissionRecommendation } from './MissionRecommendation';

describe('MissionRecommendation', () => {
  it('withholds recommendations for failed requirements and reports the reason, then shows an eligible forecast', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const scenario = snapshotScenario(store.getState(), 'Original arrival');
    const result = await store.getState().evaluateScenario(scenario);
    const props = { candidates: [{ scenario, result }], preferences: DEFAULT_PREFERENCES, horizonDays: 30, onPreferences: vi.fn() };
    const view = render(<MissionRecommendation {...props} requirements={{ requiredHours: 336, minContactHours: 1, maxGapHours: 72 }} />);
    expect(screen.getByText('No saved plan can be recommended under these requirements.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open recommended forecast' })).toBeNull();
    expect(screen.getByText(/Needs 336 continuous/)).toBeTruthy();
    view.rerender(<MissionRecommendation {...props} requirements={{ requiredHours: 24, minContactHours: 0, maxGapHours: 720 }} />);
    expect(screen.getByText(/Only eligible saved plan: Original arrival/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open recommended forecast' }).getAttribute('href')).toContain('scenario=');
    expect(screen.getByRole('table').textContent).toContain('not a probability of mission success');
    fireEvent.change(screen.getByRole('combobox', { name: 'Mission priority' }), { target: { value: 'contact' } });
    expect(props.onPreferences).toHaveBeenCalledWith({ power: 1, contact: 5, gap: 1 });
    const details = screen.getByText('What the model learned').parentElement!;
    expect(within(details).getByText(/rule-generated preference labels/)).toBeTruthy();
  });
});
