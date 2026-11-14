// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lunaStore } from '@/lib/luna/store';
import { LunaButton } from './LunaButton';

beforeEach(() => lunaStore.setState({ on: false, status: 'off', heard: null, reply: null, submit: () => {} }));
afterEach(() => {
  cleanup();
  lunaStore.setState({ on: false, status: 'off', heard: null, reply: null, submit: () => {} });
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

  it('says what she is doing, what she heard and what she said, her replies read out as they come', () => {
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'listening' }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    expect(within(panel).getByText(/^Listening/)).toBeTruthy();
    act(() => lunaStore.setState({ heard: 'turn to Earth', reply: 'Turning to Earth.', status: 'speaking' }));
    expect(within(panel).getByText('You said: “turn to Earth”')).toBeTruthy();
    const reply = within(panel).getByText('Turning to Earth.');
    expect(reply.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('takes typed words at any time, and says how to talk when the browser cannot listen', () => {
    const submit = vi.fn();
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'typing', submit }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    expect(within(panel).getByText(/no voice input/)).toBeTruthy();
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Type to Luna' }), { target: { value: 'open compare' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(submit).toHaveBeenCalledWith('open compare');
    expect((within(panel).getByRole('textbox', { name: 'Type to Luna' }) as HTMLInputElement).value).toBe('');
    act(() => lunaStore.setState({ status: 'blocked' }));
    expect(within(panel).getByText(/microphone is not allowed/)).toBeTruthy();
  });

  it('on a phone spans the screen under the header, 16 px from each edge, rather than hang off the toggle past the edge', () => {
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'listening' }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    for (const c of ['max-sm:left-4', 'max-sm:right-4', 'max-sm:w-auto']) expect(panel.classList.contains(c), c).toBe(true);
    // The toggle's own box is the panel's frame only from 640 px; below, the header's is.
    expect(panel.parentElement!.className).toBe('sm:relative');
  });

  it('gives examples of what to say, and sets every word at 14 px or more', () => {
    render(createElement(LunaButton));
    act(() => lunaStore.setState({ on: true, status: 'listening' }));
    const panel = screen.getByRole('region', { name: 'Luna' });
    expect(panel.textContent).toMatch(/Try: “open the view from the site”/);
    for (const el of panel.querySelectorAll<HTMLElement>('*')) {
      const size = el.className.toString().match(/text-\[(\d+)px\]/);
      if (size) expect(Number(size[1]), el.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(14);
    }
  });
});
