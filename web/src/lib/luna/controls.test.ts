// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasControl, PENDING_MS, queueControl, registerControls, runControl, useLunaControls } from './controls';
import type { Control } from './commands';

afterEach(() => cleanup());

describe('the controls a page lends Luna', () => {
  it('runs a control a page has lent, and says when none has', () => {
    expect(runControl('play')).toEqual({ ok: false });
    expect(hasControl('play')).toBe(false);
    const play = vi.fn();
    const off = registerControls({ play });
    expect(hasControl('play')).toBe(true);
    expect(runControl('play')).toEqual({ ok: true });
    expect(play).toHaveBeenCalledTimes(1);
    off();
    expect(runControl('play')).toEqual({ ok: false });
  });

  it('passes on what the page says it did, as Luna’s reply', () => {
    const off = registerControls({ next: () => 'Sunset, 3 Jan' });
    expect(runControl('next')).toEqual({ ok: true, said: 'Sunset, 3 Jan' });
    off();
  });

  it('lets the page mounted last answer, and the one before take over when it goes', () => {
    const first = vi.fn(), second = vi.fn();
    const offFirst = registerControls({ pause: first });
    const offSecond = registerControls({ pause: second });
    runControl('pause');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    offSecond();
    runControl('pause');
    expect(first).toHaveBeenCalledTimes(1);
    offFirst();
  });

  it('keeps a control asked for before its page was there, and runs it once when the page lends it, if it comes in time', async () => {
    vi.useFakeTimers();
    try {
      const turn = vi.fn();
      queueControl('turn-earth');
      const off = registerControls({ 'turn-earth': turn });
      await vi.advanceTimersByTimeAsync(10);
      expect(turn).toHaveBeenCalledTimes(1);
      off();
      // Only once.
      const again = registerControls({ 'turn-earth': turn });
      await vi.advanceTimersByTimeAsync(10);
      expect(turn).toHaveBeenCalledTimes(1);
      again();
      // Too late: the page came after PENDING_MS.
      const late = vi.fn();
      queueControl('look-up');
      await vi.advanceTimersByTimeAsync(PENDING_MS + 1);
      const offLate = registerControls({ 'look-up': late });
      await vi.advanceTimersByTimeAsync(10);
      expect(late).not.toHaveBeenCalled();
      offLate();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lends a component’s controls while it is mounted, calling its latest handlers', () => {
    const calls: string[] = [];
    function Bar({ label }: { label: string }) {
      useLunaControls({ play: () => calls.push(label) } as Partial<Record<Control, () => void>>);
      return null;
    }
    const view = render(createElement(Bar, { label: 'one' }));
    runControl('play');
    view.rerender(createElement(Bar, { label: 'two' }));
    runControl('play');
    expect(calls).toEqual(['one', 'two']);
    act(() => view.unmount());
    expect(runControl('play')).toEqual({ ok: false });
  });
});
