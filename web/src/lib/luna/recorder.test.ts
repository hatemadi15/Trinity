import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_MAX_BYTES, RECORDING_MAX_MS } from './limits';
import { recorderSupport, startRecording, toWav, transcribe, transcriptionAvailable } from './recorder';

/** A MediaRecorder that hands over one small clip of its type when stopped. */
class FakeRecorder {
  static made: FakeRecorder[] = [];
  static isTypeSupported = (t: string) => t.startsWith('audio/ogg');
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public stream: unknown,
    public options?: { mimeType?: string; audioBitsPerSecond?: number },
  ) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    FakeRecorder.made.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array([79, 103, 103, 83])], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function browser(o: { types?: (t: string) => boolean; deny?: Error } = {}) {
  FakeRecorder.made = [];
  const track = { stop: vi.fn() };
  const getUserMedia = vi.fn<(c: MediaStreamConstraints) => Promise<{ getTracks: () => { stop: () => void }[] }>>(async () => {
    if (o.deny) throw o.deny;
    return { getTracks: () => [track] };
  });
  const Rec = class extends FakeRecorder {};
  Rec.isTypeSupported = o.types ?? FakeRecorder.isTypeSupported;
  const w = { MediaRecorder: Rec, navigator: { mediaDevices: { getUserMedia } } } as unknown as Window;
  return { w, track, getUserMedia };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Luna’s recorder, for browsers without speech recognition', () => {
  it('finds a recorder and a microphone to ask for, or says there is none', () => {
    expect(recorderSupport({ navigator: {} } as unknown as Window)).toBeNull();
    expect(recorderSupport({ MediaRecorder: FakeRecorder, navigator: {} } as unknown as Window)).toBeNull();
    expect(recorderSupport(browser().w)).not.toBeNull();
  });

  it('records from the microphone in the first type the browser offers (Firefox’s Ogg Opus), and hands it over when stopped, the microphone let go', async () => {
    const { w, track, getUserMedia } = browser();
    const take = await startRecording({ w });
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ audio: { channelCount: 1 } });
    const rec = FakeRecorder.made[0];
    expect(rec.options).toEqual({ mimeType: 'audio/ogg;codecs=opus', audioBitsPerSecond: 64_000 });
    expect(rec.state).toBe('recording');
    take.stop();
    const blob = await take.done;
    expect(blob?.type).toBe('audio/ogg;codecs=opus');
    expect(blob?.size).toBe(4);
    expect(track.stop).toHaveBeenCalled();
  });

  it('records Safari’s MP4 where Ogg is not offered, and the browser’s own choice where neither is', async () => {
    const safari = browser({ types: (t) => t === 'audio/mp4' });
    await startRecording({ w: safari.w });
    expect(FakeRecorder.made[0].options?.mimeType).toBe('audio/mp4');
    const other = browser({ types: () => false });
    await startRecording({ w: other.w });
    expect(FakeRecorder.made[0].options).toEqual({ audioBitsPerSecond: 64_000 });
  });

  it('stops by itself after 15 s and hands over what it has', async () => {
    vi.useFakeTimers();
    const { w, track } = browser();
    const take = await startRecording({ w });
    let blob: Blob | null | undefined;
    void take.done.then((b) => (blob = b));
    await vi.advanceTimersByTimeAsync(RECORDING_MAX_MS - 1);
    expect(blob).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(blob?.size).toBe(4);
    expect(track.stop).toHaveBeenCalled();
    expect(RECORDING_MAX_MS).toBe(15_000);
  });

  it('throws the recording away when cancelled, the microphone let go', async () => {
    const { w, track } = browser();
    const take = await startRecording({ w });
    take.cancel();
    expect(await take.done).toBeNull();
    expect(track.stop).toHaveBeenCalled();
  });

  it('fails when the microphone is not allowed, recording nothing', async () => {
    const { w } = browser({ deny: Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }) });
    await expect(startRecording({ w })).rejects.toThrow(/Permission denied/);
    expect(FakeRecorder.made).toHaveLength(0);
  });
});

describe('the recording as WAV, decoded by the browser itself', () => {
  it('mixes it to one channel at 16 kHz and writes 16-bit WAV', async () => {
    const rates: number[] = [];
    class FakeOffline {
      constructor(_channels: number, _length: number, rate: number) {
        rates.push(rate);
      }
      decodeAudioData() {
        const ch = [Float32Array.from([0, 1, -1, 0.5]), Float32Array.from([0, 1, 1, 0.5])];
        return Promise.resolve({ numberOfChannels: 2, length: 4, sampleRate: 16_000, getChannelData: (c: number) => ch[c] });
      }
    }
    const wav = await toWav(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }), { OfflineAudioContext: FakeOffline } as unknown as Window);
    expect(rates).toEqual([16_000]);
    expect(wav?.type).toBe('audio/wav');
    const v = new DataView(await wav!.arrayBuffer());
    expect([v.getUint32(24, true), v.getUint16(22, true), v.getUint32(40, true)]).toEqual([16_000, 1, 8]);
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, 0, 16384]);
  });

  it('gives nothing where the browser cannot decode it, so the recording goes as it is', async () => {
    expect(await toWav(new Blob([new Uint8Array([1])]), {} as unknown as Window)).toBeNull();
    class Broken {
      decodeAudioData() {
        return Promise.reject(new Error('EncodingError'));
      }
    }
    expect(await toWav(new Blob([new Uint8Array([1])]), { OfflineAudioContext: Broken } as unknown as Window)).toBeNull();
  });
});

describe('transcription, from the browser', () => {
  const clip = new Blob([new Uint8Array([79, 103, 103, 83])], { type: 'audio/ogg;codecs=opus' });
  const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

  it('posts the WAV where the browser made one, else the recording with its own type, and returns the words', async () => {
    const fetchImpl = answer({ text: 'go home' });
    const wav = new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'audio/wav' });
    expect(await transcribe(clip, { fetchImpl, wav: async () => wav })).toEqual({ text: 'go home' });
    let [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method, (init.headers as Record<string, string>)['Content-Type'], init.body]).toEqual(['/api/transcribe', 'POST', 'audio/wav', wav]);
    await transcribe(clip, { fetchImpl, wav: async () => null });
    [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect([(init.headers as Record<string, string>)['Content-Type'], init.body]).toEqual(['audio/ogg;codecs=opus', clip]);
  });

  it('says why there are no words: not available here, too many requests, too long, or a failure', async () => {
    const none = async () => null;
    expect(await transcribe(clip, { fetchImpl: answer({ reason: 'no-key' }, 503), wav: none })).toEqual({ error: 'unavailable' });
    expect(await transcribe(clip, { fetchImpl: answer({}, 429), wav: none })).toEqual({ error: 'busy' });
    expect(await transcribe(clip, { fetchImpl: answer({}, 413), wav: none })).toEqual({ error: 'too-long' });
    expect(await transcribe(clip, { fetchImpl: answer({}, 502), wav: none })).toEqual({ error: 'failed' });
    expect(await transcribe(clip, { fetchImpl: answer({ words: 'x' }), wav: none })).toEqual({ error: 'failed' });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await transcribe(clip, { fetchImpl: down, wav: none })).toEqual({ error: 'failed' });
    const big = new Blob([new Uint8Array(AUDIO_MAX_BYTES + 1)], { type: 'audio/wav' });
    const never = vi.fn();
    expect(await transcribe(big, { fetchImpl: never, wav: none })).toEqual({ error: 'too-long' });
    expect(never).not.toHaveBeenCalled();
  });

  it('asks once whether the server can transcribe at all', async () => {
    expect(await transcriptionAvailable(answer({ available: true }))).toBe(true);
    expect(await transcriptionAvailable(answer({ available: false, reason: 'no-key' }, 503))).toBe(false);
    const get = answer({ available: true });
    await transcriptionAvailable(get);
    expect((get.mock.calls as unknown as [string, RequestInit][])[0]).toEqual(['/api/transcribe', expect.objectContaining({ method: 'GET' })]);
    expect(
      await transcriptionAvailable(
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        }),
      ),
    ).toBeNull();
  });
});
