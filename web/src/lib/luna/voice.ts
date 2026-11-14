import { pcmToWav } from '../audio/wav';
import { RecentCache } from '../recent';
import { SPEECH_MAX_CHARS } from './limits';
import { hush as speechHush, speak as speechSpeak } from './speech';
import { geminiVisit, type GeminiVisit } from './visit';

/**
 * Luna's voice (spec 22.5): her replies in Gemini's voice, fetched from /api/speak as WAV and played, wherever the app
 * may use Gemini; the browser's own voice (speech.ts) on any failure, a missing key, or a wait over about 4 s, and
 * always in cached mode (the offline build, ?demo=1). A newer reply or a hush stops her at once, as the switch in her
 * panel did before. Recent phrases are kept as audio in the page, so one said again plays at once.
 */

export const SPEAK_URL = '/api/speak';
/** How long she waits for Gemini's voice to start before she says the reply in the browser's own. */
export const VOICE_WAIT_MS = 4000;
/** Failures in a row (an error, no network, a wait over VOICE_WAIT_MS) after which she stops asking for the visit. */
const GIVE_UP_AFTER = 2;
/** Replies kept as audio. */
const KEPT_PHRASES = 16;
/** How long past the audio's length it counts as ended, as a browser may never say so. */
const END_SLACK_MS = 1500;

/** The parts of an audio element she uses. */
export interface AudioLike {
  src: string;
  readonly duration: number;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: string): void;
  load(): void;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}

export interface LunaVoice {
  /**
   * Says `text`, stopping whatever she was saying; `done` once, when it has been said (never when it was stopped).
   * With `gemini` (the app may use Gemini: not cached mode) in Gemini's voice where it can be had.
   */
  speak(text: string, done: () => void, opts?: { gemini?: boolean }): boolean;
  /** Stops whatever she is saying, at once. */
  hush(): void;
  /**
   * Plays a moment of silence on her audio element, once, during a press: Safari then lets that element play her
   * replies later, when no press is going on. Harmless where nothing needs it.
   */
  prime(): void;
}

export interface VoiceDeps {
  fetchImpl?: typeof fetch;
  /** Makes the element that plays her audio; null where there is none. */
  audio?: () => AudioLike | null;
  /** The browser's own voice. */
  browserSpeak?: (text: string, done: () => void) => boolean;
  browserHush?: () => void;
  objectUrl?: (b: Blob) => string;
  revokeUrl?: (url: string) => void;
  visit?: GeminiVisit;
  waitMs?: number;
}

/** 50 ms of silence as a WAV data address, for prime. */
function silence(): string {
  const wav = pcmToWav(new Uint8Array(800), 8000);
  let s = '';
  for (const b of wav) s += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(s)}`;
}

export function createVoice(deps: VoiceDeps = {}): LunaVoice {
  // Each read when used, so a test's stand-in for the page's fetch counts.
  const fetchImpl: typeof fetch = (...a) => (deps.fetchImpl ?? fetch)(...a);
  const makeAudio = deps.audio ?? (() => (typeof Audio === 'undefined' ? null : (new Audio() as unknown as AudioLike)));
  const browserSpeak = deps.browserSpeak ?? ((text: string, done: () => void) => speechSpeak(text, done));
  const browserHush = deps.browserHush ?? (() => speechHush());
  const objectUrl = deps.objectUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeUrl = deps.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u));
  const visit = deps.visit ?? geminiVisit;
  const waitMs = deps.waitMs ?? VOICE_WAIT_MS;
  const kept = new RecentCache<Blob>(KEPT_PHRASES);
  // One element for every reply, so the one Safari let play keeps playing.
  let element: AudioLike | null | undefined;
  const audio = () => (element === undefined ? (element = makeAudio()) : element);
  let failures = 0;
  let primed = false;
  // Whether the browser's voice may still be saying an earlier reply.
  let browserTalking = false;
  // Stops the reply in Gemini's voice that is loading or playing.
  let stopCurrent: (() => void) | null = null;

  const stop = () => {
    const s = stopCurrent;
    stopCurrent = null;
    s?.();
  };

  const inBrowserVoice = (text: string, done: () => void) => {
    browserTalking = true;
    return browserSpeak(text, () => {
      browserTalking = false;
      done();
    });
  };

  function speak(text: string, done: () => void, opts: { gemini?: boolean } = {}): boolean {
    stop();
    const said = text.trim();
    const el = opts.gemini && !visit.unavailable() && failures < GIVE_UP_AFTER && said && said.length <= SPEECH_MAX_CHARS ? audio() : null;
    if (!el) return inBrowserVoice(text, done);
    if (browserTalking) {
      browserTalking = false;
      browserHush();
    }
    let over = false;
    let playing = false;
    let url: string | null = null;
    let guard: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const release = () => {
      clearTimeout(wait);
      clearTimeout(guard);
      controller.abort();
      el.onended = null;
      el.onerror = null;
      if (url) {
        el.pause();
        el.removeAttribute('src');
        try {
          el.load();
        } catch {
          // Nothing to reset.
        }
        revokeUrl(url);
        url = null;
      }
      if (stopCurrent === cancel) stopCurrent = null;
    };
    const cancel = () => {
      if (over) return;
      over = true;
      release();
    };
    const finish = () => {
      if (over) return;
      over = true;
      release();
      done();
    };
    // The reply is said all the same, in the browser's voice; a failure counts unless Gemini is simply not here.
    const fallBack = (counts: boolean) => {
      if (over) return;
      over = true;
      release();
      if (counts) failures++;
      inBrowserVoice(text, done);
    };
    const wait = setTimeout(() => fallBack(true), waitMs);
    stopCurrent = cancel;
    void (async () => {
      try {
        let blob = kept.get(said);
        if (!blob) {
          const res = await fetchImpl(SPEAK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: said }), signal: controller.signal });
          if (over) return;
          if (res.status === 503) {
            visit.markUnavailable();
            return fallBack(false);
          }
          if (!res.ok) return fallBack(true);
          blob = await res.blob();
          if (over) return;
          if (!blob.size) return fallBack(true);
          kept.set(said, blob);
        }
        url = objectUrl(blob);
        el.src = url;
        el.onended = finish;
        el.onerror = () => (playing ? finish() : fallBack(true));
        await el.play();
        if (over) return;
        playing = true;
        failures = 0;
        clearTimeout(wait);
        const ms = Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 90 * said.length;
        guard = setTimeout(finish, ms + END_SLACK_MS);
      } catch {
        fallBack(true);
      }
    })();
    return true;
  }

  function hush(): void {
    stop();
    browserTalking = false;
    browserHush();
  }

  function prime(): void {
    if (primed) return;
    const el = audio();
    if (!el) return;
    primed = true;
    try {
      const quiet = silence();
      el.src = quiet;
      void Promise.resolve(el.play()).then(
        () => {
          if (el.src === quiet) el.pause();
        },
        () => {},
      );
    } catch {
      // A browser that cannot play here still has its own voice.
    }
  }

  return { speak, hush, prime };
}

/** The app's own. */
export const lunaVoice = createVoice();
