'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { applyActions, describeDropped, validateActions } from '@/lib/ai/actions';
import { askPlanner, shortModel, type PlannerAnswer } from '@/lib/ai/client';
import { summarizeState, type StateSummary } from '@/lib/ai/state-summary';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { exploreStore, type AiMode, type ExploreState } from '@/lib/store/explore';
import { scenarioStore, type ScenarioState } from '@/lib/store/scenarios';
import { plannerLog, type Exchange } from '@/lib/store/planner-log';
import { hearSpec } from '@/lib/plan/spec';
import { planStore, type PlanState } from '@/lib/plan/store';

export type Ask = (prompt: string, state: StateSummary | null, mode: AiMode) => Promise<PlannerAnswer>;

/** The four chips shown until something answers; each is one of the rehearsed prompts, asked as soon as it is clicked. */
export const EXAMPLE_PROMPTS = ['Show me Nobile Rim 2', 'Compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days', 'Find the best landing date for 14 days', 'Explain the longest night'];

const OFFLINE = 'The assistant is offline; the app works without it. Try one of the example questions below, or ask again in a moment.';
/** After this many seconds a question still out gets a line on why it can take a while. */
const SLOW_AFTER_S = 8;

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
  scenarios = scenarioStore,
  ask = askPlanner,
  navigate,
  plan = planStore,
}: {
  store?: StoreApi<ExploreState>;
  /** The comparison an answer may start ("compare with a five-day delay"); by default the app's. */
  scenarios?: StoreApi<ScenarioState>;
  ask?: Ask;
  navigate?: (href: string) => void;
  /** The planner's store (spec 23), which a mission's specification goes to. */
  plan?: StoreApi<PlanState>;
}) {
  const aiMode = useStore(store, (s) => s.aiMode);
  const exchanges = useStore(plannerLog, (s) => s.exchanges);
  const routerNavigate = useNavigate();
  const go = navigate ?? routerNavigate;
  const [input, setInput] = useState('');
  // The question that is out, if any: the pending row shows it, and no second one is sent meanwhile.
  const [pending, setPending] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const busy = pending !== null;
  const panelBox = useRef<HTMLInputElement>(null);

  // The wait is counted in whole seconds, as text: nothing on the page moves by itself.
  useEffect(() => {
    if (pending === null) return;
    const tick = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, [pending]);

  async function submit(prompt: string) {
    const q = prompt.trim();
    if (!q || busy) return;
    setPending(q);
    setSeconds(0);
    // The box keeps the question while it is out, so the visitor sees what was asked; anything typed meanwhile stays.
    const done = () => {
      setInput((now) => (now.trim() === q ? '' : now));
      setPending(null);
    };
    // A mission's specification (two fields or more) is the planner's: read here, before any model, and shown back there.
    if (Object.keys(hearSpec(q, store.getState().sites).patch).length >= 2) {
      const reply = plan.getState().hear(q);
      go('/plan');
      plannerLog.getState().push({ prompt: q, reply, source: 'intent', notes: ['Opened the planner: check the fields there, then search.'] });
      done();
      return;
    }
    let a: PlannerAnswer;
    try {
      a = await ask(q, summarizeState(store.getState()), store.getState().aiMode);
    } catch {
      plannerLog.getState().push({ prompt: q, reply: OFFLINE, source: 'error', notes: [] });
      done();
      return;
    }
    const ids = new Set(store.getState().sites.map((s) => s.id));
    const { actions, dropped } = validateActions(a.actions, ids);
    let notes: string[];
    try {
      notes = await applyActions(store, actions, go, scenarios, q);
    } catch (err) {
      // The answer stands; only the step failed (for example a window past the end of the table).
      notes = [`One step could not be applied: ${err instanceof Error ? err.message : String(err)}.`];
    }
    const skipped = describeDropped([...(a.dropped ?? []), ...dropped]);
    // A step's note that repeats the reply word for word (an explanation, "Selected …") would show the same text twice.
    const said = a.reply.trim();
    const fresh = notes.filter((n) => n.trim() !== said);
    plannerLog.getState().push({ prompt: q, reply: a.reply, source: a.source, model: a.model, notes: skipped ? [...fresh, skipped] : fresh });
    done();
  }

  // The examples stay until something answers: after an offline or "no answer" reply they are the way on.
  const showChips = exchanges.length === 0 || exchanges[0].source === 'error' || exchanges[0].source === 'none';
  return (
    <section id="ask" aria-label="Ask in plain words" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="display text-[23px] font-semibold">Ask in plain words</h2>
        <p className="text-[15px] text-ink-2">
          {/* Not "never invents numbers": the check also lets through 14, 30, 90 and any number the visitor typed. */}
          The assistant moves the controls for you. Numbers it cannot match to the app&apos;s figures are removed.
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
          placeholder="Ask about a site or a date"
          maxLength={500}
          className="field min-w-[260px] flex-1 placeholder:text-ink-3"
        />
        <button type="submit" disabled={busy} className="btn h-[52px]">
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      {pending !== null && (
        <div role="status" className="mt-3 text-[15px] text-ink-2">
          {/* The seconds are for the eye: a live region that changed every second would be read out every second. */}
          <p>
            “{pending}”, {aiMode === 'cached' ? 'looking for a rehearsed answer…' : 'asking the model…'} <span aria-hidden="true">{seconds} s</span>
          </p>
          {aiMode !== 'cached' && seconds >= SLOW_AFTER_S && <p>Free models can be slow; if none answers, the app replies from its own phrasings.</p>}
        </div>
      )}
      {showChips && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              aria-label={`Try: ${p}`}
              onClick={() => {
                setInput(p);
                void submit(p);
              }}
              className="min-h-[40px] rounded-full border border-line-strong px-4 text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {/* Always in the page, even empty, so the first reply is read out too: a live region must be there before it changes. */}
      <ol aria-label="Replies from the assistant" aria-live="polite" className={exchanges.length > 0 ? 'mt-4 flex flex-col gap-3' : undefined}>
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
    </section>
  );
}
