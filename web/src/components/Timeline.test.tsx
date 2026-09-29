// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { Timeline } from './Timeline';

function series(hours: number): Series {
  const s: Series = {
    i0: 0,
    hours,
    sunAz: new Float64Array(hours),
    sunEl: new Float64Array(hours),
    earthAz: new Float64Array(hours),
    earthEl: new Float64Array(hours),
    sunFraction: new Float64Array(hours),
    earthVisible: new Uint8Array(hours),
  };
  for (let h = 0; h < hours; h++) {
    s.sunFraction[h] = h % 48 < 24 ? 1 : 0;
    s.earthVisible[h] = h % 96 < 48 ? 1 : 0;
  }
  return s;
}

// jsdom has no PointerEvent; MouseEvent carries clientX/clientY, which is all the component reads.
if (!('PointerEvent' in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

describe('Timeline', () => {
  it('renders lit bars and reports the clicked hour', () => {
    const onCursor = vi.fn();
    const { container } = render(
      <Timeline series={series(336)} startUtc="2027-01-01T00:00:00" cursor={0} onCursor={onCursor} width={672} />,
    );
    expect(container.querySelectorAll('[data-part="sun-bar"]').length).toBeGreaterThan(100);
    const surface = container.querySelector('[data-part="hit"]') as SVGRectElement;
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 672, height: 80, right: 672, bottom: 80, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(surface, { clientX: 336, clientY: 10 });
    expect(onCursor).toHaveBeenCalledWith(168);
  });
});
