import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The build turns next/font/local's calls into the fonts' CSS. Outside the build the loader does not exist, so the layout is imported with a stand-in.
vi.mock('next/font/local', () => ({ default: (options: { variable: string }) => ({ variable: options.variable }) }));

const src = fs.readFileSync(path.resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8');
const PRODUCTION = 'https://earthrise.vercel.app';
const DEFAULT_TITLE = 'Earthrise: sunlight and signal forecast for the Moon';

/** The layout's metadata as a fresh import reads it: the address is read when the module loads, as Next inlines it when the module is built. */
async function metadataWith(siteUrl: string | undefined): Promise<Metadata> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', siteUrl);
  return (await import('./layout')).metadata;
}

/** The share image base as a URL; Next's type lets metadataBase be a string or a URL. */
const baseOf = (m: Metadata) => new URL(String(m.metadataBase));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('root layout', () => {
  it('loads the one face from a font file in the repository, with its licence, so a build needs no network', () => {
    expect(src).not.toMatch(/next\/font\/google/);
    expect(src).toMatch(/from 'next\/font\/local'/);
    const files = [...new Set([...src.matchAll(/'\.\/(fonts\/[\w-]+\.woff2)'/g)].map((m) => m[1]))];
    expect(files).toEqual(['fonts/IBMPlexSans-latin.woff2']);
    for (const file of files) {
      const bytes = fs.readFileSync(path.resolve(process.cwd(), 'src/app', file));
      expect(bytes.subarray(0, 4).toString('latin1'), file).toBe('wOF2');
    }
    expect(fs.readFileSync(path.resolve(process.cwd(), 'src/app/fonts/OFL-IBMPlexSans.txt'), 'utf8')).toMatch(/SIL Open Font License, Version 1\.1/);
    // No face is kept that nothing loads, and no licence for a face that is gone.
    expect(fs.readdirSync(path.resolve(process.cwd(), 'src/app/fonts')).sort()).toEqual(['IBMPlexSans-latin.woff2', 'OFL-IBMPlexSans.txt']);
  });

  it('loads one face for the whole site, IBM Plex Sans at three weights, and nothing else (spec 23, 15 November)', () => {
    expect(src.match(/localFont\(/g)).toHaveLength(1);
    expect(src).toMatch(/const plex = localFont\(\{[^;]*weight: '400'[^;]*weight: '500'[^;]*weight: '600'[^;]*variable: '--font-plex'/);
    expect(src).not.toMatch(/style: 'italic'/);
    expect(src).toMatch(/className=\{`\$\{plex\.variable\} h-full`\}/);
  });

  it('sets a share image base, the Open Graph card and a title template', async () => {
    const m = await metadataWith(undefined);
    expect(baseOf(m).href).toBe(`${PRODUCTION}/`);
    expect(m.openGraph).toMatchObject({ title: DEFAULT_TITLE, siteName: 'Earthrise', type: 'website' });
    expect(m.openGraph?.description).toBe(m.description);
    // The share image is the file next to the layout; the Twitter card asks for it large.
    expect(m.twitter).toMatchObject({ card: 'summary_large_image' });
    // Each route's title is added to the template: "Accuracy · Earthrise". The home page keeps the default.
    expect(m.title).toEqual({ default: DEFAULT_TITLE, template: '%s · Earthrise' });
  });

  it('takes the share image base from NEXT_PUBLIC_SITE_URL, so a preview or a custom domain links its own picture', async () => {
    expect(baseOf(await metadataWith('https://earthrise.example/')).origin).toBe('https://earthrise.example');
    expect(baseOf(await metadataWith(' http://localhost:3000 ')).origin).toBe('http://localhost:3000');
  });

  it('reads a blank or malformed address as the production one, so a slip in a hosting dashboard never fails the build', async () => {
    for (const bad of ['', '   ', 'earthrise.example', 'localhost:3000', 'not a url']) {
      expect(baseOf(await metadataWith(bad)).href, JSON.stringify(bad)).toBe(`${PRODUCTION}/`);
    }
  });
});
