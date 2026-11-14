// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { createMaskSource } from '@/lib/scenario/masks';
import { PlanClient } from '@/lib/plan/search-client';
import { createPlanStore } from '@/lib/plan/store';
import { fileLoaders } from '@/test/file-loaders';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { EXAMPLE_SPEC, PlanView } from './PlanView';

afterEach(cleanup);

async function open(ask = vi.fn(async () => ({ source: 'none' as const, actions: [], reply: '' }))) {
  const explore = createExploreStore(fileLoaders());
  const plan = createPlanStore({ explore, masks: createMaskSource(fileLoaders()), client: () => new PlanClient() });
  const navigate = vi.fn();
  render(<PlanView store={explore} plan={plan} navigate={navigate} ask={ask} uncertainty={async () => { throw new Error('none'); }} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Plan a landing' })).toBeTruthy(), { timeout: 20_000 });
  return { explore, plan, navigate, ask };
}

describe('PlanView', () => {
  it('opens with one box for the words, under 120 words at 1440 and on a phone, and no gold button yet', async () => {
    await open();
    const main = screen.getByRole('main');
    for (const width of [WIDE, PHONE]) expect(visibleWords(main, width).length).toBeLessThanOrEqual(120);
    expect(screen.getByRole('textbox', { name: 'What does the mission need?' })).toBeTruthy();
    expect(main.querySelectorAll('.btn-primary')).toHaveLength(0);
  });

  it('shows what it heard as fields to check and change, with the defaults marked, before any search', async () => {
    const { plan } = await open();
    fireEvent.change(screen.getByRole('textbox', { name: 'What does the mission need?' }), { target: { value: EXAMPLE_SPEC } });
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    const heard = await screen.findByRole('region', { name: 'I heard' });
    expect(heard.textContent).toMatch(/^I heard/);
    expect((within(heard).getByRole('spinbutton', { name: /Power from landing/ }) as HTMLInputElement).value).toBe('5');
    expect((within(heard).getByRole('spinbutton', { name: /Load/ }) as HTMLInputElement).value).toBe('300');
    expect(heard.textContent).toMatch(/Defaults: Earth contact while powered no minimum; panel 4 m², turns to the Sun; .*stay 14 d/);
    expect(within(heard).getByRole('spinbutton', { name: /Load/ }).closest('label')!.textContent).not.toMatch(/default/);
    expect(plan.getState().answer).toBeNull();
    // A field changed here counts as said.
    fireEvent.change(within(heard).getByRole('spinbutton', { name: /Battery/ }), { target: { value: '5' } });
    expect(plan.getState().spec.lander.batteryWh).toBe(5000);
    expect(screen.getByRole('main').querySelectorAll('.btn-primary')).toHaveLength(1);
  });

  it('searches, ranks the sites with their landing times and reasons, and plans the chosen landing in Explore', async () => {
    const { explore, navigate } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Try the example' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Search 9 sites/ }));
    const answer = await screen.findByRole('region', { name: 'The answer' }, { timeout: 20_000 });
    expect(answer.textContent).toMatch(/of the 9 sites meet every requirement/);
    const items = within(answer).getAllByRole('listitem', { name: /^\d\. / });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].textContent).toMatch(/Lands \d{1,2} [A-Z][a-z]{2} 2027, \d\d:00 UTC/);
    expect(items[0].textContent).toMatch(/Meets: Power for at least 5 d/);
    expect(items[0].textContent).toMatch(/longer than at|ties with|meets every requirement/);
    expect(answer.textContent).toMatch(/Best among the 9 sites and 26,352 landing times tried/);
    for (const width of [WIDE, PHONE]) expect(visibleWords(screen.getByRole('main'), width).length).toBeLessThanOrEqual(500);
    fireEvent.click(within(items[0]).getByRole('button', { name: /^Plan this landing/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/explore\?site=/)));
    expect(explore.getState().params.power.loadW).toBe(300);
  });

  it('says which requirement fails everywhere when nothing meets them all', async () => {
    await open();
    fireEvent.change(screen.getByRole('textbox', { name: 'What does the mission need?' }), { target: { value: 'at least 60 days of power, a 2 kWh battery, a 500 watt load, landing in March 2027, at the Artemis III regions' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Search 9 sites/ }));
    const answer = await screen.findByRole('region', { name: 'The answer' }, { timeout: 20_000 });
    expect(answer.textContent).toMatch(/No site meets every requirement at any landing time tried\. Power for at least 60 d fails at every site and landing time: the most is/);
  });
});
