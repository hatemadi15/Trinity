// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lunaStore } from '@/lib/luna/store';
import { LunaButton } from './LunaButton';

const reset = () => lunaStore.setState({ on: false, status: 'off', heard: null, reply: null, messages: [], draft: '', canDictate: false, submit: () => {}, dictate: () => {} });
beforeEach(reset);
afterEach(() => {
  cleanup();
  reset();
});

describe('Luna’s button', () => {
  it('is a toggle named Luna, off at first, with no panel', () => {
    render(createElement(LunaButton));
    const b = screen.getByRole('button', { name: /^Luna/ });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Luna' })).toBeNull();
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
    act(() => lunaStore.setState({ on: true, status: 'typing', submit, canDictate: false }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    expect(within(panel).getByText(/no voice input/)).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Speak to Luna' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Type to Luna' }), { target: { value: 'open compare' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(submit).toHaveBeenCalledWith('open compare', false);
    expect((within(panel).getByRole('textbox', { name: 'Type to Luna' }) as HTMLInputElement).value).toBe('');
    act(() => lunaStore.setState({ status: 'blocked' }));
    expect(within(panel).getByText(/microphone is not allowed/)).toBeTruthy();
  });

  it('dictates into the message box, to be read and sent: the microphone’s words wait there, and go as dictated (spec 23.2)', () => {
    const submit = vi.fn(), dictate = vi.fn();
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'ready', submit, dictate, canDictate: true, draft: '' }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Speak to Luna' }));
    expect(dictate).toHaveBeenCalledTimes(1);
    act(() => lunaStore.setState({ status: 'listening', draft: 'play the month' }));
    const box = within(panel).getByRole('textbox', { name: 'Type to Luna' }) as HTMLInputElement;
    expect(box.value).toBe('play the month');
    expect(within(panel).getByRole('button', { name: 'Stop the microphone' }).getAttribute('aria-pressed')).toBe('true');
    expect(submit).not.toHaveBeenCalled();
    act(() => lunaStore.setState({ status: 'ready' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(submit).toHaveBeenCalledWith('play the month', true);
    // Mended by hand, it goes as typed.
    act(() => lunaStore.setState({ draft: 'compare' }));
    fireEvent.change(box, { target: { value: 'compare sites' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(submit).toHaveBeenLastCalledWith('compare sites', false);
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
    expect(submit).toHaveBeenCalledWith('open the view from the site', false);
    for (const el of panel.querySelectorAll<HTMLElement>('*')) {
      const size = el.className.toString().match(/text-\[(\d+)px\]/);
      if (size) expect(Number(size[1]), el.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(14);
    }
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
