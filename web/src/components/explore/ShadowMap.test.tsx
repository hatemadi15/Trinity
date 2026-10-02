// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShadowPicture } from '@/lib/engine/shadow-handler';
import { ShadowMap } from './ShadowMap';

const picture = (siteLit: boolean): ShadowPicture => ({ id: 1, type: 'picture', key: 'k', width: 4, height: 4, pixels: new Uint8Array(16).fill(100), siteLit });

function show(extra: Partial<Parameters<typeof ShadowMap>[0]> = {}) {
  render(<ShadowMap picture={picture(true)} widthKm={20.48} siteName="de Gerlache Rim 2" lon={-64.31} sunAz={30} sunEl={2.4} earthAz={64} earthEl={-1.2} when="1 Jan 2027, 00:00 UTC" {...extra} />);
}

describe('ShadowMap', () => {
  // jsdom has no 2D canvas: the picture is painted only in a browser.
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('draws the ground from above for the hour, and says whether the site is in sunlight', () => {
    show();
    expect(screen.getByRole('img', { name: 'Shadows at 1 Jan 2027, 00:00 UTC. The site is in sunlight.' })).toBeTruthy();
    cleanup();
    show({ picture: picture(false) });
    expect(screen.getByRole('img', { name: 'Shadows at 1 Jan 2027, 00:00 UTC. The site is in shadow.' })).toBeTruthy();
  });

  it("says the site's state in the same words as the sentence above the map, when it is given", () => {
    show({ picture: picture(false), siteState: 'partly in sunlight' });
    expect(screen.getByRole('img', { name: 'Shadows at 1 Jan 2027, 00:00 UTC. The site is partly in sunlight.' })).toBeTruthy();
  });

  it('says it is working out the shadows until the first picture arrives', () => {
    show({ picture: null });
    expect(screen.getByRole('img', { name: 'Shadows at 1 Jan 2027, 00:00 UTC: being worked out.' })).toBeTruthy();
    expect(screen.getByText('Working out the shadows…')).toBeTruthy();
  });

  it('marks the site, gives a scale, and points to the Sun and to Earth with their heights', () => {
    show();
    expect(screen.getByText('de Gerlache Rim 2')).toBeTruthy();
    // Turned so north is up, the 20.48 km square shows its middle 15 km: a 2 km bar.
    expect(screen.getByText('2 km')).toBeTruthy();
    expect(screen.getByText('Sun 2° up')).toBeTruthy();
    expect(screen.getByText('Earth below the horizon')).toBeTruthy();
  });

  it('keeps the words at the end of an arrow inside the map: by their left side on the left, by their right side on the right', () => {
    show({ lon: 0, sunAz: 270, earthAz: 90, earthEl: 2 });
    const sun = screen.getByText('Sun 2° up');
    expect(sun.style.left).toBe('8%');
    expect(sun.style.transform).toBe('translate(0, -50%)');
    const earth = screen.getByText('Earth 2° up');
    expect(earth.style.left).toBe('92%');
    expect(earth.style.transform).toBe('translate(-100%, -50%)');
  });

  it("puts the site's name beside the pin, clear of the arrows' words, on a large map and on a phone-sized one", () => {
    const watchers: ((entries: { contentRect: { width: number } }[]) => void)[] = [];
    class FakeObserver {
      constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
        watchers.push(cb);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    try {
      // The Sun to the left of the pin, a little low; Earth straight up.
      show({ lon: 0, sunAz: 263, earthAz: 7 });
      act(() => watchers.forEach((cb) => cb([{ contentRect: { width: 560 } }])));
      expect(parseFloat(screen.getByText('de Gerlache Rim 2').style.top)).toBeGreaterThan(50);
      // On a 360 px map the Sun's words reach under the pin: the name goes above it instead.
      act(() => watchers.forEach((cb) => cb([{ contentRect: { width: 360 } }])));
      expect(parseFloat(screen.getByText('de Gerlache Rim 2').style.top)).toBeLessThan(50);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lets its words give way where they would overlap: the site first, then north, the Sun, Earth and the scale', () => {
    show();
    const priority = (text: string) => screen.getByText(text).closest('[data-label]')?.getAttribute('data-priority');
    expect([priority('de Gerlache Rim 2'), priority('N'), priority('Sun 2° up'), priority('Earth below the horizon'), priority('2 km')]).toEqual(['0', '1', '2', '3', '4']);
  });

  it('puts north at the top: the picture turns by the site\'s longitude, and the compass has N up', () => {
    show({ lon: -64.31 });
    const canvas = document.querySelector('canvas')!;
    expect(canvas.style.transform).toMatch(/rotate\(64\.31\d*deg\)/);
    const letters = Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-compass]')].map((e) => [e.dataset.compass, e]));
    expect(Object.keys(letters).sort()).toEqual(['E', 'N', 'S', 'W']);
    expect(parseFloat(letters.N.style.top)).toBeLessThan(30);
    expect(parseFloat(letters.E.style.left)).toBeGreaterThan(70);
    expect(parseFloat(letters.S.style.top)).toBeGreaterThan(70);
    expect(parseFloat(letters.W.style.left)).toBeLessThan(30);
  });

  it("says on the arrows' words when the hills hide them, and on the site's name whether it is lit", () => {
    show({ sunEl: 2.4, sunHidden: 'yes', earthEl: 3, earthHidden: 'yes', siteState: 'in shadow' });
    expect(screen.getByText('Sun 2° up, behind the hills')).toBeTruthy();
    expect(screen.getByText('Earth 3° up, behind the hills')).toBeTruthy();
    expect(screen.getByText('de Gerlache Rim 2, in shadow')).toBeTruthy();
  });

  it('draws the arrows thick enough to see, with heads, and Earth dotted when it is below the horizon', () => {
    show({ earthEl: -1 });
    const earth = document.querySelector<SVGLineElement>('[data-arrow="earth"]')!;
    const sun = document.querySelector<SVGLineElement>('[data-arrow="sun"]')!;
    expect(Number(sun.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(2.5);
    expect(earth.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(document.querySelectorAll('[data-arrowhead]')).toHaveLength(2);
  });

  it('names the arrows in one word on a small map, where their whole words would cover it', () => {
    const watchers: ((entries: { contentRect: { width: number } }[]) => void)[] = [];
    class FakeObserver {
      constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
        watchers.push(cb);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    try {
      show();
      expect(screen.queryByText('Sun 2° up')).toBeTruthy();
      act(() => watchers.forEach((cb) => cb([{ contentRect: { width: 300 } }])));
      expect(screen.queryByText('Sun 2° up')).toBeNull();
      expect(screen.queryByText('Earth below the horizon')).toBeNull();
      expect(screen.getByText('Sun')).toBeTruthy();
      expect(screen.getByText('Earth')).toBeTruthy();
      expect(screen.getByText('de Gerlache Rim 2')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('points each arrow along its azimuth, north being up whatever the longitude', () => {
    show({ lon: -64.31, sunAz: 90 });
    const sun = document.querySelector<SVGLineElement>('[data-arrow="sun"]')!;
    expect(Number(sun.getAttribute('x2'))).toBeGreaterThan(Number(sun.getAttribute('x1')));
    expect(Number(sun.getAttribute('y2'))).toBeCloseTo(Number(sun.getAttribute('y1')), 6);
  });
});
