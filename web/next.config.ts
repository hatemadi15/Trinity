import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

/** The app's version from package.json (Next builds from the folder that holds it), for the brief and the exported files. */
function appVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }).version ?? '';
  } catch {
    return '';
  }
}

/**
 * The commit the build is made from, for the brief and the exported files: Vercel names it; a local build asks git, and
 * adds "-dirty" when tracked files had changes; without either it stays empty and the brief says it is a development build.
 */
function gitCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  try {
    const run = (cmd: string) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const sha = run('git rev-parse --short=12 HEAD');
    return run('git status --porcelain --untracked-files=no') === '' ? sha : `${sha}-dirty`;
  } catch {
    return '';
  }
}

/**
 * Data files keep their names when the pipeline regenerates them, so a browser must check them again
 * on every load (a 304 when unchanged); a year of immutable caching kept an old terrain manifest after
 * the terrain was rebuilt. Hosted data on R2 keeps a year's caching, so each changed data run is
 * published under a new prefix (docs/hosting.md).
 */
const REVALIDATE = 'public, max-age=0, must-revalidate';

const nextConfig: NextConfig = {
  // Stamped at build time: share/versions.ts reads them, and the brief and the files name the build they came from.
  env: { NEXT_PUBLIC_APP_VERSION: appVersion(), NEXT_PUBLIC_GIT_COMMIT: gitCommit() },
  async headers() {
    return [
      // Local serving of web/public/data (npm start, the venue laptop).
      { source: '/data/:path*', headers: [{ key: 'Cache-Control', value: REVALIDATE }] },
    ];
  },
};

export default nextConfig;
