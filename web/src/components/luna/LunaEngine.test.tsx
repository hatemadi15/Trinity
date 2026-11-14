// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { registerControls } from '@/lib/luna/controls';
import type { Recognition } from '@/lib/luna/speech';
import { lunaStore } from '@/lib/luna/store';
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

function mount(o: { recognition?: () => (new () => Recognition) | null; speak?: (t: string, d: () => void) => boolean; navigate?: (h: string) => void } = {}) {
  const store = createExploreStore(fileLoaders());
  const navigate = o.navigate ?? vi.fn();
  const v = voice();
  render(createElement(LunaEngine, { store, recognition: o.recognition ?? (() => FakeRec), speak: o.speak ?? v.speak, navigate, ask: vi.fn() }));
  return { store, navigate, ...v };
}

const reset = () => lunaStore.setState({ on: false, status: 'off', heard: null, reply: null, messages: [], draft: '', canDictate: false });
const thread = () => lunaStore.getState().messages.map((m) => [m.from, m.text]);
beforeEach(() => {
  FakeRec.made = [];
  reset();
});
afterEach(() => {
  cleanup();
  reset();
});

describe('Luna’s engine (spec 23.2: a chat, the microphone on request)', () => {
  it('opens ready to chat, without listening: the microphone starts only on request, an English recognition that stops after a phrase', () => {
    mount();
    act(() => lunaStore.getState().setOn(true));
    const rec = FakeRec.made[0];
    expect([rec.lang, rec.continuous, rec.interimResults]).toEqual(['en-US', false, true]);
    expect(rec.starts).toBe(0);
    expect(lunaStore.getState().status).toBe('ready');
    expect(lunaStore.getState().canDictate).toBe(true);
  });

  it('writes what the microphone hears into the message box as it comes, and sends nothing by itself', () => {
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().dictate());
    const rec = FakeRec.made[0];
    expect(rec.starts).toBe(1);
    expect(lunaStore.getState().status).toBe('listening');
    rec.say('compare de', false);
    expect(lunaStore.getState().draft).toBe('compare de');
    rec.say('compare de Gerlache Rim 2 and Nobile Rim 2');
    expect(lunaStore.getState().draft).toBe('compare de Gerlache Rim 2 and Nobile Rim 2');
    act(() => rec.onend?.());
    expect(lunaStore.getState().status).toBe('ready');
    expect(lunaStore.getState().messages).toHaveLength(0);
    expect(said).toHaveLength(0);
  });

  it('answers a typed message in the conversation, quietly', async () => {
    const play = vi.fn();
    const off = registerControls({ play });
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().submit('Luna, play'));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(thread()).toEqual([['you', 'Luna, play'], ['luna', 'Playing.']]));
    expect(said).toHaveLength(0);
    expect(lunaStore.getState().status).toBe('ready');
    expect(lunaStore.getState().heard).toBe('Luna, play');
    expect(lunaStore.getState().reply).toBe('Playing.');
    off();
  });

  it('says the reply to a dictated message aloud too, with the microphone off meanwhile', async () => {
    const play = vi.fn();
    const off = registerControls({ play });
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().submit('play', true));
    await waitFor(() => expect(said).toHaveLength(1));
    expect(said[0].text).toBe('Playing.');
    expect(lunaStore.getState().status).toBe('speaking');
    act(() => said[0].done());
    expect(lunaStore.getState().status).toBe('ready');
    off();
  });

  it('says so in the conversation when a message asks for nothing she can do', async () => {
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().submit('um'));
    await waitFor(() => expect(thread()).toHaveLength(2));
    expect(thread()[1][0]).toBe('luna');
    expect(thread()[1][1]).toMatch(/^I did not catch a request there/);
    expect(lunaStore.getState().reply).toBeNull();
    expect(said).toHaveLength(0);
  });

  it('says goodbye, then turns herself off, on "stop listening"', async () => {
    const { said } = mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().submit('stop listening'));
    await waitFor(() => expect(said).toHaveLength(1));
    expect(said[0].text).toMatch(/^Luna is off/);
    expect(lunaStore.getState().on).toBe(true);
    act(() => said[0].done());
    expect(lunaStore.getState().on).toBe(false);
    expect(lunaStore.getState().status).toBe('off');
  });

  it('takes typed words where the browser has no voice input, and says when the microphone is blocked', async () => {
    const navigate = vi.fn();
    mount({ recognition: () => null, navigate });
    act(() => lunaStore.getState().setOn(true));
    expect(lunaStore.getState().status).toBe('typing');
    expect(lunaStore.getState().canDictate).toBe(false);
    act(() => lunaStore.getState().submit('go home'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    cleanup();
    reset();
    mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().dictate());
    act(() => FakeRec.made.at(-1)!.onerror?.({ error: 'not-allowed' }));
    expect(lunaStore.getState().status).toBe('blocked');
  });

  it('stops the microphone and her voice when she is turned off', () => {
    mount();
    act(() => lunaStore.getState().setOn(true));
    act(() => lunaStore.getState().dictate());
    const rec = FakeRec.made[0];
    act(() => lunaStore.getState().setOn(false));
    expect(rec.aborts).toBeGreaterThanOrEqual(1);
    expect(lunaStore.getState().status).toBe('off');
    expect(lunaStore.getState().draft).toBe('');
  });
});
