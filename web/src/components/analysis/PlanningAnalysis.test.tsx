// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { parsePlan, snapshotScenario } from '@/lib/planner/scenarios';
import { DateHeatmap } from './DateHeatmap';
import { SensitivityCard } from './SensitivityCard';

async function ready() {
  const store = createExploreStore(fileLoaders());
  await store.getState().init();
  const baseline = await store.getState().evaluateScenario(snapshotScenario(store.getState()));
  return { store, baseline };
}

describe('planning analysis', () => {
  it('calculates a bounded date grid and links every result to its exact hardware and arrival', async () => {
    const { store, baseline } = await ready();
    const evaluateScenario = vi.fn(async () => baseline);
    store.setState({ evaluateScenario });
    render(<DateHeatmap store={store} />);
    expect(evaluateScenario).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate date grid' }));
    await waitFor(() => expect(evaluateScenario).toHaveBeenCalledTimes(21));
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(21));
    const links = screen.getAllByRole('link');
    const encoded = new URL(links[1].getAttribute('href')!, 'http://localhost').searchParams.get('scenario')!;
    const plan = parsePlan(encoded)!;
    expect(plan.scenarios[0].startUtc).toBe('2027-01-08T00:00:00');
    expect(plan.scenarios[0].params).toEqual(store.getState().params);
    expect(screen.getByRole('table').textContent).toContain('Weekly samples do not establish the best possible arrival');
  });

  it('does not treat a failed grid calculation as zero and clears old results when settings change', async () => {
    const { store, baseline } = await ready();
    const evaluateScenario = vi.fn().mockRejectedValueOnce(new Error('Terrain unavailable')).mockResolvedValue(baseline);
    store.setState({ evaluateScenario });
    render(<DateHeatmap store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Calculate date grid' }));
    await waitFor(() => expect(evaluateScenario).toHaveBeenCalledTimes(21));
    expect(screen.getByText('Unavailable').getAttribute('title')).toBe('Terrain unavailable');
    expect(screen.getAllByRole('link')).toHaveLength(20);
    act(() => store.getState().setWindow('2027-02-01T12:00:00', 14));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('varies only mast height, preserves the live forecast, and exposes incomplete terrain', async () => {
    const { store, baseline } = await ready();
    const before = snapshotScenario(store.getState());
    const evaluateScenario = vi.fn().mockResolvedValueOnce(baseline)
      .mockResolvedValueOnce({ ...baseline, maskMeta: { ...baseline.maskMeta, failedTiles: 2 } })
      .mockResolvedValue(baseline);
    store.setState({ evaluateScenario });
    render(<SensitivityCard store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare mast heights' }));
    await waitFor(() => expect(evaluateScenario).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4));
    expect(evaluateScenario.mock.calls.map(([scenario]) => scenario.params.mastM)).toEqual([0, 2, 4]);
    for (const [scenario] of evaluateScenario.mock.calls) {
      expect(scenario.params.power).toEqual(before.params.power);
      expect(scenario.startUtc).toBe(before.startUtc);
    }
    expect(store.getState().params).toEqual(before.params);
    expect(screen.getByText(/Unavailable: Some terrain tiles/)).toBeTruthy();
  });
});
