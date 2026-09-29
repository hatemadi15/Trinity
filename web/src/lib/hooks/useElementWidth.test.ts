// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementWidth } from './useElementWidth';

describe('useElementWidth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the observed width of the element and falls back to the given default', () => {
    let callback: ((entries: { contentRect: { width: number } }[]) => void) | null = null;
    class FakeObserver {
      constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
        callback = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    const el = document.createElement('div');
    const { result } = renderHook(() => useElementWidth<HTMLDivElement>(960));
    expect(result.current.width).toBe(960);
    act(() => {
      result.current.ref(el);
    });
    act(() => {
      callback!([{ contentRect: { width: 1234.6 } }]);
    });
    expect(result.current.width).toBe(1235);
  });

  it('keeps the default when ResizeObserver is missing', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { result } = renderHook(() => useElementWidth<HTMLDivElement>(700));
    act(() => {
      result.current.ref(document.createElement('div'));
    });
    expect(result.current.width).toBe(700);
  });
});
