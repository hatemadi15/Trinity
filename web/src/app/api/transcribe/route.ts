import { geminiFromEnv, geminiTranscribe, geminiUnavailable } from '@/lib/ai/gemini';
import { clientIp, SlidingWindowLimiter } from '@/lib/ai/rate-limit';
import catalogue from '@/lib/data/catalogue.json';
import type { Site } from '@/lib/data/loaders';
import { wavSeconds } from '@/lib/audio/wav';
import { AUDIO_MAX_BYTES, RECORDING_MAX_MS } from '@/lib/luna/limits';

export const dynamic = 'force-dynamic';
/** Vercel function cap (seconds); Gemini gets at most AI_MODEL_TIMEOUT_MS of it. */
export const maxDuration = 30;

const DEFAULT_TIMEOUT_MS = 10_000;
/** The longest WAV taken, in seconds: a recording's cap and a second's grace. */
const MAX_SECONDS = RECORDING_MAX_MS / 1000 + 1;
const limiter = new SlidingWindowLimiter(Number(process.env.AI_RATE_LIMIT_PER_MIN) || 30, 60_000);
const timeoutMs = () => Number(process.env.AI_MODEL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
/** The catalogue's names, which Gemini is told it may hear. */
const NAMES: readonly string[] = [...new Set((catalogue.sites as Site[]).map((s) => s.label ?? s.name))];

/**
 * The recordings browsers make, by the type they give them, and the type Gemini is sent: Luna's browser sends 16 kHz
 * WAV where it can decode its own recording (Gemini documents WAV), else the recording as it is: Firefox's Ogg Opus,
 * Safari's MP4 (AAC), Chromium's WebM Opus.
 */
const AUDIO_TYPES: Record<string, string> = {
  'audio/wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/ogg': 'audio/ogg',
  'audio/opus': 'audio/ogg',
  'audio/webm': 'audio/webm',
  'audio/mp4': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/aac': 'audio/aac',
  'audio/mpeg': 'audio/mp3',
  'audio/mp3': 'audio/mp3',
  'audio/flac': 'audio/flac',
};

function unavailable(reason: 'offline' | 'no-key'): Response {
  return Response.json({ available: false, error: 'Transcription by Gemini is not available here', reason }, { status: 503 });
}

const tooBig = () => Response.json({ error: `the recording is larger than ${AUDIO_MAX_BYTES} bytes` }, { status: 413 });

/** The body's bytes, read no further than the cap: 'too-big' past it, whatever Content-Length said. */
async function readCapped(request: Request, max: number): Promise<Uint8Array | 'too-big'> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return 'too-big';
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** GET: whether transcription is available here, with the model, so Luna's browser knows whether to offer the microphone. */
export async function GET(): Promise<Response> {
  const why = geminiUnavailable();
  if (why) return unavailable(why);
  return Response.json({ available: true, model: geminiFromEnv()!.transcribeModel });
}

/**
 * POST, the body a recording (Content-Type audio/wav, audio/ogg, audio/mp4, audio/webm and the like) → { text }: the
 * words Gemini (GEMINI_TRANSCRIBE_MODEL) hears in it, "" when nobody spoke. For Luna in browsers without speech
 * recognition (Firefox, some Safari), which record a phrase at a press (at most 15 s). 503 at once without a key or in
 * the offline build (cached mode), never reading the audio or calling Gemini; 429 past AI_RATE_LIMIT_PER_MIN from one
 * address, before reading it; 415 for a type that is not audio; 413 past AUDIO_MAX_BYTES, by its Content-Length or as
 * it is read, or for a WAV whose header says it lasts more than 16 s; 400 for an empty body; 502 when Gemini gives no transcript within AI_MODEL_TIMEOUT_MS.
 */
export async function POST(request: Request): Promise<Response> {
  const why = geminiUnavailable();
  if (why) return unavailable(why);
  const gate = limiter.hit(clientIp(request));
  if (!gate.ok) {
    return Response.json({ error: `Too many requests from this address; try again in ${gate.retryAfterS} s`, retryAfterS: gate.retryAfterS }, { status: 429, headers: { 'Retry-After': String(gate.retryAfterS) } });
  }
  const mimeType = AUDIO_TYPES[(request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()];
  if (!mimeType) return Response.json({ error: 'the body must be a recording (audio/wav, audio/ogg, audio/mp4, audio/webm)' }, { status: 415 });
  if (Number(request.headers.get('content-length')) > AUDIO_MAX_BYTES) return tooBig();
  const audio = await readCapped(request, AUDIO_MAX_BYTES);
  if (audio === 'too-big') return tooBig();
  if (audio.byteLength === 0) return Response.json({ error: 'the recording is empty' }, { status: 400 });
  // A recording lasts 15 s at most; a WAV says how long it lasts, so a longer one is refused before Gemini hears it.
  if (mimeType === 'audio/wav' && (wavSeconds(audio) ?? 0) > MAX_SECONDS) return Response.json({ error: `the recording is longer than ${RECORDING_MAX_MS / 1000} s` }, { status: 413 });
  const g = geminiFromEnv()!;
  const r = await geminiTranscribe({ model: g.transcribeModel, apiKey: g.apiKey, audio, mimeType, names: NAMES, signal: AbortSignal.timeout(timeoutMs()) });
  if ('error' in r) {
    console.info(`transcription failed: ${r.error}`);
    return Response.json({ error: 'Gemini gave no transcript', ...(r.status ? { upstream: r.status } : {}) }, { status: 502 });
  }
  return Response.json({ text: r.text }, { headers: { 'Cache-Control': 'no-store' } });
}
