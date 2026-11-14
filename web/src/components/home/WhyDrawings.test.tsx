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
    expect(words(first.container)).toEqual(['The same month, 12 km apart', 'rim summit', 'sunlit all month', 'Sun, low', 'shadow of the rim', 'Rim 2: sunlit 45 % of the month']);
    first.unmount();
    const second = render(<HillsDecide rimPct={83.4} sitePct={20} km={7} />);
    expect(words(second.container)).toEqual(['The same month, 7 km apart', 'rim summit', 'sunlit 83 % of the month', 'Sun, low', 'shadow of the rim', 'Rim 2: sunlit 20 % of the month']);
    // The two places are big enough to see, each ringed so it shows on black.
    for (const dot of second.container.querySelectorAll('circle[data-place]')) {
      expect(Number(dot.getAttribute('r'))).toBeGreaterThanOrEqual(8);
      expect(dot.getAttribute('stroke')).toBe('var(--stage-ink)');
    }
    expect(second.container.querySelectorAll('circle[data-place]')).toHaveLength(2);
  });

  it('names what is in each drawing where it stands: the Sun, Earth, the ground and a lander (spec 23)', () => {
    expect(words(render(<SunNeverClimbs />).container)).toEqual(["The Sun's path over one month", 'a low circle around the horizon', 'Sun', 'a lander at the south pole', "the Moon's ground and hills"]);
    expect(words(render(<EarthSetsToo />).container)).toEqual(['Earth stays in one direction', 'and bobs above and below the hills', 'Earth', 'lander', 'below the hills: no radio']);
  });

  it('is a picture panel hidden from screen readers, because the text beside each drawing says the same', () => {
    const { container } = render(<SunNeverClimbs />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(container.firstElementChild?.className).toMatch(/(^| )stage( |$)/);
  });
});
