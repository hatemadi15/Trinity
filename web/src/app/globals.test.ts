import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Custom properties declared in the first block whose selector list names `selector`, at the top level or in an at-rule. */
function block(selector: string): Record<string, string> {
  for (const [, selectors, body] of css.matchAll(/^[ \t]*([^\s@/{}*][^{}]*)\{([^{}]*)\n[ \t]*\}/gm)) {
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

const THEMED = ['--page', '--surface', '--surface-2', '--line', '--line-strong', '--ink', '--ink-2', '--ink-3', '--primary', '--primary-on', '--primary-hover', '--accent', '--accent-ink', '--glow', '--glow-strength', '--sun', '--sun-ink', '--sun-hover', '--earth', '--earth-ink', '--good', '--good-bg', '--good-line', '--bad', '--bad-bg', '--bad-line', '--warn', '--stage-edge'];
const FIXED = ['--stage', '--stage-ink', '--stage-ink-2', '--stage-line', '--stage-sun', '--stage-earth', '--hill', '--hill-edge'];
/** A hex colour's hue saturation: 0 for a grey, so "black and white" can be checked. */
function chroma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (Math.max(...ch) - Math.min(...ch)) / 255;
}

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

  it('matches the approved Moonstone values (spec 23): paper and near-black pages, black and white ink, a black stage and one blue', () => {
    expect(light['--page']).toBe('#eeede9');
    expect(dark['--page']).toBe('#050506');
    expect(dark['--surface']).toBe('#0c0d10');
    expect(dark['--surface-2']).toBe('#15171b');
    expect(light['--surface']).toBe('#ffffff');
    expect(light['--ink']).toBe('#0b0b0c');
    expect(dark['--ink']).toBe('#f5f5f3');
    expect(light['--stage']).toBe('#000000');
    expect(dark['--accent']).toBe('#7fa9ff');
    expect(dark['--earth']).toBe(dark['--accent']);
    expect(light['--earth']).toBe(light['--accent']);
    // The glow is the accent's own light, as an RGB triplet for rgb(var(--glow) / alpha).
    expect(dark['--glow']).toBe('127 169 255');
  });

  it('keeps everything but the accent and the power verdict black and white, in both themes (spec 23)', () => {
    for (const t of [light, dark]) {
      for (const k of ['--page', '--surface', '--surface-2', '--line', '--line-strong', '--ink', '--ink-2', '--ink-3', '--primary', '--primary-on', '--sun', '--stage-edge']) expect(chroma(t[k]), k).toBeLessThanOrEqual(0.06);
      expect(chroma(t['--accent'])).toBeGreaterThan(0.3);
    }
    for (const k of ['--stage', '--stage-ink', '--stage-ink-2', '--stage-line', '--stage-sun', '--hill', '--hill-edge']) expect(chroma(light[k]), k).toBeLessThanOrEqual(0.06);
  });

  it('gives the primary action 7:1 for its words on its fill, in both themes', () => {
    for (const t of [light, dark]) expect(contrast(t['--primary-on'], t['--primary'])).toBeGreaterThanOrEqual(7);
  });

  it('gives the dark values to anything inside .theme-dark in either theme, so the time bar under the black sky stays dark', () => {
    expect(block('.theme-dark')).toEqual(dark);
    expect(css).toMatch(/\.theme-dark \{[^}]*color-scheme: dark;/);
  });

  it('makes the dark page near-black but not the stage’s true black, and gives a picture panel an edge that shows on both (spec 6)', () => {
    expect(luminance(dark['--page'])).toBeLessThan(0.005);
    expect(dark['--page']).not.toBe(light['--stage']);
    expect(contrast(dark['--stage-edge'], dark['--page'])).toBeGreaterThanOrEqual(2);
    expect(contrast(dark['--stage-edge'], light['--stage'])).toBeGreaterThanOrEqual(2);
    expect(contrast(light['--stage-edge'], light['--stage'])).toBeGreaterThanOrEqual(1.5);
    expect(css).toMatch(/\.stage \{[^}]*border: 1px solid var\(--stage-edge\)/);
  });

  it('draws plates with a hairline that shows, and gives controls an edge of 3:1 on the dark page', () => {
    expect(contrast(dark['--line'], dark['--surface'])).toBeGreaterThanOrEqual(1.3);
    expect(contrast(light['--line'], light['--surface'])).toBeGreaterThanOrEqual(1.3);
    expect(contrast(dark['--line-strong'], dark['--surface'])).toBeGreaterThanOrEqual(3);
    expect(contrast(dark['--line-strong'], dark['--page'])).toBeGreaterThanOrEqual(3);
  });

  it('draws the focus ring in the accent, and the bright blue on a picture panel, where the deep blue of the light theme would fade', () => {
    expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--accent\)/);
    expect(contrast(light['--stage-earth'], light['--stage'])).toBeGreaterThanOrEqual(3);
    expect(contrast(dark['--accent'], dark['--page'])).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/\.stage :focus-visible,\s*\[data-stage\] :focus-visible \{[^}]*outline-color: var\(--stage-earth\)/);
  });

  it('gives body text 7:1 and secondary text 4.5:1 on the page and its plates, in both themes (spec 6)', () => {
    for (const [name, t] of [['light', light], ['dark', dark]] as const) {
      for (const bg of ['--page', '--surface', '--surface-2']) {
        for (const fg of ['--ink', '--ink-2']) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(7);
        expect(contrast(t['--ink-3'], t[bg]), `${name} --ink-3 on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      const coloured: [string, string][] = [
        ['--sun-ink', '--surface'], ['--earth-ink', '--surface'], ['--good', '--surface'], ['--bad', '--surface'], ['--warn', '--surface'],
        ['--sun-ink', '--page'], ['--earth-ink', '--page'], ['--good', '--page'], ['--bad', '--page'],
      ];
      for (const [fg, bg] of coloured) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--accent-ink'], t['--page']), `${name} --accent-ink on --page`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--accent-ink'], t['--surface']), `${name} --accent-ink on --surface`).toBeGreaterThanOrEqual(4.5);
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
    for (const cls of ['.wrap', '.btn', '.btn-primary', '.btn-ink', '.btn-sm', '.field', '.panel', '.stage', '.display']) {
      expect(joined, cls).toMatch(new RegExp(`\\${cls} \\{`));
    }
  });

  it('prints every page in the light theme, whatever the theme on screen: paper is white (final review)', () => {
    // The dark values hold on screen only, so a page printed from the dark theme (the default) takes the light
    // theme's dark ink, not pale grey on white.
    expect(css).toMatch(/@media screen \{\s*:root\[data-theme="dark"\],\s*\.theme-dark \{/);
    expect(css.match(/:root\[data-theme="dark"\],\s*\.theme-dark \{/g)).toHaveLength(1);
  });

  it('shows the stars behind the header band in the dark theme only, and never prints them', () => {
    expect(css).toMatch(/:root:not\(\[data-theme="dark"\]\) \.star-band \{\s*display: none;/);
    expect(css).toMatch(/@media print \{[\s\S]*\.star-band \{ display: none !important; \}/);
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

  it('sets display type in the serif at its one weight, never thickened by the browser (spec 23)', () => {
    expect(css).toMatch(/\.display \{[^}]*font-family: var\(--font-serif\)/);
    expect(css).toMatch(/\.display \{[^}]*font-weight: 400/);
    expect(css).toMatch(/\.display \{[^}]*font-synthesis: none/);
  });

  it('switches every animation and transition off under reduced motion, and shows what Reveal would bring in', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\* \{[^}]*transition: none !important;[^}]*animation: none !important/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*\[data-reveal="hidden"\] \{\s*opacity: 1;/);
  });

  it('opens a new theme as a circle where view transitions exist, and cross-fades its colours where they do not', () => {
    expect(css).toMatch(/::view-transition-old\(root\),\s*::view-transition-new\(root\) \{\s*animation: none;/);
    expect(css).toMatch(/:root\.theme-fading,\s*:root\.theme-fading \* \{\s*transition:/);
  });
});
