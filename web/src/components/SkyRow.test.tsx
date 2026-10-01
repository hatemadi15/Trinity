// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkyRow, SkyRowKey } from './SkyRow';

const hours = 720;
const START = '2027-01-01T00:00:00';
const el = Array.from({ length: hours }, () => 1.5);
const lit = Array.from({ length: hours }, (_, h) => (h >= 67 && h < 466 ? 0 : 1));
const hill = Array.from({ length: hours }, (_, h) => (lit[h] ? -1 : 12));
const az = Array.from({ length: hours }, (_, h) => (327 - h * 0.5 + 720) % 360);
const hillsFor = (visible: number[]) => visible.map((v) => (v ? -1 : 12));
const labelsOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-label]')];

describe('SkyRow', () => {
  it('describes the night in words and labels sunset and sunrise with their dates', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} az={az} startUtc={START} body="sun" caption="The Sun at de Gerlache Rim 2, January 2027" />);
    const picture = screen.getByRole('img');
    expect(picture.getAttribute('aria-label')).toMatch(/The Sun at de Gerlache Rim 2, January 2027/);
    expect(picture.getAttribute('aria-label')).toMatch(/hidden from 3 Jan to 20 Jan, 16 days 15 hours/);
    expect(container.textContent).toMatch(/Night for 16 days 15 hours: the hills stand higher than the Sun/);
    expect(container.textContent).toMatch(/Sun sets 3 Jan/);
    expect(container.textContent).toMatch(/Sun rises 20 Jan/);
    expect(container.textContent).toMatch(/1 Jan/);
    expect(container.textContent).toMatch(/Direction of the Sun/);
  });

  it('draws the hidden stretch dotted and the visible stretch solid, on a stage', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" />);
    const lines = [...container.querySelectorAll('polyline')];
    expect(lines.some((l) => l.getAttribute('stroke-dasharray'))).toBe(true);
    expect(lines.some((l) => !l.getAttribute('stroke-dasharray'))).toBe(true);
    expect(container.innerHTML).toContain('var(--stage)');
    expect(container.innerHTML).toContain('var(--stage-sun)');
    expect(container.textContent).not.toMatch(/Direction of/);
  });

  it('keeps every label as page text of a fixed size, so nothing shrinks when the chart gets narrower', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} az={az} startUtc={START} body="sun" caption="c" />);
    const drawings = [...container.querySelectorAll('svg')];
    expect(drawings.length).toBeGreaterThanOrEqual(1);
    for (const svg of drawings) {
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg.querySelectorAll('text')).toHaveLength(0);
    }
    const labels = labelsOf(container);
    expect(labels.length).toBeGreaterThanOrEqual(12);
    for (const l of labels) expect(parseFloat(l.style.fontSize)).toBeGreaterThanOrEqual(16);
    const stroked = [...container.querySelectorAll('svg [stroke]')].filter((n) => n.getAttribute('stroke') !== 'none');
    expect(stroked.length).toBeGreaterThanOrEqual(5);
    for (const n of stroked) expect(n.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('draws two height lines and says what they are', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" />);
    expect(container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(2);
    const words = labelsOf(container).map((l) => l.textContent);
    expect(words).toContain('5° up');
    expect(words).toContain('horizon');
    // The night sits left of the middle, so the words go to the right edge.
    const five = labelsOf(container).find((l) => l.textContent === '5° up')!;
    expect(five.className).toMatch(/right-\[var\(--chart-inset,10px\)\]/);
    // On a chart narrower than a phone screen the words of the height lines give way to the words about the night.
    expect(five.className).toMatch(/@max-\[480px\]:hidden/);
  });

  it('takes the spacing of its height lines from the chart it belongs to', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" scaleStep={10} />);
    // The range runs to 5.5°: with 10° spacing only the horizon is left.
    expect(container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/5° up/);
  });

  it('keeps the height lines but leaves their words out when both edges hold a label', () => {
    const long = Array.from({ length: hours }, (_, h) => (h >= 36 && h < 684 ? 0 : 1));
    const { container } = render(<SkyRow el={el} hill={hillsFor(long)} visible={long} startUtc={START} body="sun" caption="c" />);
    expect(container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(2);
    expect(container.textContent).not.toMatch(/5° up|horizon/);
    expect(container.textContent).toMatch(/Sun sets 2 Jan/);
  });

  it('can make room for the whole of the hills instead, with a height line every 5°', () => {
    const tall = Array.from({ length: hours }, (_, h) => (lit[h] ? -1 : 15));
    const { container } = render(<SkyRow el={el} hill={tall} visible={lit} startUtc={START} body="sun" caption="c" fitHills />);
    expect(container.querySelector('mask')).toBeNull();
    expect(labelsOf(container).map((l) => l.textContent).filter((t) => /up$|horizon/.test(t ?? ''))).toEqual(['horizon', '5° up', '10° up', '15° up']);
  });

  it('marks every place where the body goes behind the hills or comes back', () => {
    const twice = Array.from({ length: hours }, (_, h) => (h >= 100 && h < 200) || h >= 500 ? 0 : 1);
    const { container } = render(<SkyRow el={el} hill={hillsFor(twice)} visible={twice} startUtc={START} body="sun" caption="c" />);
    const dots = [...container.querySelectorAll<HTMLElement>('[data-event]')];
    expect(dots.map((d) => d.dataset.event)).toEqual(['set', 'rise', 'set']);
    expect(parseFloat(dots[0].style.left)).toBeCloseTo((100 / hours) * 100, 5);
  });

  it('puts words on every hidden stretch wide enough for them, and dates on its ends', () => {
    const twice = Array.from({ length: hours }, (_, h) => (h < 219 || h >= 543 ? 0 : 1));
    const earthEl = Array.from({ length: hours }, (_, h) => (twice[h] ? 4 : -5));
    const flat = Array.from({ length: hours }, () => 0.2);
    const { container } = render(<SkyRow el={earthEl} hill={flat} visible={twice} startUtc={START} body="earth" caption="c" />);
    const words = labelsOf(container).map((l) => l.textContent);
    expect(words).toContain('No contact for 9 days 3 hours: Earth is below the horizon');
    expect(words).toContain('No contact for 7 days 9 hours');
    expect(words).toContain('Earth rises 10 Jan');
    expect(words).toContain('Earth sets 23 Jan');
    // On a phone the chart is too narrow for two sentences side by side: only the longest stretch keeps its words.
    const short = labelsOf(container).find((l) => l.textContent === 'No contact for 7 days 9 hours')!;
    // The test is the chart's own width (a container query), not the window's: the chart can be narrow in a wide window.
    expect((container.firstElementChild as HTMLElement).className).toMatch(/(^| )@container( |$)/);
    expect(short.parentElement!.className).toMatch(/@max-\[900px\]:hidden/);
    const long = labelsOf(container).find((l) => /^No contact for 9 days 3 hours/.test(l.textContent ?? ''))!;
    expect(long.parentElement!.className).not.toMatch(/hidden/);
    expect(long.querySelector('span')!.className).toMatch(/@max-\[560px\]:hidden/);
  });

  it('gives rows the same height for a degree when told how many pixels a degree takes', () => {
    const tall = Array.from({ length: hours }, (_, h) => (lit[h] ? -1 : 15));
    const sun = render(<SkyRow el={el} hill={tall} visible={lit} startUtc={START} body="sun" caption="c" fitHills pxPerDeg={10} ticks={false} />);
    const gap = (c: HTMLElement) => {
      const y = [...c.querySelectorAll('line[stroke-dasharray]')].map((l) => Number(l.getAttribute('y1'))).sort((a, b) => b - a);
      return y[0] - y[1];
    };
    // Range -2° to 16°: 18° at 10 px each, plus the 8 px margins above and below.
    expect((sun.container.firstElementChild as HTMLElement).style.height).toBe('196px');
    expect(gap(sun.container)).toBeCloseTo(50, 5);
    sun.unmount();
    const earthEl = Array.from({ length: hours }, (_, h) => (h < 300 ? -5 : 6));
    const earth = render(<SkyRow el={earthEl} hill={Array.from({ length: hours }, () => 0.2)} visible={earthEl.map((e) => (e > 0.2 ? 1 : 0))} startUtc={START} body="earth" caption="c" pxPerDeg={10} />);
    expect(gap(earth.container)).toBeCloseTo(50, 5);
  });

  it('keeps a label centred near an edge clear of that edge', () => {
    const early = Array.from({ length: hours }, (_, h) => (h < 219 ? 0 : 1));
    const { container } = render(<SkyRow el={el} hill={hillsFor(early)} visible={early} startUtc={START} body="sun" caption="c" />);
    const night = labelsOf(container).find((l) => /^Night for/.test(l.textContent ?? ''))!;
    expect((night.parentElement as HTMLElement).style.paddingInline).toBe('var(--chart-inset, 10px)');
  });

  it('names the row in its top corner when given a title', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" title="Sunlight" />);
    const first = labelsOf(container)[0];
    expect(first.textContent).toBe('Sunlight');
    expect(first.className).toMatch(/left-\[var\(--chart-inset,10px\)\]/);
  });

  it('says the body is below the horizon when the hills in its direction are low', () => {
    const low = Array.from({ length: hours }, (_, h) => (h < 219 || h >= 543 ? 0 : 1));
    const earthEl = Array.from({ length: hours }, (_, h) => (low[h] ? 4 : -5));
    const flat = Array.from({ length: hours }, () => 0.2);
    const { container } = render(<SkyRow el={earthEl} hill={flat} visible={low} startUtc={START} body="earth" caption="c" />);
    expect(container.textContent).toMatch(/No contact for 9 days 3 hours: Earth is below the horizon/);
    expect(container.textContent).not.toMatch(/hills stand higher/);
  });

  it('fades the hills out where they run off the top, and only then', () => {
    const clipped = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" />);
    const mask = clipped.container.querySelector('mask');
    expect(mask).toBeTruthy();
    expect(clipped.container.querySelector(`g[mask="url(#${mask!.id})"]`)).toBeTruthy();
    clipped.unmount();
    const always = Array.from({ length: hours }, () => 1);
    const low = render(<SkyRow el={el} hill={hillsFor(always)} visible={always} startUtc={START} body="sun" caption="c" />);
    expect(low.container.querySelector('mask')).toBeNull();
  });

  it('writes the dates along the bottom unless told not to', () => {
    const dates = (c: HTMLElement) => labelsOf(c).map((l) => l.textContent).filter((t) => /^\d+ Jan$/.test(t ?? ''));
    const first = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" />);
    expect(dates(first.container)).toEqual(['1 Jan', '6 Jan', '11 Jan', '16 Jan', '21 Jan', '26 Jan', '31 Jan']);
    first.unmount();
    const second = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" ticks={false} />);
    expect(dates(second.container)).toEqual([]);
    expect(second.container.textContent).toMatch(/Sun sets 3 Jan/);
  });

  it('draws the line once and then shows the words when asked to reveal, and stays still otherwise', () => {
    const still = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" />);
    expect(still.container.querySelector('.reveal-line')).toBeNull();
    expect(still.container.querySelector('.reveal-after')).toBeNull();
    still.unmount();
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" reveal />);
    expect(container.querySelector('svg.reveal-line polyline')).toBeTruthy();
    const after = [...container.querySelectorAll('.reveal-after')].map((n) => n.textContent);
    expect(after.some((t) => /Night for/.test(t ?? ''))).toBe(true);
    expect(after.some((t) => /Sun sets/.test(t ?? ''))).toBe(true);
    // The scale and the dates are part of the still picture.
    expect(after.some((t) => /horizon|1 Jan/.test(t ?? ''))).toBe(false);
  });

  it('reports a stretch that began before the window instead of calling the body visible', () => {
    const visible = Array.from({ length: hours }, (_, h) => (h < 240 ? 0 : 1));
    const { container } = render(<SkyRow el={el} hill={hillsFor(visible)} visible={visible} startUtc={START} body="sun" caption="c" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/The Sun is hidden from the start until 11 Jan, 10 days\./);
    expect(container.textContent).toMatch(/Sun rises 11 Jan/);
    expect(container.textContent).not.toMatch(/Sun sets/);
  });

  it('reports a stretch that outlasts the window, and a body that never shows', () => {
    const late = Array.from({ length: hours }, (_, h) => (h < 480 ? 1 : 0));
    const first = render(<SkyRow el={el} hill={hillsFor(late)} visible={late} startUtc={START} body="sun" caption="c" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/The Sun is hidden from 21 Jan to the end, 10 days\./);
    expect(first.container.textContent).toMatch(/Sun sets 21 Jan/);
    expect(first.container.textContent).not.toMatch(/Sun rises/);
    first.unmount();
    const never = Array.from({ length: hours }, () => 0);
    const second = render(<SkyRow el={el} hill={hillsFor(never)} visible={never} startUtc={START} body="sun" caption="c" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/The Sun is hidden the whole time\./);
    expect(second.container.textContent).toMatch(/Night for 30 days/);
  });

  it('says so when the body stays in view', () => {
    const always = Array.from({ length: hours }, () => 1);
    const { container } = render(<SkyRow el={el} hill={hillsFor(always)} visible={always} startUtc={START} body="sun" caption="c" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/The Sun stays in view\./);
    expect(container.textContent).not.toMatch(/Night/);
  });

  it('speaks of contact, not night, for Earth', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="earth" caption="Earth at the site" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Earth is hidden from 3 Jan to 20 Jan/);
    expect(container.textContent).toMatch(/No contact for 16 days 15 hours: the hills stand higher than Earth/);
    expect(container.textContent).toMatch(/Earth sets 3 Jan/);
    expect(container.textContent).not.toMatch(/Night/);
    expect(container.innerHTML).toContain('var(--stage-earth)');
  });

  it('moves the sunset and sunrise labels outside a short night', () => {
    const short = Array.from({ length: hours }, (_, h) => (h >= 300 && h < 372 ? 0 : 1));
    const { container } = render(<SkyRow el={el} hill={hillsFor(short)} visible={short} startUtc={START} body="sun" caption="c" />);
    const label = (re: RegExp) => labelsOf(container).find((l) => re.test(l.textContent ?? ''))!;
    expect(label(/Sun sets/).style.right).not.toBe('');
    expect(label(/Sun rises/).style.left).not.toBe('');
  });
});

describe('SkyRowKey', () => {
  it('names the three marks of a Sun row', () => {
    render(<SkyRowKey body="sun" />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['height of the Sun', 'Sun hidden', "hills in the Sun's direction at that time"]);
  });

  it('speaks of Earth for an Earth row and explains the compass row when there is one', () => {
    const { container } = render(<SkyRowKey body="earth" compass />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items.slice(0, 3)).toEqual(['height of Earth', 'Earth hidden', "hills in Earth's direction at that time"]);
    expect(items[3]).toBe('Top row: the direction Earth is in on that date.');
    expect(container.innerHTML).toContain('var(--stage-earth)');
  });

  it('covers a Sun row and an Earth row together', () => {
    const { container } = render(<SkyRowKey body="both" />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(["the Sun's height", "Earth's height", 'dotted while hidden', 'the hills in its direction at that time']);
    expect(container.innerHTML).toContain('var(--stage-sun)');
    expect(container.innerHTML).toContain('var(--stage-earth)');
  });
});
