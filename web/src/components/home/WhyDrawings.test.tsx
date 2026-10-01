// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from './WhyDrawings';

const words = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-label]')].map((l) => l.textContent);

describe('WhyDrawings', () => {
  it('writes the labels as page text of a fixed size, so they stay readable when a drawing is small', () => {
    for (const drawing of [<SunNeverClimbs key="a" />, <HillsDecide key="b" rimPct={100} sitePct={45} km={12} />, <EarthSetsToo key="c" />]) {
      const { container, unmount } = render(drawing);
      expect(container.querySelectorAll('svg text')).toHaveLength(0);
      const labels = [...container.querySelectorAll<HTMLElement>('[data-label]')];
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (const l of labels) expect(parseFloat(l.style.fontSize)).toBeGreaterThanOrEqual(15);
      unmount();
    }
  });

  it('gives every drawing its own title line', () => {
    expect(words(render(<SunNeverClimbs />).container)[0]).toBe("The Sun's path over one month");
    expect(words(render(<HillsDecide rimPct={100} sitePct={45} km={12} />).container)[0]).toBe('The same month, 12 km apart');
    expect(words(render(<EarthSetsToo />).container)[0]).toBe('Earth stays in one direction');
  });

  it('names the two places on the middle drawing the way the page does, and keeps each number with its unit', () => {
    const first = render(<HillsDecide rimPct={100} sitePct={45} km={12} />);
    expect(words(first.container)).toEqual(['The same month, 12 km apart', 'rim summit: sunlit all month', 'Rim 2: sunlit 45 % of the month']);
    first.unmount();
    const second = render(<HillsDecide rimPct={83.4} sitePct={20} km={7} />);
    expect(words(second.container)).toEqual(['The same month, 7 km apart', 'rim summit: sunlit 83 %', 'Rim 2: sunlit 20 % of the month']);
  });

  it('is a picture panel hidden from screen readers, because the text beside each drawing says the same', () => {
    const { container } = render(<SunNeverClimbs />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(container.firstElementChild?.className).toMatch(/(^| )stage( |$)/);
  });
});
