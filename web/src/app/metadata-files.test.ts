import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = (file: string) => path.resolve(process.cwd(), file);
const read = (file: string) => fs.readFileSync(here(file), 'utf8');
/** The value of one attribute on the first tag of that name, in an SVG or in the JSX that draws one. */
const attr = (source: string, tag: string, name: string) => new RegExp(`<${tag}\\b[^>]*?\\b${name}="([^"]*)"`).exec(source)?.[1];

describe('the tab icon', () => {
  const icon = read('src/app/icon.svg');

  it('is a 32 by 32 drawing of the header mark: Earth over the curved horizon', () => {
    const mark = read('src/components/BrandMark.tsx');
    expect(icon).toMatch(/viewBox="0 0 32 32"/);
    for (const [tag, name] of [['circle', 'cx'], ['circle', 'cy'], ['circle', 'r'], ['path', 'd']]) {
      expect(attr(icon, tag, name), `${tag} ${name}`).toBeTruthy();
      expect(attr(icon, tag, name), `${tag} ${name}`).toBe(attr(mark, tag, name));
    }
  });

  it('sits on the near-black of the immersive plates, in the dark theme’s Earth blue and ink, with no gradient, glow, script or motion', () => {
    expect(attr(icon, 'rect', 'fill')).toBe('#060607');
    expect(attr(icon, 'circle', 'fill')).toBe('#6aa9ff');
    expect(attr(icon, 'path', 'stroke')).toBe('#f3f2ee');
    expect(icon).not.toMatch(/gradient|filter|<animate|<set\b|<script|<style/);
  });

  it('is joined by a favicon.ico with 16, 32 and 48 px frames, not the scaffold’s four, for the browsers that ask for /favicon.ico', () => {
    const ico = fs.readFileSync(here('src/app/favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + 16 * i] || 256);
    expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });
});

describe('the share image', () => {
  it('is the landed still as a JPEG under the 8 MB Open Graph limit, with its alt text beside it', () => {
    const image = fs.readFileSync(here('src/app/opengraph-image.jpg'));
    expect([...image.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(image.length).toBeLessThan(8 * 1024 * 1024);
    // Next reads the alt text as it stands, so a final newline would end up inside the tag.
    expect(read('src/app/opengraph-image.alt.txt')).toBe("Standing beside a lander at de Gerlache Rim 2 on the Moon's south pole, the Sun low over the hills");
  });
});

describe('public files', () => {
  it('holds none of the pictures create-next-app left behind', () => {
    for (const name of ['next', 'vercel', 'file', 'globe', 'window']) expect(fs.existsSync(here(`public/${name}.svg`)), `${name}.svg`).toBe(false);
  });
});
