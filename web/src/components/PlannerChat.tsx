'use client';
import { useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { applyActions, describeDropped, validateActions } from '@/lib/ai/actions';
import { askPlanner, shortModel, type PlannerAnswer } from '@/lib/ai/client';
import { summarizeState, type StateSummary } from '@/lib/ai/state-summary';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { exploreStore, type AiMode, type ExploreState } from '@/lib/store/explore';
import { plannerLog, type Exchange } from '@/lib/store/planner-log';

export type Ask = (prompt: string, state: StateSummary | null, mode: AiMode) => Promise<PlannerAnswer>;

/** The four chips shown while the transcript is empty; each is one of the rehearsed prompts. */
export const EXAMPLE_PROMPTS = ['Show me Nobile Rim 2', 'Compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days', 'Best 14-day window', 'Explain the longest night'];

const OFFLINE = 'The planner is offline; the app works without it. Try one of the example questions below, or ask again in a moment.';

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
      return 'planner offline';
  }
}

/**
 * One input, one reply, one source line: the planner strip. Questions go to /api/chat with the
 * compact state; the answer's actions are validated against the catalogue again here and applied
 * to the store, so the same words drive Explore and Compare whether the model, a rehearsed
 * transcript or the intent matcher answered. The transcript lives in `plannerLog`, so it survives
 * the page change an answer may trigger.
 */
export function PlannerChat({
  store = exploreStore,
  ask = askPlanner,
  navigate,
  defaultOpen = false,
}: {
  store?: StoreApi<ExploreState>;
  ask?: Ask;
  navigate?: (href: string) => void;
  defaultOpen?: boolean;
}) {
  const aiMode = useStore(store, (s) => s.aiMode);
  const exchanges = useStore(plannerLog, (s) => s.exchanges);
  const routerNavigate = useNavigate();
  const go = navigate ?? routerNavigate;
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

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
  const latest = exchanges[0];
  return (
    <section aria-label="Planner" className="rounded-md bg-panel px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-1 text-left text-sm text-ink"
      >
        <span>
          Planner: ask in plain words
          {aiMode === 'cached' && <span className="text-ink-3"> (demo mode, rehearsed answers)</span>}
          {!open && latest && <span className="text-ink-3"> — {latest.reply.slice(0, 80)}</span>}
        </span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 py-3">
          <form
            aria-label="Planner question"
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(input);
            }}
          >
            <input
              type="text"
              aria-label="Ask the planner"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the planner: compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days"
              maxLength={500}
              className="min-w-[280px] flex-1 rounded-md border border-line bg-bg px-3 py-1.5 text-ink placeholder:text-ink-3"
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-md border border-sun px-3 py-1 text-sm text-ink hover:bg-bg disabled:opacity-50">
              {busy ? 'Thinking…' : 'Ask'}
            </button>
          </form>
          {showChips && (
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={`Try: ${p}`}
                  onClick={() => setInput(p)}
                  className="rounded-full border border-line px-3 py-0.5 text-xs text-ink-2 hover:border-sun hover:text-ink"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {exchanges.length > 0 && (
            <ol aria-label="Planner replies" className="flex flex-col gap-3">
              {exchanges.map((x, i) => (
                <li key={x.id} className={i === 0 ? 'text-ink' : 'text-ink-3'}>
                  <p className={i === 0 ? 'text-sm' : 'text-xs'}>{x.reply}</p>
                  {x.notes.length > 0 && <p className="text-xs text-ink-2">{x.notes.join(' ')}</p>}
                  <p className="text-xs text-ink-3">
                    {sourceLabel(x)} · you asked: “{x.prompt}”
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
