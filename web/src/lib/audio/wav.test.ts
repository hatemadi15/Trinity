import { describe, expect, it } from 'vitest';
import { floatToPcm16, pcmRate, pcmToWav, WAV_HEADER_BYTES } from './wav';

const text = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

describe('WAV for Gemini’s speech and Luna’s recordings', () => {
  it('wraps 16-bit PCM in a 44-byte RIFF header that says what it holds, the samples after it unchanged', () => {
    // Four samples, little-endian: 0, 1, -1 and 32767.
    const pcm = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0xff, 0xff, 0xff, 0x7f]);
    const wav = pcmToWav(pcm, 24_000);
    expect(wav.byteLength).toBe(WAV_HEADER_BYTES + 8);
    const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(text(wav, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(text(wav, 8, 4)).toBe('WAVE');
    expect(text(wav, 12, 4)).toBe('fmt ');
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(24_000);
    expect(v.getUint32(28, true)).toBe(48_000); // bytes a second
    expect(v.getUint16(32, true)).toBe(2); // bytes a sample
    expect(v.getUint16(34, true)).toBe(16);
    expect(text(wav, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(8);
    expect([...wav.subarray(44)]).toEqual([...pcm]);
  });

  it('drops a last odd byte, which is not a whole sample', () => {
    const wav = pcmToWav(new Uint8Array([1, 0, 2]), 16_000);
    expect(wav.byteLength).toBe(WAV_HEADER_BYTES + 2);
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(2);
  });

  it('turns samples from -1 to 1 into 16-bit little-endian PCM, clamping what lies outside', () => {
    const pcm = floatToPcm16(new Float32Array([0, 1, -1, 0.5, 2, -3]));
    const v = new DataView(pcm.buffer);
    expect([0, 1, 2, 3, 4, 5].map((i) => v.getInt16(i * 2, true))).toEqual([0, 32767, -32768, 16384, 32767, -32768]);
  });

  it('reads the sample rate from the type Gemini gives its audio, 24 kHz when it gives none', () => {
    expect(pcmRate('audio/L16;codec=pcm;rate=24000')).toBe(24_000);
    expect(pcmRate('audio/L16; rate=16000')).toBe(16_000);
    expect(pcmRate('audio/pcm')).toBe(24_000);
    expect(pcmRate(undefined)).toBe(24_000);
    expect(pcmRate('audio/L16;rate=nonsense')).toBe(24_000);
  });
});
