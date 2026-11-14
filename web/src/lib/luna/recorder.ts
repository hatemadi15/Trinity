import { floatToPcm16, pcmToWav } from '../audio/wav';
import { AUDIO_MAX_BYTES, RECORDING_MAX_MS } from './limits';

/**
 * Luna's ears where the browser has no speech recognition (Firefox, some Safari; spec 22.5): her microphone records a
 * phrase with MediaRecorder, from a press to the next (at most 15 s), and /api/transcribe has Gemini write it down.
 * The browser decodes its own recording into 16 kHz mono WAV first, which Gemini documents; where it cannot, the
 * recording goes as it is, in its own type (Firefox's Ogg Opus, Safari's MP4, Chromium's WebM). Chrome and Edge keep
 * their own continuous listening (speech.ts).
 */

export const TRANSCRIBE_URL = '/api/transcribe';
/** How long she waits for the words: the upload, then Gemini's AI_MODEL_TIMEOUT_MS on the server. */
const TRANSCRIBE_WAIT_MS = 20_000;
/** The types to record in, best first: Firefox's own, then Safari's, then Chromium's. */
export const RECORDING_TYPES = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
/** Speech needs little: a small upload. */
const BITS_PER_SECOND = 64_000;
/** The rate the recording is decoded to: what Gemini takes speech at. */
const WAV_RATE = 16_000;

/** The parts of MediaRecorder she uses. */
interface RecorderLike {
  state: string;
  mimeType: string;
  start(): void;
  stop(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
}
type RecorderCtor = { new (stream: MediaStream, options?: { mimeType?: string; audioBitsPerSecond?: number }): RecorderLike; isTypeSupported?: (type: string) => boolean };

/** MediaRecorder and a microphone to ask for, or null where the browser has either missing. */
export function recorderSupport(w: Window = window): { Recorder: RecorderCtor; getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream> } | null {
  const Recorder = (w as unknown as { MediaRecorder?: RecorderCtor }).MediaRecorder;
  const devices = (w.navigator as Navigator | undefined)?.mediaDevices;
  if (typeof Recorder !== 'function' || typeof devices?.getUserMedia !== 'function') return null;
  return { Recorder, getUserMedia: (c) => devices.getUserMedia(c) };
}

/** A phrase being recorded. */
export interface Recording {
  /** Stops and hands over what was recorded, through `done`. */
  stop(): void;
  /** Stops and throws it away. */
  cancel(): void;
  /** What was recorded, once it stops: by `stop`, by itself after the cap, or null when cancelled or broken. */
  done: Promise<Blob | null>;
}

/**
 * Asks for the microphone and starts recording in the first type the browser offers; it stops by itself after
 * `maxMs`. The microphone is let go as soon as it stops. Fails when the microphone is not allowed or not there.
 */
export async function startRecording({ maxMs = RECORDING_MAX_MS, w = window }: { maxMs?: number; w?: Window } = {}): Promise<Recording> {
  const support = recorderSupport(w);
  if (!support) throw new Error('This browser cannot record');
  const stream = await support.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const mimeType = RECORDING_TYPES.find((t) => support.Recorder.isTypeSupported?.(t));
  let rec: RecorderLike;
  try {
    rec = new support.Recorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: BITS_PER_SECOND });
  } catch (err) {
    release();
    throw err;
  }
  const chunks: Blob[] = [];
  let keep = true;
  const done = new Promise<Blob | null>((resolve) => {
    rec.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      clearTimeout(cap);
      release();
      resolve(keep && chunks.length ? new Blob(chunks, { type: rec.mimeType || chunks[0].type || mimeType || 'audio/webm' }) : null);
    };
    rec.onerror = () => {
      keep = false;
      clearTimeout(cap);
      release();
      resolve(null);
    };
  });
  const stop = () => {
    if (rec.state !== 'inactive') rec.stop();
  };
  rec.start();
  // It stops by itself at the cap; the handlers above clear it once it has stopped.
  const cap = setTimeout(stop, maxMs);
  return {
    stop,
    cancel: () => {
      keep = false;
      stop();
      release();
    },
    done,
  };
}

/** The browser's audio decoder, the part toWav uses. */
type OfflineCtor = new (channels: number, length: number, rate: number) => {
  decodeAudioData(data: ArrayBuffer): Promise<{ numberOfChannels: number; length: number; getChannelData(c: number): Float32Array }>;
};

/**
 * The recording as 16 kHz mono 16-bit WAV, decoded by the browser itself (its OfflineAudioContext resamples to its own
 * rate as it decodes; the channels are averaged); null where it cannot decode it.
 */
export async function toWav(blob: Blob, w: Window = window): Promise<Blob | null> {
  const Offline = (w as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor }).OfflineAudioContext ?? (w as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext;
  if (!Offline) return null;
  try {
    const decoded = await new Offline(1, 1, WAV_RATE).decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / decoded.numberOfChannels;
    }
    return new Blob([pcmToWav(floatToPcm16(mono), WAV_RATE)], { type: 'audio/wav' });
  } catch {
    return null;
  }
}

/** The words in a recording, or why there are none: not available here, too many requests, too long, or a failure. */
export type TranscribeResult = { text: string } | { error: 'unavailable' | 'busy' | 'too-long' | 'failed' };

/** Posts the recording (as WAV where the browser can make it) to /api/transcribe; never throws. */
export async function transcribe(blob: Blob, { fetchImpl = fetch, wav = toWav }: { fetchImpl?: typeof fetch; wav?: (b: Blob) => Promise<Blob | null> } = {}): Promise<TranscribeResult> {
  try {
    const body = (await wav(blob).catch(() => null)) ?? blob;
    if (body.size > AUDIO_MAX_BYTES) return { error: 'too-long' };
    const res = await fetchImpl(TRANSCRIBE_URL, { method: 'POST', headers: { 'Content-Type': body.type || 'application/octet-stream' }, body, signal: AbortSignal.timeout(TRANSCRIBE_WAIT_MS) });
    if (res.status === 503) return { error: 'unavailable' };
    if (res.status === 429) return { error: 'busy' };
    if (res.status === 413) return { error: 'too-long' };
    if (!res.ok) return { error: 'failed' };
    const json = (await res.json().catch(() => null)) as { text?: unknown } | null;
    return typeof json?.text === 'string' ? { text: json.text } : { error: 'failed' };
  } catch {
    return { error: 'failed' };
  }
}

/** Whether the server can transcribe: true, false (no key there, or the offline build), or null when it could not tell. */
export async function transcriptionAvailable(fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const res = await fetchImpl(TRANSCRIBE_URL, { method: 'GET', signal: AbortSignal.timeout(TRANSCRIBE_WAIT_MS) });
    if (res.ok) return true;
    return res.status === 503 ? false : null;
  } catch {
    return null;
  }
}

/** What her engine uses to listen by recording; the browser's own by default, a stand-in in tests. */
export interface LunaRecorder {
  supported(): boolean;
  start(maxMs: number): Promise<Recording>;
  transcribe(blob: Blob): Promise<TranscribeResult>;
  available(): Promise<boolean | null>;
}

export const browserRecorder: LunaRecorder = {
  supported: () => typeof window !== 'undefined' && recorderSupport() !== null,
  start: (maxMs) => startRecording({ maxMs }),
  transcribe: (blob) => transcribe(blob),
  available: () => transcriptionAvailable(),
};
