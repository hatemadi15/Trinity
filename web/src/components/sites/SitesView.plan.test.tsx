// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMaskSource } from '@/lib/scenario/masks';
import { PlanClient } from '@/lib/plan/search-client';
import { createPlanStore } from '@/lib/plan/store';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { SitesView } from './SitesView';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

/** Choose a site at an address, with a planner of its own. */
async function ready(address = '/sites') {
  window.history.replaceState(null, '', address);
  const store = createExploreStore(fileLoaders());
  const plan = createPlanStore({ explore: store, masks: createMaskSource(fileLoaders()), client: () => new PlanClient() });
  const navigate = vi.fn();
  const none = async () => {
    throw new Error('none');
  };
  render(<SitesView store={store} plan={plan} planner={{ navigate, ask: vi.fn(async () => ({ source: 'none' as const, actions: [], reply: '' })), uncertainty: none }} />);
  await waitFor(() => expect(store.getState().status).toBe('ready'), { timeout: 20_000 });
  return { store, plan, navigate };
}
const address = () => `${window.location.pathname}${window.location.search}`;
const planButton = () => screen.getByRole('button', { name: 'Plan a landing' });
const pane = () => screen.queryByRole('region', { name: 'Plan a landing' });

describe('The planner on Choose a site (15 November, owner review)', () => {
  it('opens from the bar, beside List, as a named pane of glass with the focus on its heading, and says so in the address', async () => {
    await ready();
    const bar = document.querySelector<HTMLElement>('[data-part="bar"]')!;
    expect(within(bar).getAllByRole('button').map((b) => b.textContent?.replace(/^Dates.*/, 'Dates'))).toEqual(['Dates', 'List', 'Plan a landing']);
    expect(pane()).toBeNull();
    expect(planButton().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(planButton());
    expect(planButton().getAttribute('aria-expanded')).toBe('true');
    const region = pane()!;
    expect(region.id).toBe(planButton().getAttribute('aria-controls'));
    expect(region.className).toMatch(/(^|\s)pane(\s|$)/);
    expect(document.activeElement).toBe(within(region).getByRole('heading', { level: 2, name: 'Plan a landing' }));
    expect(within(region).getByRole('textbox', { name: 'What does the mission need?' })).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Try the example' })).toBeTruthy();
    expect(address()).toBe('/sites?plan=1');
    // No glass inside the glass, and no second solid button: the planner's own "Search" is the next step here.
    expect(region.querySelector('.panel, .pane')).toBeNull();
    expect(document.querySelectorAll('main .btn-primary')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Choose your own site' }).getAttribute('href')).toBe('/explore?own=1');
    // On a narrow screen it takes the map's place, as the list does; on a wide one it stands beside it.
    expect(document.querySelector('[data-part="maps"]')!.className).toBe('max-lg:hidden');
    expect(region.compareDocumentPosition(document.querySelector('[data-part="maps"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('closes with Escape, Close or its button, gives the focus back to its button and takes plan=1 off the address', async () => {
    await ready();
    fireEvent.click(planButton());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(pane()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(planButton()));
    expect(address()).toBe('/sites');
    expect(document.querySelector('[data-part="maps"]')!.className).toBe('');
    expect(document.querySelectorAll('main .btn-primary')).toHaveLength(1);
    fireEvent.click(planButton());
    fireEvent.click(within(pane()!).getByRole('button', { name: 'Close' }));
    expect(pane()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(planButton()));
    fireEvent.click(planButton());
    fireEvent.click(planButton());
    expect(pane()).toBeNull();
    // The list takes its place, and the address no longer names the planner.
    fireEvent.click(planButton());
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(pane()).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'All 34 sites' })).toBeTruthy();
    expect(address()).toBe('/sites');
  });

  it('opens at /sites?plan=1, where the old /plan address, Luna and the assistant lead', async () => {
    await ready('/sites?plan=1');
    await waitFor(() => expect(pane()).not.toBeNull());
    expect(planButton().getAttribute('aria-expanded')).toBe('true');
    expect(address()).toBe('/sites?plan=1');
  });

  it('runs the example in the pane, marks its ranked sites on the map and greys the others, and plans the chosen landing in Explore', async () => {
    const { plan, navigate, store } = await ready();
    fireEvent.click(planButton());
    const region = pane()!;
    fireEvent.click(within(region).getByRole('button', { name: 'Try the example' }));
    const heard = await within(region).findByRole('region', { name: 'I heard' });
    expect((within(heard).getByRole('spinbutton', { name: /Power from landing/ }) as HTMLInputElement).value).toBe('5');
    // No marker is singled out before an answer.
    expect(document.querySelector('[data-ranked]')).toBeNull();
    const search = within(heard).getByRole('button', { name: /^Search 9 sites/ });
    expect(search.className).toMatch(/\bbtn-primary\b/);
    expect(document.querySelectorAll('main .btn-primary')).toHaveLength(1);
    fireEvent.click(search);
    const answer = await within(region).findByRole('region', { name: 'The answer' }, { timeout: 20_000 });
    const items = within(answer).getAllByRole('listitem', { name: /^\d\. / });
    expect(items[0].textContent).toMatch(/Meets: Power for at least 5 d/);
    // The ranked sites' markers stand out, numbered in the answer's order; every other one greys out.
    const shown = plan.getState().answer!.shown.map((f) => f.site.id);
    const markers = [...document.querySelectorAll<HTMLElement>('a[data-marker]')];
    const ranked = markers.filter((m) => m.dataset.ranked).sort((a, b) => Number(a.dataset.ranked) - Number(b.dataset.ranked));
    expect(ranked.map((m) => m.dataset.marker)).toEqual(shown.filter((id) => markers.some((m) => m.dataset.marker === id)));
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].getAttribute('aria-label')).toMatch(/, number 1 in the plan$/);
    expect(ranked.every((m) => m.dataset.dim === undefined)).toBe(true);
    expect(markers.filter((m) => !m.dataset.ranked).every((m) => m.dataset.dim === 'true')).toBe(true);
    // A marker pointed at still wins, as before.
    fireEvent.mouseEnter(markers.find((m) => !m.dataset.ranked)!);
    expect(ranked[0].dataset.dim).toBe('true');
    fireEvent.mouseLeave(markers.find((m) => !m.dataset.ranked)!);
    // Opening a result goes to Explore, as it did on the planner's own page.
    fireEvent.click(within(items[0]).getByRole('button', { name: /^Plan this landing/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/explore\?site=/)));
    expect(store.getState().params.power.loadW).toBe(300);
    // With the pane closed the map is as it was.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-ranked]')).toBeNull();
    expect(document.querySelector('a[data-marker][data-dim]')).toBeNull();
  });
});
