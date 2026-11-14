import { geminiFromEnv, geminiSpeech, geminiUnavailable } from '@/lib/ai/gemini';
import { clientIp, SlidingWindowLimiter } from '@/lib/ai/rate-limit';
import { pcmRate, pcmToWav } from '@/lib/audio/wav';
import { SPEECH_MAX_CHARS } from '@/lib/luna/limits';
import { RecentCache } from '@/lib/recent';

export const dynamic = 'force-dynamic';
/** Vercel function cap (seconds); Gemini gets at most AI_MODEL_TIMEOUT_MS of it. */
export const maxDuration = 30;

const DEFAULT_TIMEOUT_MS = 10_000;
/** Recent phrases kept, per server instance: Luna says "Playing." and "Next moment." often. */
const KEPT_PHRASES = 64;
/** At most this many bytes of them (a sentence is about 100 KB of WAV). */
const KEPT_BYTES = 12_000_000;

const limiter = new SlidingWindowLimiter(Number(process.env.AI_RATE_LIMIT_PER_MIN) || 30, 60_000);
const recent = new RecentCache<{ body: Uint8Array<ArrayBuffer>; type: string }>(KEPT_PHRASES, (v) => v.body.byteLength, KEPT_BYTES);
const timeoutMs = () => Number(process.env.AI_MODEL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

/** Why speech cannot be had here, quickly, so her browser falls back to its own voice for the rest of the visit. */
function unavailable(reason: 'offline' | 'no-key'): Response {
  return Response.json({ available: false, error: 'Gemini’s voice is not available here', reason }, { status: 503 });
}

/** Audio a browser plays: Gemini's raw PCM in a WAV header, or audio already in a container, as it came. */
function playable(audio: Uint8Array, mimeType: string): { body: Uint8Array<ArrayBuffer>; type: string } {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  if (type === 'audio/l16' || type === 'audio/pcm' || type === '') return { body: pcmToWav(audio, pcmRate(mimeType)), type: 'audio/wav' };
  const body = new Uint8Array(new ArrayBuffer(audio.byteLength));
  body.set(audio);
  return { body, type };
}

const audioResponse = (a: { body: Uint8Array<ArrayBuffer>; type: string }, cache: 'hit' | 'miss') =>
  new Response(a.body, { headers: { 'Content-Type': a.type, 'Cache-Control': 'no-store', 'X-Speech-Cache': cache } });

/** GET: whether Gemini's voice is available here, with the model and the voice (for the check after a deployment). */
export async function GET(): Promise<Response> {
  const why = geminiUnavailable();
  if (why) return unavailable(why);
  const g = geminiFromEnv()!;
  return Response.json({ available: true, model: g.speechModel, voice: g.voice });
}

/**
 * POST { text } → audio/wav: Luna's reply said by Gemini's speech model (GEMINI_TTS_MODEL) in one voice
 * (GEMINI_VOICE), its raw 16-bit 24 kHz mono PCM wrapped in a WAV header. Recent phrases are kept in memory and
 * answered again without Gemini. 503 at once without a key or in the offline build (cached mode), never calling
 * Gemini; 429 past AI_RATE_LIMIT_PER_MIN from one address; 400 without text; 413 past SPEECH_MAX_CHARS; 502 when
 * Gemini gives no speech within AI_MODEL_TIMEOUT_MS. The browser falls back to its own voice on any of them.
 */
export async function POST(request: Request): Promise<Response> {
  const why = geminiUnavailable();
  if (why) return unavailable(why);
  const gate = limiter.hit(clientIp(request));
  if (!gate.ok) {
    return Response.json({ error: `Too many requests from this address; try again in ${gate.retryAfterS} s`, retryAfterS: gate.retryAfterS }, { status: 429, headers: { 'Retry-After': String(gate.retryAfterS) } });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const given = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { text?: unknown }).text : undefined;
  const text = typeof given === 'string' ? given.trim() : '';
  if (!text) return Response.json({ error: 'text is required' }, { status: 400 });
  if (text.length > SPEECH_MAX_CHARS) return Response.json({ error: `text is longer than ${SPEECH_MAX_CHARS} characters` }, { status: 413 });
  const g = geminiFromEnv()!;
  const key = `${g.speechModel}\n${g.voice}\n${text}`;
  const kept = recent.get(key);
  if (kept) return audioResponse(kept, 'hit');
  const r = await geminiSpeech({ model: g.speechModel, apiKey: g.apiKey, voice: g.voice, text, signal: AbortSignal.timeout(timeoutMs()) });
  if ('error' in r) {
    console.info(`speech failed: ${r.error}`);
    return Response.json({ error: 'Gemini gave no speech', ...(r.status ? { upstream: r.status } : {}) }, { status: 502 });
  }
  const audio = playable(r.audio, r.mimeType);
  recent.set(key, audio);
  return audioResponse(audio, 'miss');
}
