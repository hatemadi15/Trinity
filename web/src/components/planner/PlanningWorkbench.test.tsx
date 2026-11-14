// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_REQUIREMENTS, parsePlan, serializePlan, snapshotScenario } from '@/lib/planner/scenarios';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { PlanningWorkbench } from './PlanningWorkbench';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/plan');
});
afterEach(cleanup);

async function open() {
  const store = createExploreStore(fileLoaders());
  render(<PlanningWorkbench store={store} />);
  await screen.findByRole('heading', { name: 'Compare landing scenarios' }, { timeout: 20_000 });
  await waitFor(() => expect(screen.queryByText('Calculating this scenario…')).toBeNull(), { timeout: 20_000 });
  return store;
}

describe('PlanningWorkbench', () => {
  it('preserves the original arrival and lander when adding a delayed arrival and a nearby alternative', async () => {
    const store = await open();
    const original = screen.getByRole('article', { name: 'Original plan' });
    expect(original.textContent).toContain('1 Jan 2027, 00:00 UTC');
    fireEvent.click(screen.getByRole('button', { name: 'Add delayed arrival' }));
    const delayed = await screen.findByRole('article', { name: 'Delayed by 7 days' });
    await waitFor(() => expect(within(delayed).queryByText('Calculating this scenario…')).toBeNull());
    expect(delayed.textContent).toContain('8 Jan 2027, 00:00 UTC');
    expect(delayed.textContent).toContain('vs baseline');
    expect(original.textContent).toContain('1 Jan 2027, 00:00 UTC');
    fireEvent.click(screen.getByRole('button', { name: 'Add nearby site on delayed date' }));
    const nearby = await screen.findByRole('article', { name: 'Nearby alternative, +7 days' });
    expect(nearby.textContent).toContain('8 Jan 2027, 00:00 UTC');
    await waitFor(() => expect(within(nearby).queryByText('Calculating this scenario…')).toBeNull());
    // The workbench computes separate scenarios without moving the live Explore forecast.
    expect(store.getState().startUtc).toBe('2027-01-01T00:00:00');
    expect(store.getState().params.power.batteryWh).toBe(2000);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('shows requirement failures from actual results and updates them when requirements change', async () => {
    await open();
    const original = screen.getByRole('article', { name: 'Original plan' });
    expect(original.textContent).toContain('Does not meet selected requirements');
    expect(original.textContent).toMatch(/Needs 336 continuous powered hours; model gives \d+/);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Required continuous power (hours)' }), { target: { value: '0' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum powered Earth view (hours)' }), { target: { value: '0' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum Earth-hidden gap (hours)' }), { target: { value: '2160' } });
    await waitFor(() => expect(original.textContent).toContain('Meets selected requirements'));
    expect(screen.getByText(/These are screening requirements, not a mission safety verdict/)).toBeTruthy();
  });

  it('restores complete shared settings over local plans, supports editing and persists a reproducible comparison', async () => {
    const source = createExploreStore(fileLoaders());
    await source.getState().init();
    const saved = snapshotScenario(source.getState(), 'Old local plan');
    window.localStorage.setItem('earthrise.landing-plan.v1', serializePlan([saved]));
    const shared = snapshotScenario({ ...source.getState(), startUtc: '2027-02-01T06:00:00', params: { ...source.getState().params, power: { ...source.getState().params.power, batteryWh: 20000, efficiency: 0.35 } } }, 'Shared 06:00 arrival');
    window.history.replaceState(null, '', `/plan?${new URLSearchParams({ plan: serializePlan([shared], { ...DEFAULT_REQUIREMENTS, requiredHours: 24 }) })}`);
    await open();
    expect(screen.queryByRole('article', { name: 'Old local plan' })).toBeNull();
    const card = screen.getByRole('article', { name: 'Shared 06:00 arrival' });
    expect(card.textContent).toContain('1 Feb 2027, 06:00 UTC');
    expect(card.textContent).toContain('20 kWh battery');
    expect(card.textContent).toContain('Panel efficiency 35%');
    fireEvent.click(within(card).getByRole('button', { name: 'Edit Shared 06:00 arrival' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Scenario name' }), { target: { value: 'Reviewed arrival' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save scenario changes' }));
    expect(await screen.findByRole('article', { name: 'Reviewed arrival' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Share comparison' }));
    const link = await screen.findByRole('textbox', { name: 'Full comparison link' });
    const parsed = parsePlan(new URL((link as HTMLInputElement).value).searchParams.get('plan')!);
    expect(parsed?.scenarios[0].params.power).toEqual(shared.params.power);
    expect(parsed?.scenarios[0].startUtc).toBe('2027-02-01T06:00:00');
    expect(parsed?.scenarios[0].label).toBe('Reviewed arrival');
    expect(parsed?.requirements.requiredHours).toBe(24);
    fireEvent.change(screen.getByRole('combobox', { name: 'Mission priority' }), { target: { value: 'gap' } });
    expect(screen.queryByRole('textbox', { name: 'Full comparison link' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Share comparison' }));
    const priorityLink = await screen.findByRole('textbox', { name: 'Full comparison link' });
    expect(parsePlan(new URL((priorityLink as HTMLInputElement).value).searchParams.get('plan')!)?.preferences).toEqual({ power: 1, contact: 1, gap: 5 });
    const openLink = within(screen.getByRole('article', { name: 'Reviewed arrival' })).getByRole('link', { name: 'Open forecast' });
    const scenarioPayload = new URL(openLink.getAttribute('href')!, window.location.origin).searchParams.get('scenario')!;
    expect(parsePlan(scenarioPayload)?.scenarios[0].params.power.batteryWh).toBe(20000);
    await waitFor(() => expect(parsePlan(window.localStorage.getItem('earthrise.landing-plan.v1')!)?.scenarios[0].label).toBe('Reviewed arrival'));
    expect(parsePlan(window.localStorage.getItem('earthrise.landing-plan.v1')!)?.preferences.gap).toBe(5);
  });

  it('rejects malformed imported settings without discarding the saved comparison', async () => {
    const source = createExploreStore(fileLoaders());
    await source.getState().init();
    window.localStorage.setItem('earthrise.landing-plan.v1', serializePlan([snapshotScenario(source.getState(), 'Keep this plan')]));
    window.history.replaceState(null, '', '/plan?plan=not-valid-json');
    await open();
    expect(screen.getByRole('alert').textContent).toMatch(/shared comparison is invalid/);
    expect(screen.getByRole('article', { name: 'Keep this plan' })).toBeTruthy();
  });

  it('keeps incomplete-terrain results provisional even when numerical requirements pass, and preserves failure reasons', async () => {
    const store = createExploreStore(fileLoaders({
      computeMask: async () => ({ mask: new Float64Array(720), siteHeightM: 0, failedTiles: 2 }),
    }));
    await store.getState().init();
    const scenario = snapshotScenario({ ...store.getState(), params: { ...store.getState().params, mastM: 3, power: { ...store.getState().params.power, panel: 'vertical', panelAzimuthDeg: 135 } } }, 'Incomplete terrain');
    window.history.replaceState(null, '', `/plan?${new URLSearchParams({ plan: serializePlan([scenario], { requiredHours: 0, minContactHours: 0, maxGapHours: 2160 }) })}`);
    render(<PlanningWorkbench store={store} />);
    const card = await screen.findByRole('article', { name: 'Incomplete terrain' }, { timeout: 20_000 });
    await waitFor(() => expect(within(card).queryByText('Calculating this scenario…')).toBeNull());
    expect(within(card).getByText('Requirements unconfirmed: incomplete terrain').className).not.toContain('text-good');
    expect(within(card).queryByText('Meets selected requirements')).toBeNull();
    expect(card.textContent).toContain('These estimates are provisional.');
    expect(card.textContent).toContain('saved fixed-panel azimuth 135° clockwise from north');
    expect(screen.getByRole('button', { name: 'Print comparison estimates' })).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Required continuous power (hours)' }), { target: { value: '2160' } });
    await waitFor(() => expect(card.textContent).toContain('Needs 2160 continuous powered hours; model gives'));
    expect(within(card).getByText('Requirements unconfirmed: incomplete terrain')).toBeTruthy();
    expect(within(card).queryByText('Does not meet selected requirements')).toBeNull();
  });
});
