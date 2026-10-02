// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Level } from '../engine/shadow';
import { useShadowPicture } from './useShadowPicture';

const level: Level = { heights: new Float32Array(16), width: 4, height: 4, pxM: 20, siteCol: 1.5, siteRow: 1.5 };

function stubClient() {
  return {
    setLevels: vi.fn<(key: string, levels: Level[]) => Promise<void>>(async () => {}),
    picture: vi.fn(async (key: string, _b: number, _e: number, half: boolean) => ({ id: 1, type: 'picture' as const, key, width: half ? 2 : 4, height: half ? 2 : 4, pixels: new Uint8Array(half ? 4 : 16), siteLit: true })),
  };
}

describe('useShadowPicture', () => {
  it('hands the levels over once, then asks for a half-resolution picture at once and the full one when the hour rests', async () => {
    const client = stubClient();
    const { result } = renderHook(() => useShadowPicture([level], 'a', 90, 2, { client }));
    await waitFor(() => expect(result.current?.width).toBe(4));
    expect(client.setLevels).toHaveBeenCalledTimes(1);
    expect(client.picture.mock.calls.map((c) => c[3])).toEqual([true, false]);
  });

  it('shows nothing from levels it no longer holds', async () => {
    const client = stubClient();
    const { result, rerender } = renderHook(({ key }) => useShadowPicture([level], key, 90, 2, { client }), { initialProps: { key: 'a' } });
    await waitFor(() => expect(result.current?.key).toBe('a'));
    rerender({ key: 'b' });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.key).toBe('b'));
  });

  it('asks for no picture while switched off, and does nothing without terrain', async () => {
    const client = stubClient();
    renderHook(() => useShadowPicture([level], 'a', 90, 2, { client, enabled: false }));
    renderHook(() => useShadowPicture([], 'none', 90, 2, { client }));
    await new Promise((r) => setTimeout(r, 300));
    expect(client.picture).not.toHaveBeenCalled();
    expect(client.setLevels.mock.calls.map((c) => c[0])).toEqual(['a']);
  });

  it('keeps the last picture when the sweep fails, without an unhandled error', async () => {
    const client = stubClient();
    const { result, rerender } = renderHook(({ el }) => useShadowPicture([level], 'a', 90, el, { client }), { initialProps: { el: 2 } });
    await waitFor(() => expect(result.current?.width).toBe(4));
    client.picture.mockRejectedValue(new Error('no terrain held for a'));
    rerender({ el: 3 });
    await new Promise((r) => setTimeout(r, 300));
    expect(result.current?.width).toBe(4);
  });
});
