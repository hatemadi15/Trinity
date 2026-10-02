'use client';
import { useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { applyActions, describeDropped, validateActions } from '@/lib/ai/actions';
import { askPlanner, shortModel, type PlannerAnswer } from '@/lib/ai/client';
import { summarizeState, type StateSummary } from '@/lib/ai/state-summary';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { exploreStore, type AiMode, type ExploreState } from '@/lib/store/explore';
import { plannerLog, type Exchange } from '@/lib/store/planner-log';

export type Ask = (prompt: string, state: StateSummary | null, mode: AiMode) => Promise<PlannerAnswer>;

/** The four chips shown while the transcript is empty; each is one of the rehearsed prompts. */
export const EXAMPLE_PROMPTS = ['Show me Nobile Rim 2', 'Compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days', 'Find the best landing date for 14 days', 'Explain the longest night'];

const OFFLINE = 'The assistant is offline; the app works without it. Try one of the example questions below, or ask again in a moment.';

function sourceLabel(x: Exchange): string {
  switch (x.source) {
    case 'model':
      return `answered by ${x.model ? shortModel(x.model) : 'the model'}`;
    case 'cache':
      return 'rehearsed answer';
    case 'intent':
      return 'matched your words';
    case 'none':
      return 'no answer';
    default:
      return 'assistant offline';
  }
}

/**
 * One input, one reply, one source line: the assistant's panel. Questions go to /api/chat with the
 * compact state; the answer's actions are validated against the catalogue again here and applied
 * to the store, so the same words drive Explore and Compare whether the model, a rehearsed
 * transcript or the intent matcher answered. The transcript lives in `plannerLog`, so it survives
 * the page change an answer may trigger.
 */
export function PlannerChat({
  store = exploreStore,
  ask = askPlanner,
  navigate,
}: {
  store?: StoreApi<ExploreState>;
  ask?: Ask;
  navigate?: (href: string) => void;
}) {
  const aiMode = useStore(store, (s) => s.aiMode);
  const exchanges = useStore(plannerLog, (s) => s.exchanges);
  const routerNavigate = useNavigate();
  const go = navigate ?? routerNavigate;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const panelBox = useRef<HTMLInputElement>(null);

  async function submit(prompt: string) {
    const q = prompt.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    let a: PlannerAnswer;
    try {
      a = await ask(q, summarizeState(store.getState()), store.getState().aiMode);
    } catch {
      plannerLog.getState().push({ prompt: q, reply: OFFLINE, source: 'error', notes: [] });
      setBusy(false);
      return;
    }
    const ids = new Set(store.getState().sites.map((s) => s.id));
    const { actions, dropped } = validateActions(a.actions, ids);
    let notes: string[];
    try {
      notes = await applyActions(store, actions, go);
    } catch (err) {
      // The answer stands; only the step failed (for example a window past the end of the table).
      notes = [`One step could not be applied: ${err instanceof Error ? err.message : String(err)}.`];
    }
    const skipped = describeDropped([...(a.dropped ?? []), ...dropped]);
    plannerLog.getState().push({ prompt: q, reply: a.reply, source: a.source, model: a.model, notes: skipped ? [...notes, skipped] : notes });
    setBusy(false);
  }

  const showChips = exchanges.length === 0 || exchanges[0].source === 'error';
  return (
    <section aria-label="Ask in plain words" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="display text-[23px] font-semibold">Ask in plain words</h2>
        <p className="text-[15px] text-ink-2">
          The assistant moves the controls for you. It never invents numbers.
          {aiMode === 'cached' && ' Demo mode: rehearsed answers.'}
        </p>
      </div>
      <form
        aria-label="Question for the assistant"
        className="mt-3 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          // An empty question sends nothing: the cursor goes to the box instead.
          if (!input.trim()) panelBox.current?.focus();
          else void submit(input);
        }}
      >
        <input
          ref={panelBox}
          type="text"
          aria-label="Ask the assistant"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a question about a site, a date or the lander"
          maxLength={500}
          className="field min-w-[260px] flex-1 placeholder:text-ink-3"
        />
        <button type="submit" disabled={busy} className="btn h-[52px]">
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      {showChips && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button key={p} type="button" aria-label={`Try: ${p}`} onClick={() => setInput(p)} className="min-h-[40px] rounded-full border border-line-strong px-4 text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              {p}
            </button>
          ))}
        </div>
      )}
      {exchanges.length > 0 && (
        <ol aria-label="Replies from the assistant" className="mt-4 flex flex-col gap-3">
          {exchanges.map((x, i) => (
            <li key={x.id} className={i === 0 ? 'text-ink' : 'text-ink-2'}>
              <p className={i === 0 ? 'text-base' : 'text-[15px]'}>{x.reply}</p>
              {x.notes.length > 0 && <p className="text-[15px] text-ink-2">{x.notes.join(' ')}</p>}
              <p className="text-[15px] text-ink-2">
                {sourceLabel(x)}, after you asked “{x.prompt}”
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
