import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPEECH_MAX_CHARS } from './limits';
import { createVisit } from './visit';
import { createVoice, VOICE_WAIT_MS, type AudioLike } from './voice';

/** An audio element that plays when told and ends when the test says so. */
class FakeAudio implements AudioLike {
  src = '';
  duration = NaN;
  played: string[] = [];
  pauses = 0;
  refuse = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play() {
    this.played.push(this.src);
    return this.refuse ? Promise.reject(new Error('NotAllowedError: play() can only be started by a gesture')) : Promise.resolve();
  }
  pause() {
    this.pauses++;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  load() {}
  end() {
    this.onended?.();
  }
}

const wav = () => new Response(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]), { status: 200, headers: { 'content-type': 'audio/wav' } });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(answers: (() => Response | Promise<Response>)[] = [wav]) {
  const audio = new FakeAudio();
  let i = 0;
  const signals: AbortSignal[] = [];
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    return answers[Math.min(i++, answers.length - 1)]();
  });
  const browserSpeak = vi.fn<(text: string, done: () => void) => boolean>(() => true);
  const browserHush = vi.fn();
  let n = 0;
  const revoked: string[] = [];
  const visit = createVisit();
  const voice = createVoice({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    audio: () => audio,
    browserSpeak,
    browserHush,
    objectUrl: () => `blob:luna/${++n}`,
    revokeUrl: (u) => revoked.push(u),
    visit,
  });
  return { audio, fetchImpl, signals, browserSpeak, browserHush, revoked, visit, voice };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Luna’s voice: Gemini’s where it can, the browser’s where it cannot', () => {
  it('plays Gemini’s audio for a reply, and calls it done when the audio ends', async () => {
    const { audio, fetchImpl, browserSpeak, revoked, voice } = setup();
    const done = vi.fn();
    expect(voice.speak('Playing.', done, { gemini: true })).toBe(true);
    await vi.waitFor(() => expect(audio.played).toEqual(['blob:luna/1']));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/speak');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Playing.' });
    expect(browserSpeak).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    audio.end();
    expect(done).toHaveBeenCalledTimes(1);
    expect(revoked).toEqual(['blob:luna/1']);
  });

  it('says the reply in the browser’s voice when Gemini’s fails: an error, no network, or a play the browser refuses', async () => {
    for (const answers of [[() => new Response('{"error":"Gemini gave no speech"}', { status: 502 })], [() => Promise.reject(new TypeError('Failed to fetch'))]]) {
      const { browserSpeak, audio, voice } = setup(answers);
      const done = vi.fn();
      voice.speak('Turning to Earth.', done, { gemini: true });
      await vi.waitFor(() => expect(browserSpeak).toHaveBeenCalledTimes(1));
      expect(browserSpeak.mock.calls[0][0]).toBe('Turning to Earth.');
      // Her engine's done goes to the browser's voice, which calls it when it has finished.
      browserSpeak.mock.calls[0][1]();
      expect(done).toHaveBeenCalledTimes(1);
      expect(audio.played).toEqual([]);
    }
    const refused = setup();
    refused.audio.refuse = true;
    refused.voice.speak('Paused.', vi.fn(), { gemini: true });
    await vi.waitFor(() => expect(refused.browserSpeak).toHaveBeenCalledTimes(1));
    expect(refused.audio.played).toHaveLength(1);
  });

  it('gives Gemini about 4 s, then says the reply in the browser’s voice and drops the request', async () => {
    vi.useFakeTimers();
    const { browserSpeak, signals, audio, voice } = setup([() => new Promise<Response>(() => {})]);
    voice.speak('Opening the forecast.', vi.fn(), { gemini: true });
    await vi.advanceTimersByTimeAsync(VOICE_WAIT_MS - 100);
    expect(browserSpeak).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(browserSpeak).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(true);
    expect(audio.played).toEqual([]);
    expect(VOICE_WAIT_MS).toBe(4000);
  });

  it('remembers for the visit that Gemini’s voice is not available here, and asks no more', async () => {
    const { fetchImpl, browserSpeak, visit, voice } = setup([() => new Response('{"error":"unavailable","reason":"no-key"}', { status: 503 })]);
    voice.speak('Playing.', vi.fn(), { gemini: true });
    await vi.waitFor(() => expect(browserSpeak).toHaveBeenCalledTimes(1));
    expect(visit.unavailable()).toBe(true);
    voice.speak('Paused.', vi.fn(), { gemini: true });
    expect(browserSpeak).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops asking for the visit after two failures in a row, and a success in between starts the count again', async () => {
    const fail = () => new Response('busy', { status: 502 });
    const { fetchImpl, browserSpeak, audio, voice } = setup([fail, wav, fail, fail, wav]);
    for (const text of ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.']) {
      const calls = browserSpeak.mock.calls.length + audio.played.length;
      voice.speak(text, vi.fn(), { gemini: true });
      await vi.waitFor(() => expect(browserSpeak.mock.calls.length + audio.played.length).toBe(calls + 1));
      audio.end();
    }
    // One fails, two plays, three and four fail: five and six go straight to the browser's voice.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(audio.played).toHaveLength(1);
    expect(browserSpeak.mock.calls.map((c) => c[0])).toEqual(['One.', 'Three.', 'Four.', 'Five.', 'Six.']);
  });

  it('stops at once when hushed, while the audio loads or plays, and calls nothing done', async () => {
    let answer: (r: Response) => void = () => {};
    const loading = setup([() => new Promise<Response>((r) => (answer = r))]);
    const done = vi.fn();
    loading.voice.speak('Playing.', done, { gemini: true });
    loading.voice.hush();
    expect(loading.signals[0].aborted).toBe(true);
    expect(loading.browserHush).toHaveBeenCalledTimes(1);
    answer(wav());
    await flush();
    expect(loading.audio.played).toEqual([]);
    expect(loading.browserSpeak).not.toHaveBeenCalled();

    const playing = setup();
    playing.voice.speak('Playing.', done, { gemini: true });
    await vi.waitFor(() => expect(playing.audio.played).toHaveLength(1));
    playing.voice.hush();
    expect(playing.audio.pauses).toBeGreaterThanOrEqual(1);
    expect(playing.audio.src).toBe('');
    playing.audio.end();
    expect(done).not.toHaveBeenCalled();
    expect(playing.browserSpeak).not.toHaveBeenCalled();
  });

  it('stops the older reply at once when a newer one comes', async () => {
    const { audio, voice } = setup();
    const first = vi.fn();
    const second = vi.fn();
    voice.speak('Playing.', first, { gemini: true });
    await vi.waitFor(() => expect(audio.played).toHaveLength(1));
    const pauses = audio.pauses;
    voice.speak('Paused.', second, { gemini: true });
    expect(audio.pauses).toBeGreaterThan(pauses);
    await vi.waitFor(() => expect(audio.played).toHaveLength(2));
    audio.end();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops the browser’s voice when a newer reply comes after the older fell back to it', async () => {
    const { audio, voice, browserSpeak, browserHush } = setup([() => new Response('busy', { status: 502 }), wav]);
    voice.speak('Playing.', vi.fn(), { gemini: true });
    await vi.waitFor(() => expect(browserSpeak).toHaveBeenCalledTimes(1));
    expect(browserHush).not.toHaveBeenCalled();
    voice.speak('Paused.', vi.fn(), { gemini: true });
    expect(browserHush).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(audio.played).toHaveLength(1));
  });

  it('keeps recent phrases, so a reply said again plays without a request', async () => {
    const { audio, fetchImpl, voice } = setup();
    voice.speak('Next moment.', vi.fn(), { gemini: true });
    await vi.waitFor(() => expect(audio.played).toHaveLength(1));
    audio.end();
    voice.speak('Next moment.', vi.fn(), { gemini: true });
    await vi.waitFor(() => expect(audio.played).toHaveLength(2));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('says a reply too long for Gemini’s voice, and every reply in cached mode, in the browser’s voice without a request', () => {
    const { fetchImpl, browserSpeak, voice } = setup();
    voice.speak('x'.repeat(SPEECH_MAX_CHARS + 1), vi.fn(), { gemini: true });
    voice.speak('Playing.', vi.fn(), { gemini: false });
    voice.speak('Playing.', vi.fn());
    expect(browserSpeak).toHaveBeenCalledTimes(3);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('calls it done after the audio’s length and a little more, even if the browser never says it ended', async () => {
    vi.useFakeTimers();
    const { audio, voice } = setup();
    audio.duration = 2;
    const done = vi.fn();
    voice.speak('Turning to the Sun.', done, { gemini: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.played).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('readies the element with a moment of silence, once, so a browser that wants a press first lets her speak later', async () => {
    const { audio, voice } = setup();
    voice.prime();
    voice.prime();
    expect(audio.played).toHaveLength(1);
    expect(audio.played[0]).toMatch(/^data:audio\/wav;base64,/);
    const refused = setup();
    refused.audio.refuse = true;
    expect(() => refused.voice.prime()).not.toThrow();
    await flush();
  });
});
