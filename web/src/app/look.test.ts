import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every source under web/src (components, pages, styles), tests left out, with its path from web/. */
function sources(dir = path.resolve(process.cwd(), 'src')): [string, string][] {
  const out: [string, string][] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.(tsx|ts|css)$/.test(e.name) && !/\.test\./.test(e.name)) out.push([path.relative(process.cwd(), p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')]);
  }
  return out;
}

describe('the Moonstone look (spec 23, after spec 6)', () => {
  const all = sources();
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

  it('blurs nothing behind a plate: a backdrop blur over the live scenes would cost every frame', () => {
    for (const [file, text] of all) expect(text, file).not.toMatch(/backdrop-blur|backdrop-filter/);
  });

  it('glows only in the accent’s own light: every glow on the page is the accent’s RGB, a blue or white of the palette', () => {
    // Shadows and halos written as utilities name rgb(var(--glow)...) or one of the palette's own blues and whites.
    const allowed = /rgb\(var\(--glow\)|rgba?\((?:127,\s*169,\s*255|243,\s*239,\s*228|255,\s*255,\s*255|235_232_223|0,\s*0,\s*0)|#7fa9ff|#f3efe4|#000/;
    for (const [file, text] of all) {
      for (const m of text.matchAll(/shadow-\[([^\]]+)\]/g)) expect(m[1], `${file}: ${m[0]}`).toMatch(allowed);
    }
  });

  it('defines its motion once, in globals.css, and every keyframe is stopped under reduced motion', () => {
    for (const [file, text] of all) if (file !== 'src/app/globals.css') expect(text, file).not.toMatch(/@keyframes/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\* \{[^}]*animation: none !important/);
    // Every animation a component names is one globals.css defines.
    const defined = new Set([...css.matchAll(/@keyframes ([a-z-]+)/g)].map((m) => m[1]));
    for (const [file, text] of all) {
      for (const m of text.matchAll(/animate-\[([a-z-]+)_/g)) expect(defined.has(m[1]), `${file}: ${m[1]}`).toBe(true);
    }
  });
});
