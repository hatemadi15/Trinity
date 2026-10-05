// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOME } from '@/lib/data/home';
import { narrowLayout, narrowRowOf, SkyRow, SkyRowKey, wordWidth, type Box } from './SkyRow';

const hours = 720;
const START = '2027-01-01T00:00:00';
const el = Array.from({ length: hours }, () => 1.5);
const lit = Array.from({ length: hours }, (_, h) => (h >= 67 && h < 466 ? 0 : 1));
const hill = Array.from({ length: hours }, (_, h) => (lit[h] ? -1 : 12));
const az = Array.from({ length: hours }, (_, h) => (327 - h * 0.5 + 720) % 360);
const hillsFor = (visible: number[]) => visible.map((v) => (v ? -1 : 12));
const labelsOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-label]')];

/**
 * Whether an element's own classes hide it on a chart `chart` px wide in a window `screen` px wide: jsdom lays
 * nothing out, so the chart's width (container queries) and the window's (media queries) are read off the classes.
 */
function hides(n: Element, chart: number, screen: number): boolean {
  return (n.getAttribute('class') ?? '').split(/\s+/).some((c) => {
    const max = /^@max-\[(\d+)px\]:hidden$/.exec(c);
    const min = /^@min-\[(\d+)px\]:hidden$/.exec(c);
    if ((max && chart < Number(max[1])) || (min && chart >= Number(min[1]))) return true;
    return (c === 'max-lg:hidden' && screen < 1024) || (c === 'lg:hidden' && screen >= 1024) || (c === 'max-md:hidden' && screen < 768) || (c === 'max-sm:hidden' && screen < 640);
  });
}
/** Whether a word shows at those widths: neither it nor anything around it is hidden there. */
function shownAt(node: Element, chart: number, screen: number): boolean {
  for (let n: Element | null = node; n; n = n.parentElement) if (hides(n, chart, screen)) return false;
  return true;
}
/** A word's text as shown at those widths, leaving out any part of it hidden there. */
function textAt(node: Node, chart: number, screen: number): string {
  if (node.nodeType === node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element && hides(node, chart, screen)) return '';
  return [...node.childNodes].map((c) => textAt(c, chart, screen)).join('');
}
/** The words a chart shows at those widths, as read off the page, a no-break space as a plain one. */
const wordsAt = (container: HTMLElement, chart: number, screen = chart) =>
  labelsOf(container)
    .filter((l) => shownAt(l, chart, screen))
    .map((l) => textAt(l, chart, screen).replace(/\s/g, ' '));

/**
 * The words a wide screen shows, each with where it stands: its own place, and the place of the box that centres
 * it when there is one. Sizes and colours are left out.
 */
const desktopWords = (container: HTMLElement) =>
  labelsOf(container)
    .filter((l) => shownAt(l, 1216, 1440))
    .map((l) => {
      const at = (s: CSSStyleDeclaration) =>
        ['top', 'bottom', 'left', 'right', 'padding-inline', 'flex-direction']
          .filter((k) => s.getPropertyValue(k))
          .map((k) => `${k} ${s.getPropertyValue(k)}`)
          .join(', ');
      const box = l.parentElement!.classList.contains('label-centred') ? ` in ${at(l.parentElement!.style)}` : '';
      const own = [...[...l.classList].filter((c) => /^(left|right)-/.test(c)), at(l.style)].filter(Boolean).join(', ');
      return `${l.textContent}${own ? ` at ${own}` : ''}${box}`;
    });

/** The home page's two forecast rows, as page.tsx draws them. */
const sky = HOME.sky;
const sunRow = { el: sky.sun_el, hill: sky.hill_el, visible: sky.lit, startUtc: sky.start_utc, body: 'sun', title: 'Sunlight', pxPerDeg: 6.5, ticks: false, fitHills: true } as const;
const earthRow = { el: sky.earth_el, hill: sky.earth_hill_el, visible: sky.earth_visible, startUtc: sky.start_utc, body: 'earth', title: 'Contact with Earth', pxPerDeg: 6.5 } as const;
/** Hidden for 14 % of the month, from 7 to 12 January: its two markers close together on a narrow chart. */
const short14 = Array.from({ length: hours }, (_, h) => (h >= 165 && h < 266 ? 0 : 1));
const short14Row = { el, hill: hillsFor(short14), visible: short14, startUtc: START, body: 'sun', height: 110, ticks: false } as const;
/** Hidden for a quarter of the month, then flickering out and in again for 2 hours as it comes back: markers with no words of their own, beside the sunrise's. */
const flicker = Array.from({ length: hours }, (_, h) => ((h >= 300 && h < 480) || (h >= 482 && h < 484) ? 0 : 1));
/** Two long nights 6 hours apart: a sunrise's marker and a sunset's almost on top of each other. */
const blip = Array.from({ length: hours }, (_, h) => ((h >= 100 && h < 380) || (h >= 386 && h < 700) ? 0 : 1));
/** Rows whose words a narrow chart places for its own width, and the widths with their side gutters they are placed for. */
const narrowRows = [
  sunRow,
  earthRow,
  { el, hill, visible: lit, startUtc: START, body: 'sun' },
  { el, hill: hillsFor(Array.from({ length: hours }, (_, h) => (h >= 100 && h < 424 ? 0 : 1))), visible: Array.from({ length: hours }, (_, h) => (h >= 100 && h < 424 ? 0 : 1)), startUtc: START, body: 'earth', height: 90, ticks: false },
  short14Row,
  { el, hill: hillsFor(flicker), visible: flicker, startUtc: START, body: 'sun', height: 110, ticks: false },
] as const;
const blipRow = { el, hill: hillsFor(blip), visible: blip, startUtc: START, body: 'sun', height: 110, ticks: false } as const;
const narrowWidths = [[220, 16], [280, 16], [360, 16], [390, 16], [640, 32]] as const;
/**
 * A sunset's or sunrise's own marker on a narrow chart `width` px wide, where it is (px), and how far its words may
 * reach across: 24 px short of the markers either side of it (twice the 12 px they stand from their own), or halfway
 * to one nearer than 48 px. Markers with no words of their own within 24 px of it stand with it, and its words may
 * reach past them.
 */
function markerOf(row: ReturnType<typeof narrowRowOf>, key: string, width: number) {
  const nearest = (at: number) => row.dots.reduce((a, d, i) => (Math.abs(d.pct - at) < Math.abs(row.dots[a].pct - at) ? i : a), 0);
  const e = row.events.find((v) => v.key === key)!, k = nearest(e.at), named = new Set(row.events.map((v) => nearest(v.at)));
  const xs = row.dots.map((d) => (d.pct / 100) * width);
  const bound = xs.filter((x, i) => i !== k && (named.has(i) || Math.abs(x - xs[k]) >= 24));
  const toward = (x: number) => (Math.abs(x - xs[k]) >= 48 ? x - Math.sign(x - xs[k]) * 24 : (x + xs[k]) / 2);
  const before = bound.filter((x) => x < xs[k]).map(toward), after = bound.filter((x) => x > xs[k]).map(toward);
  return { e, pct: row.dots[k].pct, x: xs[k], y: row.dots[k].y, from: before.length ? Math.max(...before) : 0, to: after.length ? Math.min(...after) : width };
}

describe('SkyRow', () => {
  it('describes the night in words and labels sunset and sunrise with their dates', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} az={az} startUtc={START} body="sun" caption="The Sun at de Gerlache Rim 2, January 2027" />);
    const picture = screen.getByRole('img');
    expect(picture.getAttribute('aria-label')).toMatch(/The Sun at de Gerlache Rim 2, January 2027/);
    expect(picture.getAttribute('aria-label')).toMatch(/is set from 3 Jan to 20 Jan, 16 days 15 hours/);
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
    // 16 px and up, and 14 px at the least for the words a narrow chart has to fit in.
    for (const l of labels) expect(parseFloat(l.style.fontSize)).toBeGreaterThanOrEqual(14);
    const stroked = [...container.querySelectorAll('svg [stroke]')].filter((n) => n.getAttribute('stroke') !== 'none');
    expect(stroked.length).toBeGreaterThanOrEqual(5);
    for (const n of stroked) expect(n.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('draws two solid height lines and says what they are; dotted is kept for a hidden body', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" />);
    const heights = [...container.querySelectorAll('line[data-height]')];
    expect(heights).toHaveLength(2);
    for (const l of heights) expect(l.getAttribute('stroke-dasharray')).toBeNull();
    const words = wordsAt(container, 1216, 1440);
    expect(words).toContain('5° up');
    expect(words).toContain('horizon (0°)');
    // The night sits left of the middle, so the words go to the right edge.
    const five = labelsOf(container).find((l) => l.textContent === '5° up' && shownAt(l, 1216, 1440))!;
    expect(five.className).toMatch(/right-\[var\(--chart-inset,10px\)\]/);
    // A narrow chart keeps words for its height lines too, placed for its own width.
    expect(wordsAt(container, 390)).toContain('5° up');
    expect(wordsAt(container, 390).some((w) => w === 'horizon (0°)' || w === '0°')).toBe(true);
  });

  it('takes the spacing of its height lines from the chart it belongs to', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" scaleStep={10} />);
    // The range runs to 5.5°: with 10° spacing only the horizon is left.
    expect(container.querySelectorAll('line[data-height]')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/5° up/);
  });

  it("leaves out only the words of a height line that would sit on another label at both edges", () => {
    const long = Array.from({ length: hours }, (_, h) => (h >= 36 && h < 684 ? 0 : 1));
    const { container } = render(<SkyRow el={el} hill={hillsFor(long)} visible={long} startUtc={START} body="sun" caption="c" />);
    expect(container.querySelectorAll('line[data-height]')).toHaveLength(2);
    // The sunset and sunrise labels sit at both edges at the height of the horizon, not at 5°.
    const words = wordsAt(container, 1216, 1440);
    expect(words).toContain('5° up');
    expect(words).not.toContain('horizon (0°)');
    expect(container.textContent).toMatch(/Sun sets 2 Jan/);
  });

  it('can make room for the whole of the hills instead, with a height line every 5°', () => {
    const tall = Array.from({ length: hours }, (_, h) => (lit[h] ? -1 : 15));
    const { container } = render(<SkyRow el={el} hill={tall} visible={lit} startUtc={START} body="sun" caption="c" fitHills />);
    expect(container.querySelector('mask')).toBeNull();
    expect(wordsAt(container, 1216, 1440).filter((t) => /up$|horizon/.test(t))).toEqual(['horizon (0°)', '5° up', '10° up', '15° up']);
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
    const words = wordsAt(container, 1216, 1440);
    expect(words).toContain('No contact for 9 days 3 hours: Earth is below the horizon');
    expect(words).toContain('No contact for 7 days 9 hours');
    expect(words).toContain('Earth rises 10 Jan');
    expect(words).toContain('Earth sets 23 Jan');
    // The tests are the chart's own width (a container query), not the window's: the chart can be narrow in a wide window.
    expect((container.firstElementChild as HTMLElement).className).toMatch(/(^| )@container( |$)/);
    // On the chart itself, below 900 px there is no room for two sentences side by side: the shorter stretch's give way.
    const short = labelsOf(container).find((l) => l.textContent === 'No contact for 7 days 9 hours' && shownAt(l, 1216, 1440))!;
    expect(short.parentElement!.className).toMatch(/@max-\[900px\]:hidden/);
    // On a phone, the words of both stretches and both dates' events stay.
    expect(wordsAt(container, 390)).toEqual(expect.arrayContaining(['No contact for 9 days 3 hours', 'No contact for 7 days 9 hours', 'Earth rises 10 Jan', 'Earth sets 23 Jan']));
  });

  it('keeps both dates of a stretch on a narrow chart, each with its event, where they would not fit side by side under the line', () => {
    const shown = (visible: number[], chart: number) => {
      const { container, unmount } = render(<SkyRow el={el} hill={hillsFor(visible)} visible={visible} startUtc={START} body="earth" caption="c" />);
      const words = wordsAt(container, chart);
      unmount();
      return words;
    };
    // Hidden for 45 %, 55 % and 14 % of the month: on a 300 px chart and a 390 px one, both events keep their words and dates.
    for (const chart of [300, 390]) {
      expect(shown(Array.from({ length: hours }, (_, h) => (h >= 100 && h < 424 ? 0 : 1)), chart)).toEqual(expect.arrayContaining(['Earth sets 5 Jan', 'Earth rises 18 Jan']));
      expect(shown(lit, chart)).toEqual(expect.arrayContaining(['Earth sets 3 Jan', 'Earth rises 20 Jan']));
      expect(shown(Array.from({ length: hours }, (_, h) => (h >= 165 && h < 266 ? 0 : 1)), chart)).toEqual(expect.arrayContaining(['Earth sets 7 Jan', 'Earth rises 12 Jan']));
    }
  });

  it('ranks its labels, so that where two would overlap at some width the more important one stays', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" title="Sunlight" />);
    const priority = (re: RegExp) => labelsOf(container).find((l) => re.test(l.textContent ?? ''))!.dataset.priority;
    expect(priority(/^Sunlight$/)).toBe('0');
    expect(priority(/^Night for 16 days 15 hours/)).toBe('1');
    expect(priority(/Sun sets 3 Jan/)).toBe('2');
    expect(priority(/^5° up$/)).toBe('4');
    expect(priority(/^6 Jan$/)).toBe('5');
  });

  it('gives rows the same height for a degree when told how many pixels a degree takes', () => {
    const tall = Array.from({ length: hours }, (_, h) => (lit[h] ? -1 : 15));
    const sun = render(<SkyRow el={el} hill={tall} visible={lit} startUtc={START} body="sun" caption="c" fitHills pxPerDeg={10} ticks={false} />);
    const gap = (c: HTMLElement) => {
      const y = [...c.querySelectorAll('line[data-height]')].map((l) => Number(l.getAttribute('y1'))).sort((a, b) => b - a);
      return y[0] - y[1];
    };
    // Range -2° to 16°: 18° at 10 px each, plus the 8 px margins above and below.
    expect((sun.container.querySelector('[role="img"]') as HTMLElement).style.height).toBe('196px');
    expect(gap(sun.container)).toBeCloseTo(50, 5);
    sun.unmount();
    const earthEl = Array.from({ length: hours }, (_, h) => (h < 300 ? -5 : 6));
    const earth = render(<SkyRow el={earthEl} hill={Array.from({ length: hours }, () => 0.2)} visible={earthEl.map((e) => (e > 0.2 ? 1 : 0))} startUtc={START} body="earth" caption="c" pxPerDeg={10} />);
    expect(gap(earth.container)).toBeCloseTo(50, 5);
  });

  it('keeps a label centred near an edge clear of that edge', () => {
    const early = Array.from({ length: hours }, (_, h) => (h < 219 ? 0 : 1));
    const { container } = render(<SkyRow el={el} hill={hillsFor(early)} visible={early} startUtc={START} body="sun" caption="c" />);
    for (const [chart, screen] of [[1216, 1440], [390, 390]]) {
      const night = labelsOf(container).find((l) => /^Night for/.test(l.textContent ?? '') && shownAt(l, chart, screen))!;
      expect((night.parentElement as HTMLElement).style.paddingInline).toBe('var(--chart-inset, 10px)');
    }
  });

  it('names the row in its top corner when given a title, and on a narrow chart above it', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" title="Sunlight" />);
    const plot = screen.getByRole('img');
    const wide = labelsOf(plot).filter((l) => shownAt(l, 1216, 1440))[0];
    expect(wide.textContent).toBe('Sunlight');
    expect(wide.className).toMatch(/left-\[var\(--chart-inset,10px\)\]/);
    const narrow = labelsOf(container).filter((l) => shownAt(l, 390, 390))[0];
    expect(narrow.textContent).toBe('Sunlight');
    expect(narrow.className).toMatch(/left-\[var\(--chart-inset,10px\)\]/);
    expect(plot.contains(narrow)).toBe(false);
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

  it('draws the line and its words at once: nothing plays by itself (spec 6)', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" />);
    expect(container.querySelector('.reveal-line, .reveal-after')).toBeNull();
    expect(container.textContent).toMatch(/Sun sets/);
  });

  it('reports a stretch that began before the window instead of calling the body visible', () => {
    const visible = Array.from({ length: hours }, (_, h) => (h < 240 ? 0 : 1));
    const { container } = render(<SkyRow el={el} hill={hillsFor(visible)} visible={visible} startUtc={START} body="sun" caption="c" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/The Sun is set from the start until 11 Jan, 10 days\./);
    expect(container.textContent).toMatch(/Sun rises 11 Jan/);
    expect(container.textContent).not.toMatch(/Sun sets/);
  });

  it('reports a stretch that outlasts the window, and a body that never shows', () => {
    const late = Array.from({ length: hours }, (_, h) => (h < 480 ? 1 : 0));
    const first = render(<SkyRow el={el} hill={hillsFor(late)} visible={late} startUtc={START} body="sun" caption="c" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/The Sun is set from 21 Jan to the end, 10 days\./);
    expect(first.container.textContent).toMatch(/Sun sets 21 Jan/);
    expect(first.container.textContent).not.toMatch(/Sun rises/);
    first.unmount();
    const never = Array.from({ length: hours }, () => 0);
    const second = render(<SkyRow el={el} hill={hillsFor(never)} visible={never} startUtc={START} body="sun" caption="c" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/The Sun stays set the whole time\./);
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
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Earth is set from 3 Jan to 20 Jan/);
    expect(container.textContent).toMatch(/No contact for 16 days 15 hours: the hills stand higher than Earth/);
    expect(container.textContent).toMatch(/Earth sets 3 Jan/);
    expect(container.textContent).not.toMatch(/Night/);
    expect(container.innerHTML).toContain('var(--stage-earth)');
  });

  it('moves the sunset and sunrise labels outside a short night', () => {
    const short = Array.from({ length: hours }, (_, h) => (h >= 300 && h < 372 ? 0 : 1));
    const { container } = render(<SkyRow el={el} hill={hillsFor(short)} visible={short} startUtc={START} body="sun" caption="c" />);
    const label = (re: RegExp) => labelsOf(container).find((l) => re.test(l.textContent ?? '') && shownAt(l, 1216, 1440))!;
    expect(label(/Sun sets/).style.right).not.toBe('');
    expect(label(/Sun rises/).style.left).not.toBe('');
  });
});

describe('SkyRow on a narrow chart', () => {
  it('keeps the desktop as it was: the same words in the same places on a wide screen', () => {
    const sun = render(<SkyRow {...sunRow} caption="c" />);
    expect(desktopWords(sun.container)).toEqual([
      'Sunlight at left-[var(--chart-inset,10px)], top 14px',
      'horizon (0°) at right-[var(--chart-inset,10px)], top 101.77999999999999px',
      '5° up at right-[var(--chart-inset,10px)], top 69.27999999999997px',
      '10° up at right-[var(--chart-inset,10px)], top 36.77999999999997px',
      '15° up at right-[var(--chart-inset,10px)], top 4.27999999999998px',
      'Night for 16 days 15 hours: the hills stand higher than the Sun in top 42px, left 0%, right 25.972222222222214%, flex-direction row',
      'Sun sets 3 Jan at top 110.86999999999998px, left calc(9.375% + 12px)',
      'Sun rises 20 Jan at top 110.86999999999998px, right calc(35.2083% + 12px)',
    ]);
    sun.unmount();
    const earth = render(<SkyRow {...earthRow} caption="c" />);
    expect(desktopWords(earth.container)).toEqual([
      'Contact with Earth at left-[var(--chart-inset,10px)], top 14px',
      'No contact for 9 days 3 hours: Earth is below the horizon in top 42px, left 0%, right 69.58333333333334%, padding-inline var(--chart-inset, 10px), flex-direction row',
      'Earth rises 10 Jan at top 78.35499999999999px, right calc(69.5139% + 12px)',
      'No contact for 7 days 9 hours in top 42px, left 75.41666666666666%, right 0%, padding-inline var(--chart-inset, 10px), flex-direction row-reverse',
      'Earth sets 23 Jan at top 73.09px, left calc(75.4861% + 12px)',
      '1 Jan at left-[var(--chart-inset,10px)], bottom 3px',
      '6 Jan in bottom 3px, left 0%, right 66.66666666666669%, padding-inline var(--chart-inset, 10px), flex-direction row',
      '11 Jan in bottom 3px, left 0%, right 33.33333333333334%, flex-direction row',
      '16 Jan in bottom 3px, left 0%, right 0%, flex-direction row',
      '21 Jan in bottom 3px, left 33.333333333333314%, right 0%, flex-direction row-reverse',
      '26 Jan in bottom 3px, left 66.66666666666669%, right 0%, padding-inline var(--chart-inset, 10px), flex-direction row-reverse',
      '31 Jan at right-[var(--chart-inset,10px)], bottom 3px',
    ]);
  });

  it("names each of the home page's markers on a phone by its event and its date, as the desktop does", () => {
    const sun = render(<SkyRow {...sunRow} caption="c" />);
    expect(wordsAt(sun.container, 390)).toEqual(expect.arrayContaining(['Sun sets 3 Jan', 'Sun rises 20 Jan']));
    sun.unmount();
    const earth = render(<SkyRow {...earthRow} caption="c" />);
    const words = wordsAt(earth.container, 390);
    expect(words).toEqual(expect.arrayContaining(['Earth rises 10 Jan', 'Earth sets 23 Jan']));
    // The only dates on their own are the ones along the bottom.
    expect(words.filter((w) => /^\d+ Jan$/.test(w))).toEqual(['1 Jan', '11 Jan', '21 Jan', '31 Jan']);
  });

  it('keeps a degree scale on a phone: the 0° line and a height above it, on both rows', () => {
    for (const row of [sunRow, earthRow]) {
      const { container, unmount } = render(<SkyRow {...row} caption="c" />);
      const words = wordsAt(container, 390);
      expect(words.some((w) => w === 'horizon (0°)' || w === '0°')).toBe(true);
      expect(words.some((w) => /^\d+° up$/.test(w))).toBe(true);
      unmount();
    }
  });

  it('names every stretch without contact on a phone, the second one too, in a band above the chart over a bracket spanning it', () => {
    const { container } = render(<SkyRow {...earthRow} caption="c" />);
    const words = wordsAt(container, 390);
    expect(words).toEqual(expect.arrayContaining(['Contact with Earth', 'No contact for 9 days 3 hours', 'No contact for 7 days 9 hours']));
    // Above the chart, not on it, where a phone's chart has no room for them.
    const plot = screen.getByRole('img');
    const named = labelsOf(container).filter((l) => /^No contact for/.test(l.textContent ?? '') && shownAt(l, 390, 390));
    expect(named).toHaveLength(2);
    for (const l of named) expect(plot.contains(l)).toBe(false);
    // Each over a bracket from its first hour to its last: from the start to 10 Jan, and from 23 Jan to the end.
    const brackets = [...container.querySelectorAll<HTMLElement>('[data-bracket]')].filter((b) => shownAt(b, 390, 390));
    expect(brackets.map((b) => [b.style.left, b.style.right])).toEqual([
      ['0%', `${100 - (219.5 / 720) * 100}%`],
      [`${(543.5 / 720) * 100}%`, '0%'],
    ]);
    // On a wide screen the words stand on the chart, as before, and the band above it is gone.
    expect(labelsOf(container).filter((l) => shownAt(l, 1216, 1440) && !plot.contains(l))).toEqual([]);
  });

  it('keeps every word at 14 px or more, inside the chart and clear of every other word and of the markers, at each width it is worked out for', () => {
    const meet = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (const props of narrowRows) {
      const row = narrowRowOf(props);
      for (const [width, inset] of narrowWidths) {
        const { band, words } = narrowLayout(row, width, inset);
        const where = `${props.body} row at ${width} px`;
        // Each sunset and sunrise names its event and its date ("Earth rises 10 Jan", at the least "Rises 10 Jan"), and
        // the 0° line and a height have their words.
        for (const e of row.events) {
          const named = new RegExp(`${e.kind === 'set' ? 'sets' : 'rises'} ${e.date}$`, 'i');
          expect(words.some((w) => w.kind === 'event' && named.test(w.lines.join(' '))), `${where}: ${e.words} ${e.date}`).toBe(true);
        }
        if (row.scale.some((s) => s.deg === 0)) expect(words.some((w) => w.kind === 'scale' && /0°/.test(w.lines[0])), `${where}: the 0° line`).toBe(true);
        if (row.scale.some((s) => s.deg > 0)) expect(words.some((w) => w.kind === 'scale' && /up$/.test(w.lines[0])), `${where}: a height`).toBe(true);
        // Every stretch that has words on a wide chart has them here.
        expect(band?.names.length ?? 0, `${where}: names`).toBe(row.stretches.length);
        const dots = row.dots.map((d) => ({ x0: (d.pct / 100) * width - 7, x1: (d.pct / 100) * width + 7, y0: d.y - 7, y1: d.y + 7 }));
        words.forEach((w, i) => {
          expect(w.size, where).toBeGreaterThanOrEqual(14);
          expect(w.box.x0, `${where}: ${w.lines.join(' ')}`).toBeGreaterThanOrEqual(0);
          expect(w.box.x1, `${where}: ${w.lines.join(' ')}`).toBeLessThanOrEqual(width);
          for (const other of words.slice(i + 1)) expect(meet(w.box, other.box), `${where}: ${w.lines.join(' ')} and ${other.lines.join(' ')}`).toBe(false);
          for (const d of dots) expect(meet(w.box, d), `${where}: ${w.lines.join(' ')} and a marker`).toBe(false);
        });
        const named = [...(band?.title ? [band.title] : []), ...(band?.names ?? [])];
        named.forEach((n, i) => {
          expect(n.size, where).toBeGreaterThanOrEqual(14);
          expect(n.box.x0, `${where}: ${n.lines.join(' ')}`).toBeGreaterThanOrEqual(0);
          expect(n.box.x1, `${where}: ${n.lines.join(' ')}`).toBeLessThanOrEqual(width);
          for (const other of named.slice(i + 1)) expect(meet(n.box, other.box), `${where}: ${n.lines.join(' ')} and ${other.lines.join(' ')}`).toBe(false);
        });
      }
    }
  });

  it('puts each sunset’s and sunrise’s words by its own marker, in time order from left to right and never over or under another’s: beside it, or on a stem over or under it where there is no room beside it', () => {
    const meet = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    // Where two named markers stand almost together, the words of one may find no room by it at all: then they are
    // left out rather than put by the other.
    for (const props of [...narrowRows, blipRow]) {
      const row = narrowRowOf(props);
      for (const [width, inset] of narrowWidths) {
        const { words } = narrowLayout(row, width, inset);
        const events = words
          .filter((w) => w.kind === 'event')
          .map((w) => ({ w, m: markerOf(row, w.key, width) }))
          .sort((a, b) => a.m.x - b.m.x);
        events.forEach(({ w, m }, i) => {
          const name = `${props.body} row at ${width} px: ${w.lines.join(' ')}`;
          // Nearer its own marker than any other: 24 px or more short of every other one, or halfway to one nearer than
          // 48 px. And read left to right in their markers' order, each wholly before the next and 8 px or more from
          // it, so none stands over or under another's and no two run on as one.
          expect(w.box.x0, name).toBeGreaterThanOrEqual(m.from);
          expect(w.box.x1, name).toBeLessThanOrEqual(m.to);
          if (i + 1 < events.length) expect(w.box.x1 + 8, name).toBeLessThanOrEqual(events[i + 1].w.box.x0);
          if (!w.stem) {
            // Beside it: 12 px from it on one side, level with it or within 16 px above or below it.
            const at = (m.e.at / 100) * width;
            expect(Math.min(Math.abs(w.box.x0 - (at + 12)), Math.abs(w.box.x1 - (at - 12))), name).toBeLessThan(0.01);
            expect(Math.max(w.box.y0 - m.y, 0, m.y - w.box.y1), name).toBeLessThanOrEqual(16);
            return;
          }
          // Or over or under it, across it, on a stem from the marker to the words that crosses no other word or marker.
          expect(w.stem.at, name).toBe(m.pct);
          expect(w.box.x0, name).toBeLessThanOrEqual(m.x - 8);
          expect(w.box.x1, name).toBeGreaterThanOrEqual(m.x + 8);
          expect([w.stem.y0, w.stem.y1], name).toEqual(w.box.y1 <= m.y ? [w.box.y1, m.y - 7] : [m.y + 7, w.box.y0]);
          expect(w.stem.y1 - w.stem.y0, name).toBeGreaterThanOrEqual(6);
          const stem = { x0: m.x - 1, x1: m.x + 1, y0: w.stem.y0, y1: w.stem.y1 };
          for (const other of words) if (other !== w) expect(meet(stem, other.box), `${name} and ${other.lines.join(' ')}`).toBe(false);
          for (const d of row.dots) if (d.pct !== m.pct) expect(meet(stem, { x0: (d.pct / 100) * width - 7, x1: (d.pct / 100) * width + 7, y0: d.y - 7, y1: d.y + 7 }), `${name} and a marker`).toBe(false);
        });
      }
    }
  });

  it("reads the home page's markers in time order on a phone, each name by its own marker: the sunset's before the sunrise's, never over it", () => {
    for (const [props, said] of [[sunRow, ['Sun sets 3 Jan', 'Sun rises 20 Jan']], [earthRow, ['Earth rises 10 Jan', 'Earth sets 23 Jan']]] as const) {
      const row = narrowRowOf(props);
      const events = narrowLayout(row, 390, 16).words.filter((w) => w.kind === 'event').sort((a, b) => a.box.x0 - b.box.x0);
      // Left to right as their markers stand, the first wholly before the second, so neither is read as the other's.
      expect(events.map((w) => w.lines.join(' '))).toEqual(said);
      expect(events[0].box.x1).toBeLessThanOrEqual(events[1].box.x0);
      // Each 12 px from its own marker, or across it on a stem, and 24 px or more from the other one.
      const [a, b] = events.map((w) => markerOf(row, w.key, 390));
      const gap = (box: Box, x: number) => Math.max(box.x0 - x, 0, x - box.x1);
      expect(gap(events[0].box, a.x)).toBeLessThanOrEqual(12.5);
      expect(gap(events[1].box, b.x)).toBeLessThanOrEqual(12.5);
      expect(gap(events[0].box, b.x)).toBeGreaterThanOrEqual(24);
      expect(gap(events[1].box, a.x)).toBeGreaterThanOrEqual(24);
    }
  });

  it('draws the stem that ties a word to its marker where there is no room beside it, in the body’s colour, and none on a wide screen', () => {
    const { container } = render(<SkyRow {...short14Row} caption="c" />);
    const stems = [...container.querySelectorAll<HTMLElement>('[data-stem]')];
    // On a 220 px chart the Sun's markers on 7 and 12 January stand 31 px apart: the sunset's words have no room beside
    // their marker, so they stand over it, on a stem down to it.
    const shown = stems.filter((s) => shownAt(s, 220, 220));
    expect(shown.map((s) => s.style.left)).toEqual([`${(165 / 720) * 100}%`]);
    expect(shown[0].getAttribute('style')).toContain('var(--stage-sun)');
    expect(wordsAt(container, 220).some((w) => /sets 7 Jan$/i.test(w))).toBe(true);
    expect(stems.filter((s) => shownAt(s, 1216, 1440))).toEqual([]);
  });

  it("works out a word's width a little over IBM Plex Sans's own, as a browser measured it", () => {
    // Measured in Chromium at 16 px semibold, without the plate's 12 px: 133.5 px, 107.5 px and 215.6 px (at 17 px, 229.1 px).
    for (const [text, size, measured] of [['Earth rises 10 Jan', 16, 133.5], ['Sun sets 3 Jan', 16, 107.5], ['No contact for 9 days 3 hours', 16, 215.6], ['No contact for 9 days 3 hours', 17, 229.1]] as const) {
      expect(wordWidth(text, size)).toBeGreaterThan(measured + 12);
      expect(wordWidth(text, size)).toBeLessThan((measured + 12) * 1.08);
    }
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
