// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from './WhyDrawings';

describe('WhyDrawings', () => {
  it('writes the labels as page text of a fixed size, so they stay readable when a drawing is small', () => {
    for (const drawing of [<SunNeverClimbs key="a" />, <HillsDecide key="b" rimPct={100} sitePct={45} km={12} />, <EarthSetsToo key="c" />]) {
      const { container, unmount } = render(drawing);
      expect(container.querySelectorAll('svg text')).toHaveLength(0);
      const labels = [...container.querySelectorAll<HTMLElement>('[data-label]')];
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (const l of labels) expect(parseFloat(l.style.fontSize)).toBeGreaterThanOrEqual(13);
      unmount();
    }
  });

  it('puts the real pair of numbers on the middle drawing', () => {
    const first = render(<HillsDecide rimPct={100} sitePct={45} km={12} />);
    expect(first.container.textContent).toContain('crater rim: sunlight all month');
    expect(first.container.textContent).toContain('12 km away: 45 %');
    first.unmount();
    const second = render(<HillsDecide rimPct={83.4} sitePct={20} km={7} />);
    expect(second.container.textContent).toContain('crater rim: 83 %');
    expect(second.container.textContent).toContain('7 km away: 20 %');
  });

  it('is hidden from screen readers, because the text beside each drawing says the same', () => {
    const { container } = render(<SunNeverClimbs />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});
