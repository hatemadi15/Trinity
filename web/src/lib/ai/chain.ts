/** One model's answer, or why it gave none (the reason names the model). */
export type CallResult = { content: string } | { error: string };

/** The least of the budget worth starting a request with; under it the chain stops as if the budget were spent. */
const MIN_CALL_MS = 10;

/**
 * Asks each candidate in turn (one timeout each, inside a total budget) and returns the first non-empty answer with the
 * candidate that gave it. HTTP errors, timeouts, transport failures and empty answers move the chain on; when every
 * candidate fails, the result carries every reason. Whoever the candidates are (OpenRouter's models, Gemini), the
 * rules are the same. Never throws.
 */
export async function runChain<C>(opts: {
  chain: readonly C[];
  /** The name a candidate's failures are reported under. */
  label: (c: C) => string;
  call: (c: C, signal: AbortSignal) => Promise<CallResult>;
  timeoutMs: number;
  /** Total time for the whole chain; each candidate gets the smaller of timeoutMs and what is left. */
  budgetMs?: number;
}): Promise<{ candidate: C; content: string } | { error: string }> {
  const { chain, label, call, timeoutMs, budgetMs } = opts;
  const deadline = budgetMs === undefined ? Infinity : Date.now() + budgetMs;
  const errors: string[] = [];
  for (const c of chain) {
    const remaining = deadline - Date.now();
    // No model answers in a few milliseconds, so a sliver of budget is as good as none: starting a request only
    // to abort it costs a call (and Date.now()'s whole milliseconds can read a hair short of a timer that has fired).
    if (remaining < MIN_CALL_MS) {
      errors.push(`budget of ${budgetMs} ms exhausted before ${label(c)}`);
      break;
    }
    const ms = Math.min(timeoutMs, remaining);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`timed out after ${ms} ms`));
      }, ms);
    });
    try {
      const r = await Promise.race([call(c, controller.signal), timeout]);
      if ('error' in r) {
        errors.push(r.error);
        continue;
      }
      if (!r.content) {
        errors.push(`${label(c)}: empty answer`);
        continue;
      }
      return { candidate: c, content: r.content };
    } catch (err) {
      errors.push(`${label(c)}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { error: errors.join('; ') || 'no model configured' };
}
