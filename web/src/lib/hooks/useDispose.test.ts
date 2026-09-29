// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDispose } from './useDispose';

describe('useDispose', () => {
  it('disposes the previous value when it is replaced and the last one on unmount, never a null', () => {
    const a = { dispose: vi.fn() };
    const b = { dispose: vi.fn() };
    const { rerender, unmount } = renderHook(({ v }: { v: { dispose: () => void } | null }) => useDispose(v), { initialProps: { v: a as { dispose: () => void } | null } });
    expect(a.dispose).not.toHaveBeenCalled();
    rerender({ v: b });
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).not.toHaveBeenCalled();
    rerender({ v: b }); // same value: nothing disposed
    expect(b.dispose).not.toHaveBeenCalled();
    rerender({ v: null });
    expect(b.dispose).toHaveBeenCalledTimes(1);
    unmount();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });
});
