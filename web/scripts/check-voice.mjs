#!/usr/bin/env node
/**
 * The live check of Luna's Gemini help on a deployed site (spec 22.5), with no key on this computer: it calls the
 * site's own routes, which hold the key on the server.
 *
 *   node scripts/check-voice.mjs https://<the deployment>
 *
 * 1. GET /api/speak and /api/transcribe: is Gemini available there, with which models and voice.
 * 2. POST /api/speak: a reply in Gemini's voice, as WAV, saved to luna-check.wav to listen to; how long it took
 *    (Luna waits about 4 s before she uses the browser's voice instead).
 * 3. POST /api/transcribe with that WAV: Gemini should write the same words back.
 * 4. POST /api/chat as Luna (Gemini first) and as "Ask in plain words" (OpenRouter first): who answered.
 *
 * A deployment behind Vercel's protection needs its bypass secret in VERCEL_AUTOMATION_BYPASS_SECRET. Exits 1 when
 * a step fails. Six requests in all, well inside the routes' limit of AI_RATE_LIMIT_PER_MIN.
 */
import { writeFileSync } from 'node:fs';

const base = (process.argv[2] ?? process.env.CHECK_BASE_URL ?? '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/check-voice.mjs https://<the deployment>');
  process.exit(2);
}
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const headers = (more = {}) => ({ ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}), ...more });
const PHRASE = 'Opening the forecast for de Gerlache Rim 2.';
let failed = 0;

/** What a failed answer from one of the voice routes most likely means. */
function hint(status, body, kind) {
  if (status === 503) return `not available there (${body?.reason ?? '?'}: ${body?.reason === 'offline' ? 'NEXT_PUBLIC_AI_MODE=cached was built in' : 'set GEMINI_API_KEY in Vercel and redeploy'})`;
  if (status === 502 && body?.upstream === 404) return `Gemini does not know the model: GEMINI_${kind}_MODEL needs a current name`;
  if (status === 502 && (body?.upstream === 401 || body?.upstream === 403)) return 'Gemini refused the key: check GEMINI_API_KEY';
  if (status === 502 && body?.upstream === 429) return 'Gemini’s quota is spent for now';
  if (status === 401 || status === 403) return 'the deployment is protected: set VERCEL_AUTOMATION_BYPASS_SECRET';
  return JSON.stringify(body);
}

const say = (ok, step, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `: ${detail}` : ''}`);
};

async function timed(path, init = {}) {
  const t0 = Date.now();
  const res = await fetch(`${base}${path}`, { ...init, headers: headers(init.headers), signal: AbortSignal.timeout(40_000) });
  return { res, ms: Date.now() - t0 };
}

async function json(res) {
  return res.json().catch(() => null);
}

/** The WAV's sample rate, channels and length in seconds, from its header; null when it is not one. */
function wavInfo(bytes) {
  if (bytes.length < 44 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE') return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rate = v.getUint32(24, true);
  const channels = v.getUint16(22, true);
  return { rate, channels, seconds: v.getUint32(40, true) / (rate * channels * 2) };
}

async function main() {
  console.log(`Checking Luna's Gemini help on ${base}\n`);

  for (const route of ['/api/speak', '/api/transcribe']) {
    const { res } = await timed(route);
    const body = await json(res);
    if (res.ok && body?.available) say(true, `GET ${route}`, `available, model ${body.model}${body.voice ? `, voice ${body.voice}` : ''}`);
    else say(false, `GET ${route}`, `HTTP ${res.status}, ${hint(res.status, body)}`);
  }

  let wav = null;
  {
    const { res, ms } = await timed('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: PHRASE }) });
    if (res.ok) {
      wav = new Uint8Array(await res.arrayBuffer());
      const info = wavInfo(wav);
      writeFileSync('luna-check.wav', wav);
      say(Boolean(info), 'POST /api/speak', info ? `${res.headers.get('content-type')}, ${info.rate} Hz, ${info.channels} channel, ${info.seconds.toFixed(1)} s of speech in ${ms} ms (${ms <= 4000 ? 'inside' : 'over'} Luna's 4 s wait); saved to luna-check.wav` : `not a WAV (${res.headers.get('content-type')})`);
      const again = await timed('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: PHRASE }) });
      await again.res.arrayBuffer().catch(() => {});
      console.log(`      again: HTTP ${again.res.status} in ${again.ms} ms, from the cache: ${again.res.headers.get('x-speech-cache') === 'hit' ? 'yes' : 'no (another server instance answered)'}`);
    } else {
      say(false, 'POST /api/speak', `HTTP ${res.status} in ${ms} ms, ${hint(res.status, await json(res), 'TTS')}`);
    }
  }

  if (wav) {
    const { res, ms } = await timed('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
    const body = await json(res);
    const text = typeof body?.text === 'string' ? body.text : '';
    say(res.ok && /forecast/i.test(text), 'POST /api/transcribe', res.ok ? `"${text}" in ${ms} ms` : `HTTP ${res.status}, ${hint(res.status, body, 'TRANSCRIBE')}`);
  } else {
    say(false, 'POST /api/transcribe', 'skipped: no speech to send');
  }

  for (const [who, extra] of [
    ['Luna', { from: 'luna' }],
    ['Ask in plain words', {}],
  ]) {
    const { res, ms } = await timed('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Which landing site near the south pole would you look at first, and why?', state: null, mode: 'live', ...extra }),
    });
    const body = await json(res);
    const by = body?.source === 'model' ? body.model : `${body?.source ?? 'nothing'}${body?.reason ? ` (${body.reason})` : ''}`;
    const wanted = who === 'Luna' ? /gemini/i.test(String(body?.model)) : body?.source === 'model';
    say(res.ok && wanted, `POST /api/chat as ${who}`, `answered by ${by} in ${ms} ms${who === 'Luna' ? ' (Gemini first)' : ' (OpenRouter first, Gemini last)'}`);
  }

  console.log(failed ? `\n${failed} step(s) failed.` : '\nEvery step passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`The check stopped: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
