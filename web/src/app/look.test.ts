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

describe('the space look (spec 6)', () => {
  const all = sources();

  it('blurs nothing behind a plate', () => {
    for (const [file, text] of all) expect(text, file).not.toMatch(/backdrop-blur|backdrop-filter|filter:\s*blur/);
  });

  it('paints no gradients; the compass strip fades its ends with a mask and the radio band is striped, both kept', () => {
    const kept = new Map([
      ['src/components/stand/StandCanvas.tsx', 1],
      ['src/components/explore/TimeBar.tsx', 1],
    ]);
    for (const [file, text] of all) {
      const found = text.match(/bg-linear|bg-gradient|bg-radial|bg-conic|linear-gradient|radial-gradient|conic-gradient/g) ?? [];
      expect(found.length, file).toBe(kept.get(file) ?? 0);
    }
  });

  it('casts no glow or shadow on the page: the Sun’s glare and Earth’s air are drawn in the scenes', () => {
    // The stand view's star names and its hint keep a black halo for legibility over the sky: an outline, not a glow.
    for (const [file, text] of all) expect(text, file).not.toMatch(/\bshadow-(?:sm|md|lg|xl|2xl|inner|\[)|drop-shadow|box-shadow|text-shadow:(?!0_0_4px_#000\])/);
  });

  it('plays nothing by itself outside the arrival: no keyframes, no animation classes (spec 6)', () => {
    for (const [file, text] of all) {
      expect(text, file).not.toMatch(/@keyframes|\banimate-[a-z]|\breveal-(?:line|after)\b/);
    }
  });
});
