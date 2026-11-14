// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lunaStore } from '@/lib/luna/store';
import { lunaPlace } from './LunaButton';
import { botFace, clampSpot, LUNA_SPOT_KEY, LunaDock, parseSpot } from './LunaDock';

// Her 3D self needs WebGL: here she fails at once, as in a browser without it, and her drawn pet stands in.
vi.mock('./LunaBot', () => ({
  default: ({ onFail }: { onFail: (why: string) => void }) => {
    queueMicrotask(() => onFail('no WebGL'));
    return null;
  },
}));

afterEach(() => {
  cleanup();
  act(() => lunaStore.setState({ on: false, status: 'off', heard: null, reply: null, voice: true, prime: () => {} }));
  lunaPlace.setState({ at: 'header' });
  window.localStorage.clear();
});

describe('Luna’s 3D self (spec 23)', () => {
  it('is awake and idle while Luna is off, and makes a face for each thing she does, ^ ^ among them', () => {
    expect(botFace('off')).toBe('idle');
    expect(botFace('listening')).toBe('wide');
    expect(botFace('thinking')).toBe('dots');
    expect(botFace('speaking')).toBe('talk');
    expect(botFace('typing')).toBe('happy');
    expect(botFace('blocked')).toBe('blocked');
    expect(botFace('offline')).toBe('cross');
  });

  it('keeps her whole on screen wherever she is carried, and reads back only a spot that is one', () => {
    expect(clampSpot(-50, -20, 156, 190, 1200, 800)).toEqual({ x: 8, y: 8 });
    expect(clampSpot(5000, 5000, 156, 190, 1200, 800)).toEqual({ x: 1200 - 156 - 8, y: 800 - 190 - 8 });
    expect(clampSpot(300, 200, 156, 190, 1200, 800)).toEqual({ x: 300, y: 200 });
    expect(parseSpot('{"x":12,"y":40}')).toEqual({ x: 12, y: 40 });
    expect(parseSpot('{"x":"a"}')).toBeNull();
    expect(parseSpot('not json')).toBeNull();
    expect(parseSpot(null)).toBeNull();
  });

  it('stands at the lower left, turns Luna on with a press and opens her panel beside her, not under the header', async () => {
    render(<LunaDock />);
    const dock = document.querySelector<HTMLElement>('[data-luna-dock]')!;
    expect(dock.className).toMatch(/\bfixed\b/);
    expect(dock.className).toMatch(/\bleft-3\b/);
    expect(dock.style.bottom).toBe('16px');
    const me = screen.getByRole('button', { name: 'Talk to Luna' });
    expect(me.getAttribute('aria-pressed')).toBe('false');
    fireEvent.pointerDown(me);
    fireEvent.pointerUp(me);
    expect(lunaStore.getState().on).toBe(true);
    expect(lunaPlace.getState().at).toBe('dock');
    expect(within(dock).getByRole('region', { name: 'Luna' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Luna is on/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('readies her voice during the press that turns her on, by pointer or keyboard', () => {
    const prime = vi.fn();
    lunaStore.setState({ prime });
    render(<LunaDock />);
    const me = screen.getByRole('button', { name: 'Talk to Luna' });
    fireEvent.pointerDown(me);
    fireEvent.pointerUp(me);
    expect(prime).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Luna is on/ }), { key: 'Enter' });
    expect(lunaStore.getState().on).toBe(false);
    expect(prime).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Talk to Luna' }), { key: ' ' });
    expect(prime).toHaveBeenCalledTimes(2);
  });

  it('turns Luna on and off from the keyboard too', () => {
    render(<LunaDock />);
    const me = screen.getByRole('button', { name: 'Talk to Luna' });
    fireEvent.keyDown(me, { key: 'Enter' });
    expect(lunaStore.getState().on).toBe(true);
    fireEvent.keyDown(me, { key: ' ' });
    expect(lunaStore.getState().on).toBe(false);
  });

  it('comes back where a visitor left her', () => {
    window.localStorage.setItem(LUNA_SPOT_KEY, JSON.stringify({ x: 420, y: 120 }));
    render(<LunaDock />);
    const dock = document.querySelector<HTMLElement>('[data-luna-dock]')!;
    expect(dock.style.left).toBe('420px');
    expect(dock.style.bottom).toBe('120px');
  });

  it('shows her drawn pet where WebGL is missing, still a button that talks to Luna', async () => {
    render(<LunaDock />);
    await waitFor(() => expect(document.querySelector('[data-luna-dock] svg[data-mood]')).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Talk to Luna' })).toBeTruthy();
  });

  it('gives her panel beside her the same switch for saying replies aloud, kept as it was left on the page before', () => {
    render(<LunaDock />);
    const me = screen.getByRole('button', { name: 'Talk to Luna' });
    fireEvent.pointerDown(me);
    fireEvent.pointerUp(me);
    fireEvent.click(screen.getByRole('switch', { name: 'Say replies aloud' }));
    expect(lunaStore.getState().voice).toBe(false);
    // The next page: a new dock and panel, the choice as it was.
    cleanup();
    render(<LunaDock />);
    const dock = document.querySelector<HTMLElement>('[data-luna-dock]')!;
    expect(within(dock).getByRole('switch', { name: 'Say replies aloud' }).getAttribute('aria-checked')).toBe('false');
  });
});
