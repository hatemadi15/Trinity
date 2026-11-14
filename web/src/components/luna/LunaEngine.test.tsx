// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { registerControls } from '@/lib/luna/controls';
import { MUTE_REPLY, UNMUTE_REPLY } from '@/lib/luna/run';
import type { Recognition } from '@/lib/luna/speech';
import { LUNA_VOICE_KEY, lunaStore } from '@/lib/luna/store';
import { LunaEngine } from './LunaEngine';

/** A speech recognition that hears what the test says. */
class FakeRec implements Recognition {
  static made: FakeRec[] = [];
  lang = '';
  continuous = false;
  interimResults = true;
  maxAlternatives = 0;
  starts = 0;
  aborts = 0;
  onresult: Recognition['onresult'] = null;
  onerror: Recognition['onerror'] = null;
  onend: Recognition['onend'] = null;
  constructor() {
    FakeRec.made.push(this);
  }
  start() {
    this.starts++;
  }
  stop() {}
  abort() {
    this.aborts++;
  }
  say(text: string, isFinal = true) {
    const result = Object.assign([{ transcript: text }], { isFinal });
    act(() => this.onresult?.({ resultIndex: 0, results: [result] }));
  }
}

/** A voice that finishes when the test says so. */
function voice() {
  const said: { text: string; done: () => void }[] = [];
  const speak = vi.fn((text: string, done: () => void) => {
    said.push({ text, done });
    return true;
  });
  return { said, speak };
}

function mount(o: { recognition?: () => (new () => Recognition) | null; speak?: (t: string, d: () => void) => boolean; hush?: () => void; navigate?: (h: string) => void } = {}) {
  const store = createExploreStore(fileLoaders());
  const navigate = o.navigate ?? vi.fn();
  const v = voice();
  const hush = o.hush ?? vi.fn();
  render(createElement(LunaEngine, { store, recognition: o.recognition ?? (() => FakeRec), speak: o.speak ?? v.speak, hush, navigate, ask: vi.fn() }));
  return { store, navigate, hush, ...v };
}

const reset = () => lunaStore.setState({ on: false, status: 'off', heard: null, reply: null, messages: [], canListen: false, voice: true });
const thread = () => lunaStore.getState().messages.map((m) => [m.from, m.text]);
beforeEach(() => {
  FakeRec.made = [];
  reset();
});
afterEach(() => {
  cleanup();
  reset();
  window.localStorage.clear();
});

describe('Luna’s engine (spec 22, her conversation since spec 23.2)', () => {
  it('listens only once she is turned on: a continuous English recognition, started', () => {
    mount();
    expect(FakeRec.made).toHaveLength(0);
    act(() => lunaStore.getState().setOn(true));
    const rec = FakeRec.made[0];
    expect([rec.lang, rec.continuous, rec.interimResults]).toEqual(['en-US', true, false]);
    expect(rec.starts).toBe(1);
    expect(lunaStore.getState().status).toBe('listening');
    expect(lunaStore.getState().canListen).toBe(true);
  });

  it('acts on what she hears, says her reply without listening meanwhile, then listens again; both lines go into the conversation', async () => {
    const play = vi.fn();
    const off = registerControls({ play });
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    const rec = FakeRec.made[0];
    rec.say('Luna, play');
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(lunaStore.getState().status).toBe('speaking'));
    expect(lunaStore.getState().heard).toBe('Luna, play');
    expect(lunaStore.getState().reply).toBe('Playing.');
    expect(thread()).toEqual([
      ['you', 'Luna, play'],
      ['luna', 'Playing.'],
    ]);
    expect(said[0].text).toBe('Playing.');
    // While she speaks the recognition is stopped, so she never hears herself.
    expect(rec.aborts).toBeGreaterThanOrEqual(1);
    act(() => said[0].done());
    expect(lunaStore.getState().status).toBe('listening');
    expect(rec.starts).toBe(2);
    off();
  });

  it('starts listening again when the browser ends its recognition, as Chrome does after a silence', async () => {
    vi.useFakeTimers();
    try {
      mount();
      act(() => lunaStore.getState().setOn(true));
      const rec = FakeRec.made[0];
      act(() => rec.onend?.());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(rec.starts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a stray word heard in the room go without a reply, and without a line in the conversation', async () => {
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    FakeRec.made[0].say('um');
    await waitFor(() => expect(lunaStore.getState().status).toBe('listening'));
    expect(lunaStore.getState().heard).toBe('um');
    expect(lunaStore.getState().reply).toBeNull();
    expect(thread()).toEqual([]);
    expect(said).toHaveLength(0);
  });

  it('answers typed words that ask for nothing she can do, in the conversation', async () => {
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().submit('um'));
    await waitFor(() => expect(thread()).toHaveLength(2));
    expect(thread()[0]).toEqual(['you', 'um']);
    expect(thread()[1][0]).toBe('luna');
    expect(thread()[1][1]).toMatch(/^I did not catch a request there/);
    expect(lunaStore.getState().reply).toBeNull();
    expect(said).toHaveLength(0);
    expect(lunaStore.getState().status).toBe('listening');
  });

  it('says goodbye, then turns herself off, on "stop listening"', async () => {
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    FakeRec.made[0].say('stop listening');
    await waitFor(() => expect(said).toHaveLength(1));
    expect(said[0].text).toMatch(/^Luna is off/);
    expect(lunaStore.getState().on).toBe(true);
    act(() => said[0].done());
    expect(lunaStore.getState().on).toBe(false);
    expect(lunaStore.getState().status).toBe('off');
  });

  it('pauses the microphone at a press in her panel and listens again at the next, typed words still answered meanwhile', async () => {
    const play = vi.fn();
    const off = registerControls({ play });
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    const rec = FakeRec.made[0];
    act(() => lunaStore.getState().toggleMic());
    expect(lunaStore.getState().status).toBe('ready');
    expect(rec.aborts).toBeGreaterThanOrEqual(1);
    // The browser's silence does not start it again while it is paused, nor does her reply.
    act(() => rec.onend?.());
    act(() => lunaStore.getState().submit('play'));
    await waitFor(() => expect(said).toHaveLength(1));
    act(() => said[0].done());
    expect(lunaStore.getState().status).toBe('ready');
    expect(rec.starts).toBe(1);
    act(() => lunaStore.getState().toggleMic());
    expect(lunaStore.getState().status).toBe('listening');
    expect(rec.starts).toBe(2);
    off();
  });

  it('takes typed words where the browser has no voice input, and when the microphone is blocked', async () => {
    const navigate = vi.fn();
    mount({ recognition: () => null, navigate });
    act(() => lunaStore.getState().setOn(true));
    expect(lunaStore.getState().status).toBe('typing');
    expect(lunaStore.getState().canListen).toBe(false);
    act(() => lunaStore.getState().submit('go home'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    cleanup();
    reset();
    mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => FakeRec.made.at(-1)!.onerror?.({ error: 'not-allowed' }));
    expect(lunaStore.getState().status).toBe('blocked');
    // A press on the microphone tries again.
    act(() => lunaStore.getState().toggleMic());
    expect(lunaStore.getState().status).toBe('listening');
  });

  it('stops listening and speaking when she is turned off, and keeps the conversation for her next turn on', async () => {
    const play = vi.fn();
    const off = registerControls({ play });
    mount();
    act(() => lunaStore.getState().setOn(true));
    const rec = FakeRec.made[0];
    rec.say('play');
    await waitFor(() => expect(thread()).toHaveLength(2));
    act(() => lunaStore.getState().setOn(false));
    expect(rec.aborts).toBeGreaterThanOrEqual(1);
    expect(lunaStore.getState().status).toBe('off');
    expect(thread()).toHaveLength(2);
    off();
  });
});

describe('Luna’s engine, with her replies said aloud or not (the switch in her panel)', () => {
  it('says nothing aloud while the switch is off, heard or typed, yet shows every reply and listens on as before', async () => {
    const play = vi.fn();
    const off = registerControls({ play });
    const { said } = mount();
    const statuses: string[] = [];
    const unsubscribe = lunaStore.subscribe((s) => statuses.push(s.status));
    act(() => lunaStore.getState().setVoice(false));
    act(() => lunaStore.getState().setOn(true));
    const rec = FakeRec.made[0];
    rec.say('play');
    await waitFor(() => expect(thread()).toHaveLength(2));
    await waitFor(() => expect(lunaStore.getState().status).toBe('listening'));
    act(() => lunaStore.getState().submit('play'));
    await waitFor(() => expect(thread()).toHaveLength(4));
    await waitFor(() => expect(lunaStore.getState().status).toBe('listening'));
    expect(play).toHaveBeenCalledTimes(2);
    expect(thread()).toEqual([
      ['you', 'play'],
      ['luna', 'Playing.'],
      ['you', 'play'],
      ['luna', 'Playing.'],
    ]);
    expect(lunaStore.getState().reply).toBe('Playing.');
    expect(said).toHaveLength(0);
    expect(statuses).not.toContain('speaking');
    // The listening never stopped for a reply, and the microphone still pauses it and starts it again.
    expect([rec.aborts, rec.starts]).toEqual([0, 1]);
    act(() => lunaStore.getState().toggleMic());
    expect(lunaStore.getState().status).toBe('ready');
    expect(rec.aborts).toBe(1);
    act(() => lunaStore.getState().toggleMic());
    expect(lunaStore.getState().status).toBe('listening');
    expect(rec.starts).toBe(2);
    // Goodbye goes into the conversation, and she turns off at once.
    rec.say('stop listening');
    await waitFor(() => expect(lunaStore.getState().on).toBe(false));
    expect(thread().at(-1)![1]).toMatch(/^Luna is off/);
    expect(said).toHaveLength(0);
    unsubscribe();
    off();
  });

  it('stops at once when the switch goes off while she speaks, and listens again; her voice’s own end then changes nothing', async () => {
    const play = vi.fn();
    const off = registerControls({ play });
    const { said, hush } = mount();
    act(() => lunaStore.getState().setOn(true));
    const rec = FakeRec.made[0];
    rec.say('play');
    await waitFor(() => expect(lunaStore.getState().status).toBe('speaking'));
    expect(said).toHaveLength(1);
    expect(rec.starts).toBe(1);
    expect(hush).not.toHaveBeenCalled();
    act(() => lunaStore.getState().setVoice(false));
    expect(hush).toHaveBeenCalledTimes(1);
    expect(lunaStore.getState().status).toBe('listening');
    expect(rec.starts).toBe(2);
    act(() => said[0].done());
    expect(lunaStore.getState().status).toBe('listening');
    expect(rec.starts).toBe(2);
    // The reply stays in the conversation.
    expect(thread()).toEqual([
      ['you', 'play'],
      ['luna', 'Playing.'],
    ]);
    // Turned on again, she says the next reply aloud.
    act(() => lunaStore.getState().setVoice(true));
    rec.say('play');
    await waitFor(() => expect(said).toHaveLength(2));
    expect(lunaStore.getState().status).toBe('speaking');
    off();
  });

  it('turns herself off at once when the switch goes off during her goodbye', async () => {
    const { said, hush } = mount();
    act(() => lunaStore.getState().setOn(true));
    FakeRec.made[0].say('stop listening');
    await waitFor(() => expect(said).toHaveLength(1));
    expect(lunaStore.getState().on).toBe(true);
    act(() => lunaStore.getState().setVoice(false));
    expect(hush).toHaveBeenCalled();
    expect(lunaStore.getState().on).toBe(false);
    expect(lunaStore.getState().status).toBe('off');
  });

  it('leaves the browser’s own voice unused while the switch is off, and cancels it when the switch goes off mid-reply', async () => {
    const play = vi.fn();
    const off = registerControls({ play });
    class Utterance {
      voice?: SpeechSynthesisVoice;
      lang = '';
      rate = 1;
      pitch = 1;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    }
    const synth = { cancel: vi.fn(), getVoices: () => [], speak: vi.fn() };
    const w = window as unknown as Record<string, unknown>;
    w.speechSynthesis = synth;
    w.SpeechSynthesisUtterance = Utterance;
    try {
      // Her engine as the app mounts it, with the browser's voice (here a stand-in for it), not a test's.
      render(createElement(LunaEngine, { store: createExploreStore(fileLoaders()), recognition: () => FakeRec, navigate: vi.fn(), ask: vi.fn() }));
      act(() => lunaStore.getState().setVoice(false));
      act(() => lunaStore.getState().setOn(true));
      act(() => lunaStore.getState().submit('play'));
      await waitFor(() => expect(thread()).toHaveLength(2));
      expect(synth.speak).not.toHaveBeenCalled();
      act(() => lunaStore.getState().setVoice(true));
      act(() => lunaStore.getState().submit('play'));
      await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
      expect((synth.speak.mock.calls[0][0] as Utterance).text).toBe('Playing.');
      expect(lunaStore.getState().status).toBe('speaking');
      synth.cancel.mockClear();
      act(() => lunaStore.getState().setVoice(false));
      expect(synth.cancel).toHaveBeenCalledTimes(1);
      expect(lunaStore.getState().status).toBe('listening');
    } finally {
      delete w.speechSynthesis;
      delete w.SpeechSynthesisUtterance;
      off();
    }
  });

  it('is muted by voice and confirms it in the chat only, then speaks again when asked', async () => {
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    const rec = FakeRec.made[0];
    rec.say('Luna, be quiet');
    await waitFor(() => expect(thread()).toHaveLength(2));
    await waitFor(() => expect(lunaStore.getState().status).toBe('listening'));
    expect(lunaStore.getState().voice).toBe(false);
    expect(thread()[1]).toEqual(['luna', MUTE_REPLY]);
    expect(said).toHaveLength(0);
    expect(rec.aborts).toBe(0);
    rec.say('speak again');
    await waitFor(() => expect(said).toHaveLength(1));
    expect(lunaStore.getState().voice).toBe(true);
    expect(said[0].text).toBe(UNMUTE_REPLY);
    expect(thread()[3]).toEqual(['luna', UNMUTE_REPLY]);
    // Kept for the next visit, as the switch keeps it.
    expect(window.localStorage.getItem(LUNA_VOICE_KEY)).toBe('on');
  });
});

describe('Luna’s questions for the assistant', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('are marked as hers, so the server asks Gemini first', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ source: 'model', model: 'gemini-2.5-flash', actions: [], reply: 'The app forecasts sunlight and radio contact, not weather.' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const v = voice();
    // Her engine with the app's own assistant, not a test's.
    render(createElement(LunaEngine, { store: createExploreStore(fileLoaders()), recognition: () => FakeRec, speak: v.speak, hush: vi.fn(), navigate: vi.fn() }));
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().submit('what is the weather like on the moon today'));
    await waitFor(() => expect(thread()).toHaveLength(2));
    expect(thread()[1]).toEqual(['luna', 'The app forecasts sunlight and radio contact, not weather.']);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const chat = calls.find(([url]) => url === '/api/chat');
    expect(JSON.parse(String(chat![1].body))).toMatchObject({ prompt: 'what is the weather like on the moon today', from: 'luna' });
  });
});
