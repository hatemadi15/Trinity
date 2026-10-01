// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { SkyDome } from './SkyDome';

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
    sunAu: new Float64Array(hours).fill(1),
  };
  for (let h = 0; h < hours; h++) {
    s.sunAz[h] = (h * 360) / 708;
    s.sunEl[h] = 1.2;
    s.sunFraction[h] = 1;
    s.earthAz[h] = 20;
    s.earthEl[h] = 3 * Math.sin(h / 100);
    s.earthVisible[h] = s.earthEl[h] > 0 ? 1 : 0;
  }
  return s;
}

describe('SkyDome', () => {
  it('draws the ground, both tracks and the cursor markers', () => {
    const { container, getByRole } = render(
      <SkyDome mask={new Float64Array(720).fill(1)} series={series(240)} cursor={10} />,
    );
    expect(container.querySelector('[data-part="ground"]')).toBeTruthy();
    expect(container.querySelector('[data-part="sun-track"]')?.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('[data-part="earth-track"]')?.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('[data-part="sun-now"]')).toBeTruthy();
    expect(container.querySelector('[data-part="earth-now"]')).toBeTruthy();
    expect(getByRole('img').getAttribute('aria-label')).toMatch(/Sun .* Earth /);
  });
});

describe('SkyDome on a light page', () => {
  it('draws its labels and rings in stage colours, so the dial stays readable in the light theme', () => {
    const { container } = render(<SkyDome mask={new Float64Array(720).fill(1)} series={series(240)} cursor={10} />);
    const html = container.innerHTML;
    expect(html).toContain('var(--stage-ink-2)');
    expect(html).toContain('var(--stage-line)');
    expect(html).not.toContain('var(--ink-2)');
    expect(html).not.toContain('var(--line)');
    expect(html).not.toContain('var(--earth)');
  });
});
