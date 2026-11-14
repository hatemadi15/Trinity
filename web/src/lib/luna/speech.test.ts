// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { pickVoice, recognitionCtor, speak } from './speech';

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

describe('the browser’s voice, for Luna', () => {
  it('finds the browser’s speech recognition under either name, or none', () => {
    class Rec {}
    expect(recognitionCtor({ SpeechRecognition: Rec } as unknown as Window)).toBe(Rec);
    expect(recognitionCtor({ webkitSpeechRecognition: Rec } as unknown as Window)).toBe(Rec);
    expect(recognitionCtor({} as unknown as Window)).toBeNull();
  });

  it('chooses a clear English voice: a known good one first, then British English, then any English', () => {
    expect(pickVoice([voice('Alex', 'en-US'), voice('Google UK English Female', 'en-GB')])!.name).toBe('Google UK English Female');
    expect(pickVoice([voice('Thomas', 'fr-FR'), voice('Daniel', 'en-GB'), voice('Fred', 'en-US')])!.name).toBe('Daniel');
    expect(pickVoice([voice('Thomas', 'fr-FR'), voice('Fred', 'en-US')])!.name).toBe('Fred');
    expect(pickVoice([voice('Thomas', 'fr-FR')])).toBeNull();
  });

  it('says a reply in that voice, stopping what it was saying, and tells when it is done', () => {
    const spoken: { text: string; voice?: SpeechSynthesisVoice; onend?: () => void }[] = [];
    class Utterance {
      voice?: SpeechSynthesisVoice;
      lang = '';
      rate = 1;
      pitch = 1;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    }
    const synth = { cancel: vi.fn(), getVoices: () => [voice('Samantha', 'en-US')], speak: (u: Utterance) => spoken.push(u) };
    const done = vi.fn();
    expect(speak('Playing.', done, { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } as unknown as Window)).toBe(true);
    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken[0].text).toBe('Playing.');
    expect(spoken[0].voice!.name).toBe('Samantha');
    expect(done).not.toHaveBeenCalled();
    spoken[0].onend!();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('calls it done after a while even when the browser never says it ended, as Chrome sometimes does not', () => {
    vi.useFakeTimers();
    try {
      class Utterance {
        voice?: SpeechSynthesisVoice;
        lang = '';
        rate = 1;
        pitch = 1;
        onend?: () => void;
        onerror?: () => void;
        constructor(public text: string) {}
      }
      const synth = { cancel: vi.fn(), getVoices: () => [], speak: () => {} };
      const done = vi.fn();
      speak('Turning to Earth.', done, { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } as unknown as Window);
      vi.advanceTimersByTime(1000);
      expect(done).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10_000);
      expect(done).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls it done at once where the browser cannot speak', () => {
    const done = vi.fn();
    expect(speak('Playing.', done, {} as unknown as Window)).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
