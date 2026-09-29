import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasFile, readJson, REPO_ROOT, repoPath } from './helpers';

describe('test helpers', () => {
  it('resolves the repository root from web/', () => {
    expect(path.basename(REPO_ROOT)).not.toBe('web');
    expect(repoPath('pipeline', 'pyproject.toml')).toBe(path.join(REPO_ROOT, 'pipeline', 'pyproject.toml'));
    expect(hasFile('pipeline', 'pyproject.toml')).toBe(true);
    expect(hasFile('web', 'package.json')).toBe(true);
  });
  it('reads committed JSON artifacts', () => {
    const sites = readJson<{ version: number; sites: { id: string }[] }>('data', 'sites.json');
    expect(sites.version).toBe(1);
    expect(sites.sites.map((s) => s.id)).toContain('shackleton_center');
  });
});
