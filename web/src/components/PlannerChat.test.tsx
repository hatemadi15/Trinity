// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand';
import { TRANSCRIPTS } from '@/lib/ai/cache';
import type { PlannerAnswer } from '@/lib/ai/client';
import type { Site } from '@/lib/data/loaders';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { matchIntent } from '@/lib/ai/intents';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import type { AiMode, ExploreState } from '@/lib/store/explore';
import { plannerLog } from '@/lib/store/planner-log';
import { createExploreStore } from '@/lib/store/explore';
import { createScenarioStore } from '@/lib/store/scenarios';
import { fileLoaders } from '@/test/file-loaders';
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
  fireEvent.change(screen.getByLabelText('Ask the assistant'), { target: { value: prompt } });
  fireEvent.submit(screen.getByRole('form', { name: 'Question for the assistant' }));
}

describe('PlannerChat', () => {
  beforeEach(() => {
    plannerLog.getState().clear();
  });

  it('names Gemini in the source line when Gemini answered', async () => {
    const { store } = fakeStore();
    const askFn = vi.fn(async () => answer({ model: 'gemini-2.5-flash', actions: [{ type: 'select_site', id: 'nobile_rim_2' }], reply: 'Nobile Rim 2 selected.' }));
    render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} />);
    await ask('please pick the Nobile site for me');
    await waitFor(() => expect(screen.getByText(/answered by Gemini 2\.5 Flash, after you asked/)).toBeTruthy());
  });

  it('submits a question, applies the actions to the store and shows the reply with its source', async () => {
    const { store, calls } = fakeStore();
    const askFn = vi.fn(async () =>
      answer({ model: 'google/gemma-4-31b-it:free', actions: [{ type: 'select_site', id: 'nobile_rim_2' }], reply: 'Nobile Rim 2 selected.' }),
    );
    render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} />);
    await ask('show me nobile rim 2');
    await waitFor(() => expect(screen.getByText('Nobile Rim 2 selected.')).toBeTruthy());
    expect(calls).toEqual([['selectSite', 'nobile_rim_2']]);
    expect(screen.getByText(/answered by gemma-4-31b/)).toBeTruthy();
    expect(screen.getByText(/Selected Nobile Rim 2/)).toBeTruthy();
    expect(askFn).toHaveBeenCalledWith('show me nobile rim 2', null, 'live');
    expect((screen.getByLabelText('Ask the assistant') as HTMLInputElement).value).toBe('');
  });

  it('shows the offline copy and the example chips when the request fails', async () => {
    const { store } = fakeStore();
    render(
      <PlannerChat
        store={store}
        ask={async () => {
          throw new Error('Failed to fetch');
        }}
        navigate={vi.fn()}
      />,
    );
    const chips = screen.getAllByRole('button', { name: /^Try: / });
    expect(chips.map((c) => c.textContent?.replace(/^Try: /, ''))).toEqual(EXAMPLE_PROMPTS);
    expect(EXAMPLE_PROMPTS.length).toBe(4);
    await ask('anything');
    await waitFor(() => expect(screen.getByText(/The assistant is offline/)).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /^Try: / }).length).toBe(4);
  });

  it('offers only examples the app answers without the model, in the words the pages use', () => {
    for (const p of EXAMPLE_PROMPTS) {
      expect(matchIntent(p, sites), p).not.toBeNull();
      expect(p).not.toMatch(/window|skyline|verdict/i);
    }
  });

  it('shows the rate-limit copy from the client', async () => {
    const { store } = fakeStore();
    render(<PlannerChat store={store} ask={async () => answer({ source: 'none', reply: 'Too many questions; try again in 12 s.', retryAfterS: 12 })} navigate={vi.fn()} />);
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
    render(<PlannerChat store={store} ask={askFn} navigate={navigate} />);
    await ask('Show me Nobile Rim 2');
    // The source line, not the header's "Demo mode: rehearsed answers." nor the row shown while the answer is looked up.
    await waitFor(() => expect(screen.getByText(/^rehearsed answer, after you asked/)).toBeTruthy());
    expect(askFn).toHaveBeenCalledWith('Show me Nobile Rim 2', null, 'cached');
    await ask('open compare');
    await waitFor(() => expect(screen.getByText(/matched your words/)).toBeTruthy());
    expect(navigate).toHaveBeenCalledWith('/compare');
  });

  it('drops actions for unknown sites on the client too', async () => {
    const { store, calls } = fakeStore();
    render(<PlannerChat store={store} ask={async () => answer({ actions: [{ type: 'select_site', id: 'atlantis' }], reply: 'Selected Atlantis.' })} navigate={vi.fn()} />);
    await ask('go to atlantis');
    await waitFor(() => expect(screen.getByText(/could not find "atlantis"/)).toBeTruthy());
    expect(calls).toEqual([]);
  });

  it('keeps the last five exchanges, newest first', async () => {
    const { store } = fakeStore();
    let n = 0;
    const askFn = vi.fn(async (prompt: string) => answer({ source: 'intent', reply: `Reply ${++n} to ${prompt}` }));
    const { unmount } = render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} />);
    for (let i = 1; i <= 6; i++) {
      await ask(`question ${i}`);
      await waitFor(() => expect(screen.getByText(`Reply ${i} to question ${i}`)).toBeTruthy());
    }
    const items = within(screen.getByRole('list', { name: 'Replies from the assistant' })).getAllByRole('listitem');
    expect(items.length).toBe(5);
    expect(items[0].textContent).toMatch(/Reply 6/);
    expect(screen.queryByText(/Reply 1 to/)).toBeNull();
    unmount();
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
    const first = render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} />);
    await ask('compare a and b');
    await waitFor(() => expect(screen.getByText('Comparing two sites.')).toBeTruthy());
    first.unmount();
    render(<PlannerChat store={store} ask={askFn} navigate={vi.fn()} />);
    expect(screen.getByText('Comparing two sites.')).toBeTruthy();
    expect(screen.getByText(/matched your words/)).toBeTruthy();
  });

  it('keeps the reply and notes the step when applying an action throws', async () => {
    const { store } = fakeStore();
    (store.getState().findBestWindow as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('window past the table end'));
    render(
      <PlannerChat store={store} ask={async () => answer({ source: 'intent', actions: [{ type: 'find_best_window', days: 14 }], reply: 'Scanning.' })} navigate={vi.fn()} />,
    );
    await ask('best 14-day window');
    await waitFor(() => expect(screen.getByText('Scanning.')).toBeTruthy());
    expect(screen.getByText(/could not be applied.*window past the table end/)).toBeTruthy();
    expect(screen.queryByText(/assistant is offline/)).toBeNull();
  });
});

/** A stand-in for /api/chat: the route's JSON for every question, so the real client reads it. */
function chatRoute(body: (prompt: string) => Record<string, unknown>) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const { prompt } = JSON.parse(String(init?.body)) as { prompt: string };
    return new Response(JSON.stringify(body(prompt)), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

describe('PlannerChat through the client', () => {
  beforeEach(() => {
    plannerLog.getState().clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explain shows its paragraph once', async () => {
    const { store } = fakeStore();
    const t = TRANSCRIPTS.find((x) => x.id === 'explain_longest_night')!;
    // The rehearsed reply is the paragraph, and the explain step adds the same paragraph as its note.
    vi.stubGlobal('fetch', chatRoute(() => ({ source: 'cache', actions: t.actions, reply: t.reply })));
    render(<PlannerChat store={store} navigate={vi.fn()} />);
    await ask('Explain the longest night');
    await waitFor(() => expect(screen.getByText(/^rehearsed answer, after you asked/)).toBeTruthy());
    const shown = screen.getByRole('list', { name: 'Replies from the assistant' }).textContent ?? '';
    expect(shown.split('The longest night is the longest run of hours').length - 1).toBe(1);
  });

  it('an example button asks at once', async () => {
    const { store } = fakeStore();
    const route = chatRoute((prompt) => ({ source: 'intent', actions: [], reply: `Answer to ${prompt}.` }));
    vi.stubGlobal('fetch', route);
    render(<PlannerChat store={store} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try: Find the best landing date for 14 days' }));
    // The box shows what was asked while the answer is on its way.
    const box = screen.getByLabelText('Ask the assistant') as HTMLInputElement;
    expect(box.value).toBe('Find the best landing date for 14 days');
    await waitFor(() => expect(screen.getByText('Answer to Find the best landing date for 14 days.')).toBeTruthy());
    expect(route).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(route.mock.calls[0][1]?.body)).prompt).toBe('Find the best landing date for 14 days');
    expect(box.value).toBe('');
  });

  it('the examples come back when nothing answered', async () => {
    const { store } = fakeStore();
    vi.stubGlobal(
      'fetch',
      chatRoute((prompt) =>
        prompt === 'open compare'
          ? { source: 'intent', actions: [], reply: 'Opening Compare sites.' }
          : { source: 'none', reason: 'model-busy', actions: [], reply: 'The language model did not answer just now, so only set phrasings work.' },
      ),
    );
    render(<PlannerChat store={store} navigate={vi.fn()} />);
    await ask('open compare');
    await waitFor(() => expect(screen.getByText('Opening Compare sites.')).toBeTruthy());
    expect(screen.queryAllByRole('button', { name: /^Try: / })).toHaveLength(0);
    await ask('what is the meaning of life');
    await waitFor(() => expect(screen.getByText(/did not answer just now/)).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /^Try: / })).toHaveLength(EXAMPLE_PROMPTS.length);
  });
});

describe('PlannerChat while the model is asked', () => {
  beforeEach(() => {
    plannerLog.getState().clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** An ask that answers only when the test says so. */
  function heldAsk() {
    let answerNow: (a: PlannerAnswer) => void = () => {};
    const fn = vi.fn(() => new Promise<PlannerAnswer>((resolve) => (answerNow = resolve)));
    return { fn, answer: (a: PlannerAnswer) => answerNow(a) };
  }

  it('shows the question and the seconds while the model is asked', async () => {
    const { store } = fakeStore();
    const held = heldAsk();
    render(<PlannerChat store={store} ask={held.fn} navigate={vi.fn()} />);
    await ask('what is the meaning of life');
    expect(screen.getByRole('status').textContent).toBe('“what is the meaning of life”, asking the model… 0 s');
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole('status').textContent).toBe('“what is the meaning of life”, asking the model… 3 s');
  });

  it('after eight seconds says free models can be slow', async () => {
    const { store } = fakeStore();
    const held = heldAsk();
    render(<PlannerChat store={store} ask={held.fn} navigate={vi.fn()} />);
    await ask('what is the meaning of life');
    act(() => vi.advanceTimersByTime(7000));
    expect(screen.getByRole('status').textContent).not.toMatch(/Free models/);
    act(() => vi.advanceTimersByTime(1000));
    const lines = [...screen.getByRole('status').querySelectorAll('p')].map((p) => p.textContent);
    expect(lines).toEqual(['“what is the meaning of life”, asking the model… 8 s', 'Free models can be slow; if none answers, the app replies from its own phrasings.']);
  });

  it('in demo mode says it looks for a rehearsed answer, since no model is asked', async () => {
    const { store } = fakeStore('cached');
    const held = heldAsk();
    render(<PlannerChat store={store} ask={held.fn} navigate={vi.fn()} />);
    await ask('Show me Nobile Rim 2');
    act(() => vi.advanceTimersByTime(9000));
    expect(screen.getByRole('status').textContent).toBe('“Show me Nobile Rim 2”, looking for a rehearsed answer… 9 s');
  });

  it('the row goes when the reply comes', async () => {
    const { store } = fakeStore();
    const held = heldAsk();
    render(<PlannerChat store={store} ask={held.fn} navigate={vi.fn()} />);
    await ask('open compare');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status')).toBeTruthy();
    await act(async () => held.answer(answer({ source: 'intent', reply: 'Opening Compare sites.' })));
    expect(screen.getByText('Opening Compare sites.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    // Replies are read out as they arrive.
    expect(screen.getByRole('list', { name: 'Replies from the assistant' }).getAttribute('aria-live')).toBe('polite');
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
    expect(screen.getByLabelText('Ask the assistant')).toBeTruthy();
    expect(screen.getByText('Comparing two sites.')).toBeTruthy();
    expect(screen.getByText(/matched your words/)).toBeTruthy();
  });

    it('as a panel is always open, says what the assistant does, and keeps "Ask" out of gold', () => {
      const { store } = fakeStore();
      render(<PlannerChat store={store} ask={vi.fn()} navigate={() => {}} />);
      const panel = screen.getByRole('region', { name: 'Ask in plain words' });
      expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('Ask in plain words');
      // The number check removes what it cannot match; it also lets the window lengths and the visitor's own figures through.
      expect(panel.textContent).toMatch(/It moves the controls\. Numbers it cannot match to the app's figures are removed\./);
      expect(panel.textContent).not.toMatch(/never invents/);
      expect(within(panel).getByLabelText('Ask the assistant').className).toMatch(/\bfield\b/);
      const askButton = within(panel).getByRole('button', { name: 'Ask' });
      expect(askButton.className).toMatch(/\bbtn\b/);
      expect(askButton.className).not.toMatch(/btn-primary/);
      expect(within(panel).getAllByRole('button', { name: /^Try: / })).toHaveLength(EXAMPLE_PROMPTS.length);
      expect(within(panel).queryByRole('button', { expanded: true })).toBeNull(); // no collapse control
    });

    it('as a panel reads as ready: the box says what to type and Ask is never greyed out before a question', () => {
      const { store } = fakeStore();
      const ask = vi.fn();
      render(<PlannerChat store={store} ask={ask} navigate={() => {}} />);
      const panel = screen.getByRole('region', { name: 'Ask in plain words' });
      const box = within(panel).getByLabelText('Ask the assistant');
      expect(box.getAttribute('placeholder')).toBe('Ask about a site or a date');
      const askButton = within(panel).getByRole('button', { name: 'Ask' }) as HTMLButtonElement;
      expect(askButton.disabled).toBe(false);
      // An empty question sends nothing and puts the cursor in the box.
      fireEvent.click(askButton);
      expect(ask).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(box);
    });

  it('starts a comparison when an answer compares the landing with a delay, in the comparison it is given', async () => {
    const loaders = fileLoaders();
    const explore = createExploreStore(loaders);
    await explore.getState().init();
    const scenarios = createScenarioStore(explore, loaders);
    const navigate = vi.fn();
    const ask = async () => answer({ source: 'intent', actions: [{ type: 'compare_shift', hours: 120 }], reply: 'Comparing this landing with the same one 5 days later.' });
    render(<PlannerChat store={explore} scenarios={scenarios} ask={ask} navigate={navigate} />);
    fireEvent.change(screen.getByLabelText('Ask the assistant'), { target: { value: 'Compare with a five-day delay' } });
    fireEvent.submit(screen.getByLabelText('Ask the assistant').closest('form')!);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/compare'));
    expect(scenarios.getState().scenarios.map((x) => [x.label, x.startUtc])).toEqual([
      ['Original landing', '2027-01-01T00:00:00'],
      ['5 days later', '2027-01-06T00:00:00'],
    ]);
  });
});
