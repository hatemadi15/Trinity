import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../../next.config';
import { appVersion } from './versions';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the build stamp', () => {
  it("stamps the build with package.json's version and the commit it is built from", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).toBe(pkg.version);
    expect(nextConfig.env?.NEXT_PUBLIC_GIT_COMMIT).toMatch(/^[0-9a-f]{12}(-dirty)?$/);
  });

  it('reads the stamp back, and has none outside a build', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '0.1.0');
    vi.stubEnv('NEXT_PUBLIC_GIT_COMMIT', 'abc123def456');
    expect(appVersion()).toEqual({ version: '0.1.0', commit: 'abc123def456' });
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
    vi.stubEnv('NEXT_PUBLIC_GIT_COMMIT', '');
    expect(appVersion()).toEqual({ version: null, commit: null });
  });
});
