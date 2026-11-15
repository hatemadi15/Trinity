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

const THEMED = ['--page', '--band', '--surface', '--surface-2', '--line', '--line-strong', '--ink', '--ink-2', '--ink-3', '--primary', '--primary-on', '--primary-hover', '--accent', '--accent-ink', '--glow', '--glow-strength', '--sun', '--sun-ink', '--sun-hover', '--earth', '--earth-ink', '--good', '--good-bg', '--good-line', '--bad', '--bad-bg', '--bad-line', '--warn', '--stage-edge'];
const FIXED = ['--stage-band', '--stage-raised', '--stage-raised-line', '--stage', '--stage-ink', '--stage-ink-2', '--stage-line', '--stage-sun', '--stage-earth', '--hill', '--hill-edge'];
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

  it('matches the approved Moonstone values (spec 23): a paper page and a deep blue-grey one, black and white ink, a black stage and one blue', () => {
    expect(light['--page']).toBe('#eeede9');
    expect(dark['--page']).toBe('#0f141c');
    expect(dark['--band']).toBe('#151b26');
    expect(dark['--surface']).toBe('#19202b');
    expect(dark['--surface-2']).toBe('#232c39');
    expect(light['--surface']).toBe('#ffffff');
    expect(light['--ink']).toBe('#0b0b0c');
    expect(dark['--ink']).toBe('#f5f5f3');
    expect(light['--stage']).toBe('#000000');
    expect(dark['--accent']).toBe('#7fa9ff');
    expect(dark['--earth']).toBe(dark['--accent']);
    expect(light['--earth']).toBe(light['--accent']);
    // The glow is the accent's own light, as an RGB triplet for rgb(var(--glow) / alpha).
    expect(dark['--glow']).toBe('127 169 255');
    // The home page's dark band is the dark page's tone in both themes.
    expect(light['--stage-band']).toBe(dark['--page']);
  });

  it('keeps ink and paper black and white, and the dark page and its plates a quiet blue-grey, never a colour (spec 23)', () => {
    for (const t of [light, dark]) {
      for (const k of ['--ink', '--ink-2', '--ink-3', '--primary', '--sun']) expect(chroma(t[k]), k).toBeLessThanOrEqual(0.07);
      expect(chroma(t['--accent'])).toBeGreaterThan(0.3);
    }
    for (const k of ['--page', '--band', '--surface', '--surface-2', '--line', '--line-strong', '--primary-on', '--stage-edge']) {
      expect(chroma(light[k]), `light ${k}`).toBeLessThanOrEqual(0.06);
      expect(chroma(dark[k]), `dark ${k}`).toBeLessThanOrEqual(0.12);
    }
    for (const k of ['--stage', '--stage-ink', '--stage-ink-2', '--stage-line', '--stage-sun', '--hill', '--hill-edge']) expect(chroma(light[k]), k).toBeLessThanOrEqual(0.06);
  });

  it('lifts the dark theme off black in four steps that can be told apart: page, band, plate, raised plate (15 November, owner review)', () => {
    const steps = ['--page', '--band', '--surface', '--surface-2'].map((k) => luminance(dark[k]));
    for (let i = 1; i < steps.length; i++) expect(steps[i], `step ${i}`).toBeGreaterThan(steps[i - 1]);
    // A plate against the page, and a raised plate against a plate: each a clear step, not a hair.
    expect(contrast(dark['--surface'], dark['--page'])).toBeGreaterThanOrEqual(1.12);
    expect(contrast(dark['--surface-2'], dark['--surface'])).toBeGreaterThanOrEqual(1.12);
    expect(contrast(dark['--surface-2'], dark['--page'])).toBeGreaterThanOrEqual(1.3);
    // The light theme has the same order the other way: plates lighter than the page, a band darker.
    expect(luminance(light['--band'])).toBeLessThan(luminance(light['--page']));
    expect(luminance(light['--surface'])).toBeGreaterThan(luminance(light['--page']));
    // A figure's panel on the home page's dark band, and its edge.
    expect(contrast(light['--stage-raised'], light['--stage-band'])).toBeGreaterThanOrEqual(1.12);
    expect(contrast(light['--stage-raised-line'], light['--stage-raised'])).toBeGreaterThanOrEqual(1.5);
    expect(css).toMatch(/\.band \{[^}]*background: var\(--band\)/);
  });

  it('gives the primary action 7:1 for its words on its fill, in both themes', () => {
    for (const t of [light, dark]) expect(contrast(t['--primary-on'], t['--primary'])).toBeGreaterThanOrEqual(7);
  });

  it('gives the dark values to anything inside .theme-dark in either theme, so the time bar under the black sky stays dark', () => {
    expect(block('.theme-dark')).toEqual(dark);
    expect(css).toMatch(/\.theme-dark \{[^}]*color-scheme: dark;/);
  });

  it('gives the light values to anything inside .theme-light in either theme, so the home page’s sections after the dark forecast stand on paper', () => {
    expect(block('.theme-light')).toEqual(block(':root'));
    expect(block('.theme-light')['--page']).toBe('#eeede9');
    // The dark block does not name it, so the dark theme leaves it on paper.
    expect(block('.theme-dark')).not.toHaveProperty('--page', block('.theme-light')['--page']);
  });

  it('makes the dark page a deep blue-grey, well off the stage’s true black, and gives a picture panel an edge that shows on both', () => {
    expect(luminance(dark['--page'])).toBeGreaterThan(0.005);
    expect(luminance(dark['--page'])).toBeLessThan(0.02);
    const page = parseInt(dark['--page'].slice(1), 16);
    expect(page & 255, 'blue over red').toBeGreaterThan((page >> 16) & 255);
    expect(contrast(dark['--page'], light['--stage'])).toBeGreaterThanOrEqual(1.1);
    expect(contrast(dark['--stage-edge'], dark['--page'])).toBeGreaterThanOrEqual(2);
    expect(contrast(dark['--stage-edge'], light['--stage'])).toBeGreaterThanOrEqual(2);
    expect(contrast(light['--stage-edge'], light['--stage'])).toBeGreaterThanOrEqual(1.5);
    expect(css).toMatch(/\.stage \{[^}]*border: 1px solid var\(--stage-edge\)/);
  });

  it('draws plates with a hairline that shows, and gives controls an edge of 3:1 on the dark page', () => {
    expect(contrast(dark['--line'], dark['--surface'])).toBeGreaterThanOrEqual(1.5);
    expect(contrast(dark['--line'], dark['--page'])).toBeGreaterThanOrEqual(1.5);
    expect(contrast(light['--line'], light['--surface'])).toBeGreaterThanOrEqual(1.5);
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
      for (const bg of ['--page', '--band', '--surface', '--surface-2']) {
        for (const fg of ['--ink', '--ink-2']) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(7);
        expect(contrast(t['--ink-3'], t[bg]), `${name} --ink-3 on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      const coloured: [string, string][] = [
        ['--sun-ink', '--surface'], ['--earth-ink', '--surface'], ['--good', '--surface'], ['--bad', '--surface'], ['--warn', '--surface'],
        ['--sun-ink', '--page'], ['--earth-ink', '--page'], ['--good', '--page'], ['--bad', '--page'],
        ['--good', '--surface-2'], ['--bad', '--surface-2'], ['--warn', '--surface-2'], ['--accent-ink', '--surface-2'], ['--accent-ink', '--band'],
      ];
      for (const [fg, bg] of coloured) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--accent-ink'], t['--page']), `${name} --accent-ink on --page`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--accent-ink'], t['--surface']), `${name} --accent-ink on --surface`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(light['--stage-ink'], light['--stage'])).toBeGreaterThanOrEqual(7);
    expect(contrast(light['--stage-ink-2'], light['--stage'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--stage-ink'], light['--hill'])).toBeGreaterThanOrEqual(4.5);
    // On the home page's dark band and a figure's panel on it, in both themes.
    for (const bg of ['--stage-band', '--stage-raised']) {
      expect(contrast(light['--stage-ink'], light[bg]), bg).toBeGreaterThanOrEqual(7);
      expect(contrast(light['--stage-ink-2'], light[bg]), bg).toBeGreaterThanOrEqual(7);
      for (const fg of ['--stage-earth', '--stage-good', '--stage-sun']) expect(contrast(light[fg], light[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
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

  it('sets every kind of type in the one face: no serif, pixel or monospace face is named anywhere (15 November, owner review)', () => {
    expect(css).not.toMatch(/Instrument|Pixelify|Plex Mono|--font-serif|--font-pixelify|--font-plex-mono|Georgia|monospace/);
    const families = [...css.matchAll(/(?:font-family|--font-(?:display|pixel|text|mono)): ([^;]+);/g)].map((m) => m[1]);
    expect(families.length).toBeGreaterThanOrEqual(8);
    expect(css).toMatch(/code,\s*kbd,\s*samp,\s*pre \{\s*font-family: inherit;/);
    for (const f of families) expect(f === 'inherit' || f === 'var(--font-text)' || f === 'var(--font-plex), "IBM Plex Sans", system-ui, sans-serif', f).toBe(true);
    for (const cls of ['display', 'pixel', 'eyebrow', 'mono']) expect(css, cls).toMatch(new RegExp(`\\.${cls} \\{[^}]*font-family: var\\(--font-plex\\)`));
  });

  it('sets titles semibold with a heading’s lines, and a stressed word upright in the accent, never in italics', () => {
    expect(css).toMatch(/\.display \{[^}]*font-weight: 600/);
    expect(css).toMatch(/\.display \{[^}]*font-synthesis: none/);
    const lh = Number(/\.display \{[^}]*line-height: ([\d.]+)/.exec(css)![1]);
    expect(lh).toBeGreaterThanOrEqual(1.15);
    expect(lh).toBeLessThanOrEqual(1.25);
    expect(css).toMatch(/\.display em,\s*\.display i \{\s*font-style: normal;\s*color: var\(--accent-ink\)/);
    expect(css).toMatch(/\[data-stage\] \.display em \{\s*color: var\(--stage-earth\)/);
    expect(css).not.toMatch(/font-style: italic/);
  });

  it('gives reading text open lines and the face’s own spacing, labels modest tracking, and figures one width', () => {
    expect(css).toMatch(/\nhtml \{[^}]*line-height: 1\.6;[^}]*letter-spacing: normal;[^}]*font-variant-numeric: tabular-nums/);
    expect(css).toMatch(/\.eyebrow \{[^}]*letter-spacing: 0\.06em;[^}]*text-transform: uppercase;[^}]*font-variant-numeric: tabular-nums/);
    expect(css).toMatch(/\.mono \{[^}]*font-variant-numeric: tabular-nums/);
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
