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

  it('shows the best landing of each month at the first three sites one tap away, under the rule, each opening that landing in Explore', async () => {
    const { navigate } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Try the example' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Search 9 sites/ }));
    const answer = await screen.findByRole('region', { name: 'The answer' }, { timeout: 20_000 });
    // One tap away, under the rule the results are ranked by.
    expect(answer.querySelector('table')!.closest('[hidden]')).not.toBeNull();
    fireEvent.click(within(answer).getByRole('button', { name: 'Ranking and dates' }));
    const table = within(answer).getByRole('table');
    expect(table.closest('[hidden]')).toBeNull();
    // March to June 2027, a row a month; a column for each of the first three sites, named as the results are.
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Mar 2027', 'Apr 2027', 'May 2027', 'Jun 2027']);
    const names = within(answer).getAllByRole('listitem', { name: /^\d\. / }).map((li) => li.getAttribute('aria-label')!.replace(/^\d\. /, ''));
    expect(within(table).getAllByRole('columnheader').slice(1).map((h) => h.textContent)).toEqual(names.slice(0, 3));
    expect(within(table).getByText(/^The best landing in each month of the window by the ranking above, at the first \d sites: its time with power from landing; ✓ meets every requirement\./)).toBeTruthy();
    const cell = within(table).getAllByRole('button', { name: /^Plan this landing: / })[0];
    fireEvent.click(cell);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/explore\?site=.+&start=2027-0[3-6]-\d\dT\d\d:00&days=14/)));
  });

  it('ranks by priorities when picked, gives every result its score and parts, and states the rule one tap away', async () => {
    const { plan } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Try the example' }));
    const heard = await screen.findByRole('region', { name: 'I heard' });
    fireEvent.click(within(heard).getByRole('button', { name: 'More settings' }));
    const rank = within(heard).getByRole('combobox', { name: /Then rank by/ }) as HTMLSelectElement;
    expect([...rank.options].map((o) => o.textContent)).toEqual([
      'Longest time with power',
      'Most Earth contact while powered',
      'Earliest landing',
      'Priorities: balanced (1, 1, 1)',
      'Priorities: mostly power (5, 1, 1)',
      'Priorities: mostly Earth in view (1, 5, 1)',
      'Priorities: mostly shorter gaps (1, 1, 5)',
      'Priorities: your own weights',
    ]);
    fireEvent.change(rank, { target: { value: 'weighed:custom' } });
    fireEvent.change(within(heard).getByRole('spinbutton', { name: 'Earth in view' }), { target: { value: '6' } });
    expect(plan.getState().spec).toMatchObject({ objective: 'weighed', priorities: { power: 1, contact: 6, gap: 1 } });
    expect(heard.textContent).toContain('Ranked by: requirements met first, then your priorities (power 1, Earth in view 6, shorter gaps 1)');
    // The settings fold closed again, as a planner leaves it once the ranking is set.
    fireEvent.click(within(heard).getByRole('button', { name: 'More settings' }));
    fireEvent.click(within(heard).getByRole('button', { name: /^Search 9 sites/ }));
    const answer = await screen.findByRole('region', { name: 'The answer' }, { timeout: 20_000 });
    const items = within(answer).getAllByRole('listitem', { name: /^\d\. / });
    // The reason each ranks above the next, in view.
    expect(items[0].textContent).toMatch(/It scores \d+\.\d against \d+\.\d for .+: |It meets every requirement|It ties with/);
    // Still one gold action, and still within the page's words once the answer is in.
    expect(screen.getByRole('main').querySelectorAll('.btn-primary')).toHaveLength(1);
    for (const width of [WIDE, PHONE]) expect(visibleWords(screen.getByRole('main'), width).length).toBeLessThanOrEqual(500);
    const how = within(answer).getByRole('button', { name: 'Ranking and dates' });
    fireEvent.click(how);
    expect(answer.textContent).toMatch(/Ranked by your priorities: power 1, Earth in view 6, shorter gaps 1\. .*0\.55x \+ 0\.30√x \+ 0\.15x².*A choice that fails a requirement ranks below every choice that meets them all/);
    // One tap away with the rule: each result's score and its three parts.
    const parts = within(answer).getAllByText(/^\d\. .+ scores \d+\.\d of 100: power \d+\.\d, Earth in view \d+\.\d, shorter gaps \d+\.\d\.$/);
    expect(parts).toHaveLength(items.length);
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
