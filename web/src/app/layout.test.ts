import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8');

describe('root layout', () => {
  it('loads the display face with its width axis, which the 87.5 % headlines need', () => {
    expect(src).toMatch(/axes: \['opsz', 'wdth'\]/);
  });
});
