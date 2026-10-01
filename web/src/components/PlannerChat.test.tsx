// @vitest-environment jsdom
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand';
import type { PlannerAnswer } from '@/lib/ai/client';
import type { Site } from '@/lib/data/loaders';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import type { AiMode, ExploreState } from '@/lib/store/explore';
import { plannerLog } from '@/lib/store/planner-log';
import { EXAMPLE_PROMPTS, PlannerChat } from './PlannerChat';

const sites = [
  ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
  ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
];

function fakeStore(aiMode: AiMode = 'live') {
  const calls: unknown[][] = [];
  const state = {
    status: 'ready',
    sites,
    site: sites[0],
    startUtc: '2027-01-01T00:00:00',
    days: 30,
    summary: null, // summarizeState returns null without a summary; the strip must cope
    power: null,
    aiMode,
    bestWindowNote: null,
    selectSite: vi.fn(async (id: string) => {
      calls.push(['selectSite', id]);
    }),
    addToCompare: vi.fn(async (id: string) => {
      calls.push(['addToCompare', id]);
    }),
    setWindow: vi.fn((startUtc: string, days: number) => {
      calls.push(['setWindow', startUtc, days]);
    }),
    setAudience: vi.fn(),
    setPower: vi.fn(),
    setParams: vi.fn(),
    removeFromCompare: vi.fn(),
    findBestWindow: vi.fn(async () => null),
    setAiMode: vi.fn((mode: AiMode) => {
      calls.push(['setAiMode', mode]);
    }),
  };
  const store = createStore<typeof state>(() => state) as unknown as StoreApi<ExploreState>;
  return { store, calls };
}

const answer = (partial: Partial<PlannerAnswer>): PlannerAnswer => ({ source: 'model', actions: [], reply: '', ...partial });

async function ask(prompt: string) {
  fireEvent.change(screen.getByLabelText('Ask the planner'), { target: { value: prompt } });
  fireEvent.submit(screen.getByRole('form', { name: 'Planner question' }));
}

describe('PlannerChat', () => {
  beforeEach(() => {
    plannerLog.getState().clear();
  });

  it('submits a question, applies the actions to the store and shows the reply with its source', async () => {
    const { store, calls } = fakeStore();
    const askFn = vi.fn(async () =>
      answer({ model: 'google/gemma-4-31b-it:free', actions: [{ type: 'select_site', id: 'nobile_rim_2' }], reply: 'Nobile Rim 2 selected.' }),
    );
    render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} defaultOpen />);
    await ask('show me nobile rim 2');
    await waitFor(() => expect(screen.getByText('Nobile Rim 2 selected.')).toBeTruthy());
    expect(calls).toEqual([['selectSite', 'nobile_rim_2']]);
    expect(screen.getByText(/answered by gemma-4-31b/)).toBeTruthy();
    expect(screen.getByText(/Selected Nobile Rim 2/)).toBeTruthy();
    expect(askFn).toHaveBeenCalledWith('show me nobile rim 2', null, 'live');
    expect((screen.getByLabelText('Ask the planner') as HTMLInputElement).value).toBe('');
  });

  it('shows the offline copy and the example chips when the request fails, and a chip fills the input', async () => {
    const { store } = fakeStore();
    render(
      <PlannerChat
        store={store}
        ask={async () => {
          throw new Error('Failed to fetch');
        }}
        navigate={vi.fn()}
        defaultOpen
      />,
    );
    const chips = screen.getAllByRole('button', { name: /^Try: / });
    expect(chips.map((c) => c.textContent?.replace(/^Try: /, ''))).toEqual(EXAMPLE_PROMPTS);
    expect(EXAMPLE_PROMPTS.length).toBe(4);
    await ask('anything');
    await waitFor(() => expect(screen.getByText(/The planner is offline/)).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /^Try: / }).length).toBe(4);
    fireEvent.click(screen.getByRole('button', { name: 'Try: Best 14-day window' }));
    expect((screen.getByLabelText('Ask the planner') as HTMLInputElement).value).toBe('Best 14-day window');
  });

  it('shows the rate-limit copy from the client', async () => {
    const { store } = fakeStore();
    render(<PlannerChat store={store} ask={async () => answer({ source: 'none', reply: 'Too many questions; try again in 12 s.', retryAfterS: 12 })} navigate={vi.fn()} defaultOpen />);
    await ask('open compare');
    await waitFor(() => expect(screen.getByText(/Too many questions; try again in 12 s/)).toBeTruthy());
  });

  it('labels rehearsed and matched answers, sends the demo mode, and navigates for open_page', async () => {
    const { store } = fakeStore('cached');
    const navigate = vi.fn();
    const askFn = vi
      .fn()
      .mockResolvedValueOnce(answer({ source: 'cache', reply: 'From the transcript.' }))
      .mockResolvedValueOnce(answer({ source: 'intent', actions: [{ type: 'open_page', page: 'compare' }], reply: 'Opening compare.' }));
    render(<PlannerChat store={store} ask={askFn} navigate={navigate} defaultOpen />);
    await ask('Show me Nobile Rim 2');
    await waitFor(() => expect(screen.getByText(/rehearsed answer/)).toBeTruthy());
    expect(askFn).toHaveBeenCalledWith('Show me Nobile Rim 2', null, 'cached');
    await ask('open compare');
    await waitFor(() => expect(screen.getByText(/matched your words/)).toBeTruthy());
    expect(navigate).toHaveBeenCalledWith('/compare');
  });

  it('drops actions for unknown sites on the client too', async () => {
    const { store, calls } = fakeStore();
    render(<PlannerChat store={store} ask={async () => answer({ actions: [{ type: 'select_site', id: 'atlantis' }], reply: 'Selected Atlantis.' })} navigate={vi.fn()} defaultOpen />);
    await ask('go to atlantis');
    await waitFor(() => expect(screen.getByText(/could not find "atlantis"/)).toBeTruthy());
    expect(calls).toEqual([]);
  });

  it('keeps the last five exchanges, newest first, and starts collapsed unless asked', async () => {
    const { store } = fakeStore();
    let n = 0;
    const askFn = vi.fn(async (prompt: string) => answer({ source: 'intent', reply: `Reply ${++n} to ${prompt}` }));
    const { unmount } = render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} defaultOpen />);
    for (let i = 1; i <= 6; i++) {
      await ask(`question ${i}`);
      await waitFor(() => expect(screen.getByText(`Reply ${i} to question ${i}`)).toBeTruthy());
    }
    const items = within(screen.getByRole('list', { name: 'Planner replies' })).getAllByRole('listitem');
    expect(items.length).toBe(5);
    expect(items[0].textContent).toMatch(/Reply 6/);
    expect(screen.queryByText(/Reply 1 to/)).toBeNull();
    unmount();
    plannerLog.getState().clear(); // nothing to show: the strip starts collapsed
    render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} />);
    expect(screen.queryByLabelText('Ask the planner')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Planner/ }));
    expect(screen.getByLabelText('Ask the planner')).toBeTruthy();
  });
});

describe('useDemoMode', () => {
  it('switches the store to cached answers when the URL carries ?demo=1', () => {
    const { store, calls } = fakeStore();
    window.sessionStorage.clear();
    window.history.pushState({}, '', '/explore?demo=1');
    renderHook(() => useDemoMode(store));
    expect(calls).toEqual([['setAiMode', 'cached']]);
    window.history.pushState({}, '', '/explore');
    window.sessionStorage.clear();
    const other = fakeStore();
    renderHook(() => useDemoMode(other.store));
    expect(other.calls).toEqual([]);
  });
});

describe('PlannerChat transcript and failures', () => {
  beforeEach(() => {
    plannerLog.getState().clear();
  });

  it('keeps the transcript across instances, as when open_page navigates to Compare', async () => {
    const { store } = fakeStore();
    const askFn = vi.fn(async () => answer({ source: 'intent', reply: 'Comparing two sites.' }));
    const first = render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} defaultOpen />);
    await ask('compare a and b');
    await waitFor(() => expect(screen.getByText('Comparing two sites.')).toBeTruthy());
    first.unmount();
    render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} defaultOpen />);
    expect(screen.getByText('Comparing two sites.')).toBeTruthy();
    expect(screen.getByText(/matched your words/)).toBeTruthy();
  });

  it('keeps the reply and notes the step when applying an action throws', async () => {
    const { store } = fakeStore();
    (store.getState().findBestWindow as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('window past the table end'));
    render(
      <PlannerChat store={store} ask={async () => answer({ source: 'intent', actions: [{ type: 'find_best_window', days: 14 }], reply: 'Scanning.' })} navigate={vi.fn()} defaultOpen />,
    );
    await ask('best 14-day window');
    await waitFor(() => expect(screen.getByText('Scanning.')).toBeTruthy());
    expect(screen.getByText(/could not be applied.*window past the table end/)).toBeTruthy();
    expect(screen.queryByText(/planner is offline/)).toBeNull();
  });
});

describe('useDemoMode persistence', () => {
  it('remembers demo mode for the session and forgets it with ?demo=0', () => {
    window.sessionStorage.clear();
    window.history.pushState({}, '', '/?demo=1');
    const a = fakeStore();
    renderHook(() => useDemoMode(a.store));
    expect(a.calls).toEqual([['setAiMode', 'cached']]);
    window.history.pushState({}, '', '/explore');
    const b = fakeStore();
    renderHook(() => useDemoMode(b.store));
    expect(b.calls).toEqual([['setAiMode', 'cached']]); // remembered from the landing page
    window.history.pushState({}, '', '/explore?demo=0');
    const c = fakeStore();
    renderHook(() => useDemoMode(c.store));
    expect(c.calls).toEqual([['setAiMode', 'live']]);
    window.history.pushState({}, '', '/explore');
    const d = fakeStore();
    renderHook(() => useDemoMode(d.store));
    expect(d.calls).toEqual([]);
  });
});

describe('PlannerChat opens when it has something to show', () => {
  beforeEach(() => {
    plannerLog.getState().clear();
  });

  it('starts open when the transcript already has an exchange, as on Compare after "compare A and B"', () => {
    const { store } = fakeStore();
    plannerLog.getState().push({ prompt: 'compare a and b', reply: 'Comparing two sites.', source: 'intent', notes: [] });
    render(<PlannerChat store={store} ask={vi.fn()} navigate={vi.fn()} />);
    expect(screen.getByLabelText('Ask the planner')).toBeTruthy();
    expect(screen.getByText('Comparing two sites.')).toBeTruthy();
    expect(screen.getByText(/matched your words/)).toBeTruthy();
  });

    it('as a panel is always open, says what the assistant does, and keeps "Ask" out of gold', () => {
      const { store } = fakeStore();
      render(<PlannerChat store={store} ask={vi.fn()} navigate={() => {}} variant="panel" />);
      const panel = screen.getByRole('region', { name: 'Ask in plain words' });
      expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('Ask in plain words');
      expect(panel.textContent).toMatch(/The assistant moves the controls for you\. It never invents numbers\./);
      expect(within(panel).getByLabelText('Ask the planner').className).toMatch(/\bfield\b/);
      const askButton = within(panel).getByRole('button', { name: 'Ask' });
      expect(askButton.className).toMatch(/\bbtn\b/);
      expect(askButton.className).not.toMatch(/btn-primary/);
      expect(within(panel).getAllByRole('button', { name: /^Try: / })).toHaveLength(EXAMPLE_PROMPTS.length);
      expect(within(panel).queryByRole('button', { expanded: true })).toBeNull(); // no collapse control
    });
});
