/**
 * The browser's own voice, for Luna (spec 22): its speech recognition (Chrome, Edge and Safari have one; Firefox has
 * none, and there Luna takes typed words) and its speech synthesis for her replies. Nothing is sent anywhere by the
 * app; a browser's recognition may use its maker's servers, as Chrome's does.
 */

/** The parts of the browser's SpeechRecognition that Luna uses. */
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
export type RecognitionCtor = new () => Recognition;

/** The browser's speech recognition, by its standard name or Chrome's and Safari's prefixed one; null where there is none. */
export function recognitionCtor(w: Window = window): RecognitionCtor | null {
  const W = w as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return W.SpeechRecognition ?? W.webkitSpeechRecognition ?? null;
}

/** Voices that read clearly, best first, as the systems name them. */
const CLEAR = ['Google UK English Female', 'Microsoft Libby', 'Microsoft Sonia', 'Microsoft Aria', 'Microsoft Jenny', 'Samantha', 'Serena', 'Karen', 'Moira', 'Tessa', 'Google US English', 'Microsoft Zira'];

/** A clear English voice: a known good one, else British English, else any English; null when there is none. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const name of CLEAR) {
    const v = voices.find((x) => x.name.startsWith(name));
    if (v) return v;
  }
  return voices.find((v) => /^en[-_]GB/i.test(v.lang)) ?? voices.find((v) => /^en\b/i.test(v.lang)) ?? null;
}

/** Says `text`, stopping what was being said; `done` when it ends (at once where the browser cannot speak). */
export function speak(text: string, done: () => void, w: Window = window): boolean {
  const synth = (w as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const Utterance = (w as unknown as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
  if (!synth || !Utterance) {
    done();
    return false;
  }
  synth.cancel();
  const u = new Utterance(text);
  const v = pickVoice(synth.getVoices());
  if (v) u.voice = v;
  u.lang = v?.lang ?? 'en-GB';
  u.rate = 1;
  u.pitch = 1.05;
  let finished = false;
  // Done when the browser says so, or after the time the words take at the least, as Chrome now and then never does.
  const guard = setTimeout(() => end(), 1500 + 90 * text.length);
  const end = () => {
    if (finished) return;
    finished = true;
    clearTimeout(guard);
    done();
  };
  u.onend = end;
  u.onerror = end;
  synth.speak(u);
  return true;
}

/** Stops whatever Luna is saying. */
export function hush(w: Window = window): void {
  (w as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis?.cancel();
}
