// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Level } from '@/lib/engine/shadow';
import { ShadowMap } from './ShadowMap';

const level: Level = { heights: new Float32Array(16), width: 4, height: 4, pxM: 5120, siteCol: 1.5, siteRow: 1.5 };

function stubClient(siteLit = true) {
  return {
    setLevels: vi.fn(async () => {}),
    picture: vi.fn(async (key: string, _b: number, _e: number, half: boolean) => ({ id: 1, type: 'picture' as const, key, width: half ? 2 : 4, height: half ? 2 : 4, pixels: new Uint8Array(half ? 4 : 16).fill(100), siteLit })),
  };
}

function show(extra: Partial<Parameters<typeof ShadowMap>[0]> = {}) {
  const client = stubClient();
  render(
    <ShadowMap levels={[level]} levelsKey="de_gerlache_rim_2" widthKm={20.48} siteName="de Gerlache Rim 2" lon={-64.31} sunAz={30} sunEl={2.4} earthAz={64} earthEl={-1.2} when="1 Jan 2027, 00:00 UTC" client={client} {...extra} />,
  );
  return client;
}

describe('ShadowMap', () => {
  // jsdom has no 2D canvas: the picture is painted only in a browser.
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('draws the ground from above for the hour, and says so in words', async () => {
    const client = show();
    await waitFor(() => expect(client.picture).toHaveBeenCalled());
    expect(client.setLevels).toHaveBeenCalledWith('de_gerlache_rim_2', [level]);
    await waitFor(() => expect(screen.getByRole('img', { name: /^Shadows at 1 Jan 2027, 00:00 UTC\. The site is in sunlight\.$/ })).toBeTruthy());
  });

  it('marks the site, gives a scale, and points to the Sun and to Earth with their heights', () => {
    show();
    expect(screen.getByText('de Gerlache Rim 2')).toBeTruthy();
    expect(screen.getByText('5 km')).toBeTruthy();
    expect(screen.getByText('Sun 2° up')).toBeTruthy();
    expect(screen.getByText('Earth below the horizon')).toBeTruthy();
  });

  it('asks for a quick half-resolution picture first and the full one once the time rests', async () => {
    const client = show();
    await waitFor(() => expect(client.picture).toHaveBeenCalled());
    expect(client.picture.mock.calls[0][3]).toBe(true);
    await waitFor(() => expect(client.picture.mock.calls.some((c) => c[3] === false)).toBe(true));
  });

  it("turns the arrows with the site: the Sun's map bearing is its azimuth plus the longitude", () => {
    show({ lon: 0, sunAz: 90 });
    const sun = document.querySelector<SVGLineElement>('[data-arrow="sun"]')!;
    expect(Number(sun.getAttribute('x2'))).toBeGreaterThan(Number(sun.getAttribute('x1')));
    expect(Number(sun.getAttribute('y2'))).toBeCloseTo(Number(sun.getAttribute('y1')), 6);
  });
});
