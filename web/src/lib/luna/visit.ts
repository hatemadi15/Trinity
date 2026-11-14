/**
 * What this visit has learnt about Gemini's help for Luna's voice. Once one of her voice routes says it is not
 * available here (no key on the server, or the offline build), she asks neither again until the page is loaded anew,
 * and falls back without a word: the browser's voice for her replies, typing where the browser cannot listen.
 */
export interface GeminiVisit {
  unavailable(): boolean;
  markUnavailable(): void;
  /** Forgets it, as a new visit would. */
  reset(): void;
}

export function createVisit(): GeminiVisit {
  let gone = false;
  return {
    unavailable: () => gone,
    markUnavailable: () => {
      gone = true;
    },
    reset: () => {
      gone = false;
    },
  };
}

/** The app's own, shared by her voice and her recorder. */
export const geminiVisit = createVisit();
