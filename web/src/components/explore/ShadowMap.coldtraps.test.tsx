// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShadowPicture } from '@/lib/engine/shadow-handler';
import { ShadowMap } from './ShadowMap';

const picture: ShadowPicture = { id: 1, type: 'picture', key: 'k', width: 4, height: 4, pixels: new Uint8Array(16).fill(100), siteLit: true };
const cold = { mask: Uint8Array.from([1, 0, 0, 1]), width: 2, height: 2, rect: { left: 0.25, top: 0, width: 0.5, height: 1 } };

function show(extra: Partial<Parameters<typeof ShadowMap>[0]> = {}) {
  return render(<ShadowMap picture={picture} widthKm={20.48} siteName="Connecting Ridge" lon={-150.05} sunAz={30} sunEl={2.4} earthAz={64} earthEl={-1.2} when="1 Jan 2027, 00:00 UTC" {...extra} />);
}

describe('ShadowMap with the modelled cold ground', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('draws no layer unless it is given one', () => {
    const { container } = show();
    expect(container.querySelector('[data-layer="cold"]')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Shadows at 1 Jan 2027, 00:00 UTC. The site is in sunlight.');
  });

  it('lays the cold ground over the picture, turned with it, at its place on the terrain window, and says it is marked', () => {
    const { container } = show({ cold });
    const layer = container.querySelector<HTMLElement>('[data-layer="cold"]')!;
    const picture = container.querySelector<HTMLCanvasElement>('canvas')!;
    expect(layer.style.transform).toBe(picture.style.transform);
    const canvas = layer.querySelector('canvas')!;
    expect([canvas.style.left, canvas.style.top, canvas.style.width, canvas.style.height]).toEqual(['25%', '0%', '50%', '100%']);
    expect(canvas.style.imageRendering).toBe('pixelated');
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Shadows at 1 Jan 2027, 00:00 UTC. The site is in sunlight. Ground below 110 K all year in NASA’s Diviner model, where ice could last, is marked.');
  });
});
