// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LUNA_VOICE_KEY, lunaStore, storedVoice } from './store';

/** What a browser that blocks storage throws: a private window, or site data turned off. */
const blocked = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  lunaStore.setState({ voice: true });
});

describe('whether Luna says her replies aloud (her panel’s switch)', () => {
  it('is on at first, as spec 22 has her', () => {
    expect(storedVoice()).toBe(true);
    expect(lunaStore.getState().voice).toBe(true);
  });

  it('keeps the choice in her store, which lasts from page to page, and in this browser', () => {
    lunaStore.getState().setVoice(false);
    expect(lunaStore.getState().voice).toBe(false);
    expect(window.localStorage.getItem(LUNA_VOICE_KEY)).toBe('off');
    expect(storedVoice()).toBe(false);
    lunaStore.getState().setVoice(true);
    expect(lunaStore.getState().voice).toBe(true);
    expect(window.localStorage.getItem(LUNA_VOICE_KEY)).toBe('on');
    expect(storedVoice()).toBe(true);
  });

  it('comes back as it was left on the next visit', async () => {
    window.localStorage.setItem(LUNA_VOICE_KEY, 'off');
    vi.resetModules();
    const visit = await import('./store');
    expect(visit.lunaStore.getState().voice).toBe(false);
    window.localStorage.setItem(LUNA_VOICE_KEY, 'on');
    vi.resetModules();
    expect((await import('./store')).lunaStore.getState().voice).toBe(true);
  });

  it('reads anything but "off" as on, so a stray value never silences her', () => {
    for (const v of ['on', '', 'false', '0', 'OFF ']) {
      window.localStorage.setItem(LUNA_VOICE_KEY, v);
      expect(storedVoice(), JSON.stringify(v)).toBe(true);
    }
  });

  it('works where the browser refuses to read or write storage: on at first, and the switch still holds for the visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    expect(storedVoice()).toBe(true);
    expect(() => lunaStore.getState().setVoice(false)).not.toThrow();
    expect(lunaStore.getState().voice).toBe(false);
    expect(() => lunaStore.getState().setVoice(true)).not.toThrow();
    expect(lunaStore.getState().voice).toBe(true);
  });

  it('works where the browser refuses the storage itself', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(blocked);
    expect(storedVoice()).toBe(true);
    expect(() => lunaStore.getState().setVoice(false)).not.toThrow();
    expect(lunaStore.getState().voice).toBe(false);
    // A visit that starts with storage refused starts with her voice on.
    vi.resetModules();
    expect((await import('./store')).lunaStore.getState().voice).toBe(true);
  });
});
