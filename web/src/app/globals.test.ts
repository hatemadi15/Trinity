import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** The glass panels must sit in the components layer: Tailwind's utilities layer comes after it, so a colour utility such as border-sun/40 can still win. */
describe('globals.css layering', () => {
  it('declares glass and glass-bar inside @layer components, not as utilities', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).not.toMatch(/@utility glass/);
    const components = css.match(/@layer components \{([\s\S]*?)\n\}/g) ?? [];
    const joined = components.join('\n');
    expect(joined).toMatch(/\.glass \{/);
    expect(joined).toMatch(/\.glass-bar \{/);
  });
});
