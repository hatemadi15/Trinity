import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Custom properties declared in the first block that starts with `selector {`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
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

const THEMED = ['--page', '--surface', '--surface-2', '--line', '--line-strong', '--ink', '--ink-2', '--ink-3', '--sun', '--sun-ink', '--sun-hover', '--earth', '--earth-ink', '--good', '--good-bg', '--good-line', '--bad', '--bad-bg', '--bad-line', '--warn'];
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

  it('matches the approved values for the page, ink and the two identity colours', () => {
    expect(light['--page']).toBe('#f3f2ee');
    expect(dark['--page']).toBe('#0b0d11');
    expect(light['--ink']).toBe('#15181d');
    expect(dark['--ink']).toBe('#f4f1ea');
    expect(light['--sun']).toBe('#f2b134');
    expect(dark['--earth']).toBe('#6aa9ff');
  });

  it('meets AA contrast for text in both themes and on the stage', () => {
    for (const [name, t] of [['light', light], ['dark', dark]] as const) {
      const pairs: [string, string][] = [
        ['--ink', '--page'], ['--ink', '--surface'], ['--ink-2', '--surface'], ['--ink-2', '--page'], ['--ink-3', '--surface'], ['--ink-3', '--page'],
        ['--sun-ink', '--surface'], ['--earth-ink', '--surface'], ['--good', '--surface'], ['--bad', '--surface'], ['--warn', '--surface'],
      ];
      for (const [fg, bg] of pairs) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light['--sun-on'], t['--sun']), `${name} text on the Sun fill`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(light['--stage-ink'], light['--stage'])).toBeGreaterThanOrEqual(7);
    expect(contrast(light['--stage-ink-2'], light['--stage'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--stage-ink'], light['--hill'])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the old token names as aliases until the last old component is gone', () => {
    expect(light['--canvas']).toBe('var(--page)');
    expect(light['--panel']).toBe('var(--surface)');
    expect(light['--sky']).toBe('var(--stage)');
  });
});

describe('globals.css layering', () => {
  it('declares the shared classes inside @layer components, so a Tailwind utility can still override them', () => {
    expect(css).not.toMatch(/@utility glass/);
    const joined = (css.match(/@layer components \{([\s\S]*?)\n\}/g) ?? []).join('\n');
    for (const cls of ['.wrap', '.btn', '.btn-primary', '.btn-ink', '.btn-sm', '.field', '.panel', '.stage', '.glass', '.glass-bar']) {
      expect(joined, cls).toMatch(new RegExp(`\\${cls} \\{`));
    }
  });

  it('gives buttons and fields the minimum sizes of the spec', () => {
    expect(css).toMatch(/\.btn \{[^}]*height: 48px/);
    expect(css).toMatch(/\.btn-sm \{[^}]*height: 44px/);
    expect(css).toMatch(/\.field \{[^}]*height: 52px/);
  });
});
