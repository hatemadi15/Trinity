import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Custom properties declared in the first top-level block whose selector list names `selector`. */
function block(selector: string): Record<string, string> {
  for (const [, selectors, body] of css.matchAll(/^([^\s@/{}][^{}]*)\{([^{}]*)\n\}/gm)) {
    if (!selectors.split(',').some((s) => s.trim() === selector)) continue;
    const out: Record<string, string> = {};
    for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  }
  throw new Error(`no block for ${selector}`);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMED = ['--page', '--surface', '--surface-2', '--line', '--line-strong', '--ink', '--ink-2', '--ink-3', '--sun', '--sun-ink', '--sun-hover', '--earth', '--earth-ink', '--good', '--good-bg', '--good-line', '--bad', '--bad-bg', '--bad-line', '--warn', '--stage-edge'];
const FIXED = ['--sun-on', '--stage', '--stage-ink', '--stage-ink-2', '--stage-line', '--stage-sun', '--stage-earth', '--hill', '--hill-edge'];

describe('theme tokens', () => {
  const light = block(':root');
  const dark = block(':root[data-theme="dark"]');

  it('defines every themed token in both themes and the fixed stage tokens once', () => {
    for (const t of THEMED) {
      expect(light[t], `light ${t}`).toBeTruthy();
      expect(dark[t], `dark ${t}`).toBeTruthy();
    }
    for (const t of FIXED) expect(light[t], t).toBeTruthy();
  });

  it('matches the approved values for the page, ink, the stage and the two identity colours', () => {
    expect(light['--page']).toBe('#dedcd6');
    expect(dark['--page']).toBe('#222220');
    expect(light['--surface']).toBe('#ffffff');
    expect(light['--ink']).toBe('#000000');
    expect(dark['--ink']).toBe('#f3f2ee');
    expect(light['--stage']).toBe('#000000');
    expect(light['--sun']).toBe('#f2b134');
    expect(dark['--earth']).toBe('#6aa9ff');
  });

  it('gives the dark values to anything inside .theme-dark in either theme, so the time bar under the black sky stays dark', () => {
    expect(block('.theme-dark')).toEqual(dark);
    expect(css).toMatch(/\.theme-dark \{[^}]*color-scheme: dark;/);
  });

  it('keeps the stage darker than the dark page and gives it an edge that shows on both, so a picture panel never melts into the page', () => {
    expect(contrast(dark['--page'], light['--stage'])).toBeGreaterThanOrEqual(1.3);
    expect(contrast(dark['--stage-edge'], dark['--page'])).toBeGreaterThanOrEqual(2);
    expect(contrast(dark['--stage-edge'], light['--stage'])).toBeGreaterThanOrEqual(2);
    expect(contrast(light['--stage-edge'], light['--stage'])).toBeGreaterThanOrEqual(1.5);
    expect(css).toMatch(/\.stage \{[^}]*border: 1px solid var\(--stage-edge\)/);
  });

  it('draws the focus ring in the bright gold on a picture panel, where the dark gold of the light theme would vanish', () => {
    expect(contrast(light['--sun-ink'], light['--stage'])).toBeLessThan(3);
    expect(contrast(light['--stage-sun'], light['--stage'])).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/\.stage :focus-visible,\s*\[data-stage\] :focus-visible \{[^}]*outline-color: var\(--stage-sun\)/);
  });

  it('meets AA contrast for text in both themes and on the stage', () => {
    for (const [name, t] of [['light', light], ['dark', dark]] as const) {
      const pairs: [string, string][] = [
        ['--ink', '--page'], ['--ink', '--surface'], ['--ink-2', '--surface'], ['--ink-2', '--page'], ['--ink-3', '--surface'], ['--ink-3', '--page'],
        ['--sun-ink', '--surface'], ['--earth-ink', '--surface'], ['--good', '--surface'], ['--bad', '--surface'], ['--warn', '--surface'],
        ['--sun-ink', '--page'], ['--earth-ink', '--page'], ['--good', '--page'], ['--bad', '--page'],
      ];
      for (const [fg, bg] of pairs) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light['--sun-on'], t['--sun']), `${name} text on the Sun fill`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(light['--stage-ink'], light['--stage'])).toBeGreaterThanOrEqual(7);
    expect(contrast(light['--stage-ink-2'], light['--stage'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--stage-ink'], light['--hill'])).toBeGreaterThanOrEqual(4.5);
  });

  it('has none of the old token names left, now the last old component is gone', () => {
    for (const name of ['--canvas', '--panel', '--sky', '--night', '--sun-bright', '--terrain', '--terrain-edge']) expect(light[name], name).toBeUndefined();
    expect(css).not.toMatch(/\.glass/);
  });
});

describe('globals.css layering', () => {
  it('declares the shared classes inside @layer components, so a Tailwind utility can still override them', () => {
    expect(css).not.toMatch(/@utility glass/);
    const joined = (css.match(/@layer components \{([\s\S]*?)\n\}/g) ?? []).join('\n');
    for (const cls of ['.wrap', '.btn', '.btn-primary', '.btn-ink', '.btn-sm', '.field', '.panel', '.stage', '.display', '.reveal-line', '.reveal-after']) {
      expect(joined, cls).toMatch(new RegExp(`\\${cls} \\{`));
    }
  });

  it('gives buttons and fields the minimum sizes of the spec', () => {
    expect(css).toMatch(/\.btn \{[^}]*height: 48px/);
    expect(css).toMatch(/\.btn-sm \{[^}]*height: 44px/);
    expect(css).toMatch(/\.field \{[^}]*height: 52px/);
  });

  it('centres a chart label with auto margins, so one too wide for its room spills away from the near edge in either direction', () => {
    // `justify-content: safe center` falls back to the writing-mode start, which pushed labels near the right edge out of the chart.
    expect(css).toMatch(/\.label-centred > \* \{[^}]*margin-inline: auto/);
    expect(css).not.toMatch(/safe center/);
  });

  it('gives pictures, panels and controls their own radii', () => {
    expect(css).toMatch(/\.stage \{[^}]*border-radius: 6px/);
    expect(css).toMatch(/\.panel \{[^}]*border-radius: 8px/);
    expect(css).toMatch(/\.btn \{[^}]*border-radius: 8px/);
    expect(css).toMatch(/\.field \{[^}]*border-radius: 8px/);
  });

  it('sets display type at 87.5 % width and weight 700, without tightening the letters further', () => {
    expect(css).toMatch(/\.display \{[^}]*font-stretch: 87\.5%/);
    expect(css).toMatch(/\.display \{[^}]*font-weight: 700/);
    expect(css).toMatch(/\.display \{[^}]*letter-spacing: 0;/);
  });

  it('declares the one page-load motion and switches every animation off under reduced motion', () => {
    expect(css).toMatch(/\.reveal-line \{[^}]*animation: reveal-wipe/);
    expect(css).toMatch(/\.reveal-after \{[^}]*animation: reveal-show/);
    expect(css).toMatch(/@keyframes reveal-wipe/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\* \{[^}]*animation: none !important/);
  });
});
