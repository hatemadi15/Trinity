// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bandHeight } from './StarBand';

const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 1440, width: 1440, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/** Two stars in the band (ecliptic latitude −10° at longitudes 255° and 260°) as the catalogue file stores them. */
function starBytes(): ArrayBuffer {
  const e = (23.4393 * Math.PI) / 180, rows: number[] = [];
  for (const lonDeg of [255, 260]) {
    const lon = (lonDeg * Math.PI) / 180, lat = (-10 * Math.PI) / 180;
    const xe = Math.cos(lat) * Math.cos(lon), ye = Math.cos(lat) * Math.sin(lon), ze = Math.sin(lat);
    rows.push(xe, ye * Math.cos(e) - ze * Math.sin(e), ye * Math.sin(e) + ze * Math.cos(e), 2, 0.6);
  }
  return new Float32Array(rows).buffer;
}

afterEach(() => vi.restoreAllMocks());

describe('bandHeight', () => {
  it('runs to the header’s foot on a page without a marked title, as the home page, where the arrival starts under it', () => {
    const frame = document.createElement('div');
    frame.innerHTML = '<header></header><div></div>';
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(box(0, 2000));
    vi.spyOn(frame.querySelector('header')!, 'getBoundingClientRect').mockReturnValue(box(0, 68));
    expect(bandHeight(frame)).toBe(68);
  });

  it('runs just past the marked title, stopping short of the running text under it, however the title wraps', () => {
    const frame = document.createElement('div');
    frame.innerHTML = '<header></header><main><h1 data-band-end="">Choose a landing site</h1><p>19 places</p></main>';
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(box(0, 2000));
    const h1 = frame.querySelector('h1')!, p = frame.querySelector('p')!;
    const title = vi.spyOn(h1, 'getBoundingClientRect').mockReturnValue(box(110, 158));
    const words = vi.spyOn(p, 'getBoundingClientRect').mockReturnValue(box(170, 200));
    // 12 px to the paragraph: the band ends 4 px short of it.
    expect(bandHeight(frame)).toBe(166);
    // The title on two lines pushes the paragraph down: the band follows.
    title.mockReturnValue(box(110, 206));
    words.mockReturnValue(box(250, 280));
    expect(bandHeight(frame)).toBe(230);
  });
});

describe('StarBand', () => {
  // The catalogue is fetched once for the page's life: each test starts with a fresh module.
  beforeEach(() => vi.resetModules());

  it('draws the catalogue’s stars on a canvas the screen reader skips, once they arrive', async () => {
    const { StarBand } = await import('./StarBand');
    // A frame 1440 px wide whose header ends 300 px down: both stars stand inside the band.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1440);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'HEADER' ? box(0, 300) : box(0, 2000);
    });
    const fill = vi.fn();
    const g = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as unknown as CanvasRenderingContext2D);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(starBytes()));
    const { container } = render(
      <div>
        <StarBand />
        <header />
      </div>,
    );
    const canvas = container.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.className).toMatch(/\bstar-band\b/);
    await waitFor(() => expect(fill).toHaveBeenCalledTimes(2));
    expect(canvas.style.height).toBe('300px');
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toMatch(/\/sky\/stars\.bin$/);
  });

  it('leaves the page as it is, with no stars and no error, when the catalogue cannot be fetched', async () => {
    const { StarBand } = await import('./StarBand');
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const { container } = render(
      <div>
        <StarBand />
        <header />
      </div>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(getContext).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')!.style.height).toBe('');
  });
});
