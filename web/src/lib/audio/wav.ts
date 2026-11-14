/**
 * WAV, for Luna's voice both ways: Gemini's speech comes back as raw 16-bit little-endian PCM (24 kHz mono), which a
 * browser plays once it has a RIFF header; and a browser's recording, decoded, goes to Gemini as 16 kHz mono WAV, a
 * format Gemini documents for audio. The same code on the server and in the browser.
 */

/** The size of the header this module writes: RIFF, its fmt chunk and the data chunk's head. */
export const WAV_HEADER_BYTES = 44;

/** The sample rate Gemini's speech uses when its type names none. */
const GEMINI_SPEECH_RATE = 24_000;

/** `pcm` (16-bit little-endian samples) with a WAV header in front; a last odd byte, not a whole sample, is dropped. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array<ArrayBuffer> {
  const bytes = pcm.byteLength - (pcm.byteLength % 2);
  const out = new Uint8Array(new ArrayBuffer(WAV_HEADER_BYTES + bytes));
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  const blockAlign = channels * 2;
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // the fmt chunk's size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, bytes, true);
  out.set(pcm.subarray(0, bytes), WAV_HEADER_BYTES);
  return out;
}

/** Samples from -1 to 1 as 16-bit little-endian PCM, anything outside clamped. */
export function floatToPcm16(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(samples.length * 2));
  const v = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(i * 2, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
  }
  return out;
}

/** The sample rate in an audio type such as Gemini's "audio/L16;codec=pcm;rate=24000"; 24 kHz when it names none. */
export function pcmRate(mimeType: string | undefined): number {
  const rate = Number(/(?:^|;)\s*rate=(\d+)/i.exec(mimeType ?? '')?.[1]);
  return Number.isInteger(rate) && rate > 0 ? rate : GEMINI_SPEECH_RATE;
}

/**
 * How long a WAV lasts, from its header: the data chunk's size over the fmt chunk's bytes a second, other chunks
 * stepped over; a data chunk that claims more than the file holds counts what is there. Null for what is not a WAV.
 */
export function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 12) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const id = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (id(0) !== 'RIFF' || id(8) !== 'WAVE') return null;
  let byteRate = 0;
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const size = v.getUint32(at + 4, true);
    if (id(at) === 'fmt ' && at + 20 <= bytes.byteLength) byteRate = v.getUint32(at + 16, true);
    if (id(at) === 'data') return byteRate > 0 ? Math.min(size, bytes.byteLength - at - 8) / byteRate : null;
    at += 8 + size + (size % 2);
  }
  return null;
}
