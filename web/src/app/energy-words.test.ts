import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every source under web/src, tests left out, with its path from web/. */
function sources(dir = path.resolve(process.cwd(), 'src')): [string, string][] {
  const out: [string, string][] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.(tsx|ts|json)$/.test(e.name) && !/\.test\./.test(e.name)) out.push([path.relative(process.cwd(), p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')]);
  }
  return out;
}

/** Words that would have the forecast vouch for the lander itself: it counts electrical energy only. */
const OVERCLAIMS: RegExp[] = [
  /battery survives the night/i,
  /whether a lander lives\b/i,
  /lander lives through each night/i,
  /\bguarantee[sd]?\b/i,
  /\bsafely through\b/i,
  /\bThe lander is back on\b/,
];

describe('energy, not survival (review P1: power-model scope)', () => {
  it('never says the lander or its battery survives, lives or is guaranteed: the figures count electrical energy only', () => {
    for (const [file, text] of sources()) for (const re of OVERCLAIMS) expect(re.test(text), `${file}: ${re}`).toBe(false);
  });
});
