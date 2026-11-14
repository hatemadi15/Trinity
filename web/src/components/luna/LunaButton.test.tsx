// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lunaStore } from '@/lib/luna/store';
import { LunaButton } from './LunaButton';

const reset = () => lunaStore.setState({ on: false, status: 'off', heard: null, reply: null, messages: [], canListen: false, pressToTalk: false, voice: true, submit: () => {}, toggleMic: () => {}, prime: () => {} });
beforeEach(reset);
afterEach(() => {
  cleanup();
  reset();
  window.localStorage.clear();
});

describe('Luna’s button', () => {
  it('is a toggle named Luna, off at first, with no panel', () => {
    render(createElement(LunaButton));
    const b = screen.getByRole('button', { name: /^Luna/ });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Luna' })).toBeNull();
  });

  it('readies her voice during the press that turns her on, and not the one that turns her off', () => {
    const prime = vi.fn();
    lunaStore.setState({ prime });
    render(createElement(LunaButton));
    fireEvent.click(screen.getByRole('button', { name: /^Luna/ }));
    expect(prime).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /^Luna/ }));
    expect(prime).toHaveBeenCalledTimes(1);
  });

  it('turns Luna on and off, her panel shown while she is on', () => {
    render(createElement(LunaButton));
    fireEvent.click(screen.getByRole('button', { name: /^Luna/ }));
    expect(lunaStore.getState().on).toBe(true);
    expect(screen.getByRole('button', { name: /^Luna/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('region', { name: 'Luna' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Luna/ }));
    expect(lunaStore.getState().on).toBe(false);
    expect(screen.queryByRole('region', { name: 'Luna' })).toBeNull();
  });

  it('is a chat: what she is doing at the top, then the conversation in speech bubbles, her newest reply read out as it comes (spec 23.2)', () => {
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'listening' }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    expect(within(panel).getByText(/^Listening/)).toBeTruthy();
    act(() =>
      lunaStore.setState({
        status: 'ready',
        messages: [
          { id: 901, from: 'you', text: 'turn to Earth' },
          { id: 902, from: 'luna', text: 'Turning to Earth.' },
        ],
      }),
    );
    const thread = within(panel).getByRole('list', { name: 'Conversation with Luna' });
    const lines = [...thread.querySelectorAll('li[data-from]')].map((li) => [li.getAttribute('data-from'), li.textContent]);
    expect(lines.slice(1)).toEqual([
      ['you', 'turn to Earth'],
      ['luna', 'Turning to Earth.'],
    ]);
    // Her greeting comes first; her newest reply is a live region.
    expect(lines[0][1]).toMatch(/^Hi, I’m Luna \^ \^/);
    expect(within(panel).getByText('Turning to Earth.').closest('[aria-live="polite"]')).not.toBeNull();
    // Three dots while she works.
    act(() => lunaStore.setState({ status: 'thinking' }));
    expect(within(panel).getByLabelText('Luna is working on it')).toBeTruthy();
  });

  it('takes typed words at any time, and says how to talk when the browser cannot listen', () => {
    const submit = vi.fn();
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'typing', submit, canListen: false }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    expect(within(panel).getByText(/no voice input/)).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Speak to Luna' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Type to Luna' }), { target: { value: 'open compare' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(submit).toHaveBeenCalledWith('open compare');
    expect((within(panel).getByRole('textbox', { name: 'Type to Luna' }) as HTMLInputElement).value).toBe('');
    act(() => lunaStore.setState({ status: 'blocked' }));
    expect(within(panel).getByText(/microphone is not allowed/)).toBeTruthy();
  });

  it('keeps the microphone listening while she is on, and pauses it and starts it again at a press (spec 22)', () => {
    const toggleMic = vi.fn();
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'listening', toggleMic, canListen: true }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    const mic = within(panel).getByRole('button', { name: 'Pause the microphone' });
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(within(panel).getByText(/she acts when you pause/)).toBeTruthy();
    fireEvent.click(mic);
    expect(toggleMic).toHaveBeenCalledTimes(1);
    act(() => lunaStore.setState({ status: 'ready' }));
    expect(within(panel).getByText(/^The microphone is paused/)).toBeTruthy();
    const again = within(panel).getByRole('button', { name: 'Speak to Luna' });
    expect(again.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(again);
    expect(toggleMic).toHaveBeenCalledTimes(2);
  });

  it('where the browser has no speech recognition, records a phrase at a press of the microphone and sends it at the next (spec 22.5)', () => {
    const toggleMic = vi.fn();
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'ready', toggleMic, canListen: true, pressToTalk: true }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    expect(within(panel).getByText('Press the microphone and speak; press it again when you have finished.')).toBeTruthy();
    const mic = within(panel).getByRole('button', { name: 'Speak to Luna' });
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(mic);
    expect(toggleMic).toHaveBeenCalledTimes(1);
    act(() => lunaStore.setState({ status: 'listening' }));
    expect(within(panel).getByText('Listening. Press the square when you have finished.')).toBeTruthy();
    const send = within(panel).getByRole('button', { name: 'Stop and send' });
    expect(send.getAttribute('aria-pressed')).toBe('true');
    expect(within(panel).getByText(/up to 15 seconds/)).toBeTruthy();
    expect(within(panel).queryByText(/she acts when you pause/)).toBeNull();
    fireEvent.click(send);
    expect(toggleMic).toHaveBeenCalledTimes(2);
  });

  it('on a phone spans the screen under the header, 16 px from each edge, rather than hang off the toggle past the edge', () => {
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'listening' }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    for (const c of ['max-sm:left-4', 'max-sm:right-4', 'max-sm:w-auto']) expect(panel.classList.contains(c), c).toBe(true);
    // The toggle's own box is the panel's frame only from 640 px; below, the header's is.
    expect(panel.parentElement!.className).toBe('sm:relative');
  });

  it('offers ready-made messages, one press each, and sets every word at 14 px or more', () => {
    const submit = vi.fn();
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'ready', submit, messages: [] }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    fireEvent.click(within(panel).getByRole('button', { name: 'open the view from the site' }));
    expect(submit).toHaveBeenCalledWith('open the view from the site');
    // Planning a landing is one of them (spec 23: the planner).
    expect(within(panel).getByRole('button', { name: 'plan a landing' })).toBeTruthy();
    for (const el of panel.querySelectorAll<HTMLElement>('*')) {
      const size = el.className.toString().match(/text-\[(\d+)px\]/);
      if (size) expect(Number(size[1]), el.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(14);
    }
  });
});

describe('her switch for saying replies aloud', () => {
  const open = () => {
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'listening', canListen: true }));
    return screen.getByRole('region', { name: 'Luna' });
  };

  it('is a real switch in her panel, labelled plainly, on at first as spec 22 has her', () => {
    const panel = open();
    const sw = within(panel).getByRole('switch', { name: 'Say replies aloud' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    // A button in the tab order, with the page’s own focus ring, and a target of 44 px or more.
    expect(sw.tagName).toBe('BUTTON');
    expect(sw.getAttribute('type')).toBe('button');
    expect(sw.tabIndex).toBe(0);
    expect(sw.className).not.toMatch(/outline-none|outline-0/);
    expect(sw.className).toMatch(/\bmin-h-11\b/);
    // Outside the box to type to her, so Enter flips it and sends nothing.
    expect(sw.closest('form')).toBeNull();
  });

  it('turns her voice off and on again at a press, and the panel says which', () => {
    const panel = open();
    const sw = within(panel).getByRole('switch', { name: 'Say replies aloud' });
    fireEvent.click(sw);
    expect(lunaStore.getState().voice).toBe(false);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(lunaStore.getState().voice).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('works from the keyboard: Space and Enter flip it once each, a held key once, other keys not at all', () => {
    const panel = open();
    const sw = within(panel).getByRole('switch', { name: 'Say replies aloud' });
    sw.focus();
    expect(document.activeElement).toBe(sw);
    const press = (key: string) => {
      fireEvent.keyDown(sw, { key });
      fireEvent.keyUp(sw, { key });
    };
    press(' ');
    expect(lunaStore.getState().voice).toBe(false);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    press('Enter');
    expect(lunaStore.getState().voice).toBe(true);
    fireEvent.keyDown(sw, { key: 'Enter' });
    fireEvent.keyDown(sw, { key: 'Enter', repeat: true });
    fireEvent.keyDown(sw, { key: 'Enter', repeat: true });
    fireEvent.keyUp(sw, { key: 'Enter' });
    expect(lunaStore.getState().voice).toBe(false);
    press('a');
    press('Tab');
    expect(lunaStore.getState().voice).toBe(false);
    // The keys are its own: Space does not scroll the page under it, nor Enter press anything else.
    expect(fireEvent.keyDown(sw, { key: ' ' })).toBe(false);
    expect(fireEvent.keyUp(sw, { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(sw, { key: 'Enter' })).toBe(false);
  });

  it('leaves the microphone to pause and restart the listening, whichever way the switch is', () => {
    const toggleMic = vi.fn();
    const panel = open();
    act(() => lunaStore.setState({ toggleMic }));
    fireEvent.click(within(panel).getByRole('switch', { name: 'Say replies aloud' }));
    const mic = within(panel).getByRole('button', { name: 'Pause the microphone' });
    fireEvent.click(mic);
    expect(toggleMic).toHaveBeenCalledTimes(1);
    expect(lunaStore.getState().voice).toBe(false);
  });
});

describe('Luna’s pet (spec 23)', () => {
  it('makes a face for each thing Luna does: asleep while off, all ears while listening, a slip when the microphone is out', async () => {
    const { lunaMood, KAOMOJI } = await import('./LunaPet');
    expect(lunaMood('off')).toBe('sleepy');
    expect(lunaMood('listening')).toBe('listening');
    expect(lunaMood('thinking')).toBe('thinking');
    expect(lunaMood('speaking')).toBe('speaking');
    expect(lunaMood('typing')).toBe('happy');
    expect(lunaMood('blocked')).toBe('blocked');
    expect(lunaMood('offline')).toBe('oops');
    expect(KAOMOJI.happy).toBe('(^-^)');
  });
});
