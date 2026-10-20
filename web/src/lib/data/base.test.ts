import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataBase, normalizeDataBase } from './base';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('data base', () => {
  it('reads an unset or empty base as /data', () => {
    expect(normalizeDataBase(undefined)).toBe('/data');
    expect(normalizeDataBase('')).toBe('/data');
    expect(normalizeDataBase('  ')).toBe('/data');
  });

  it('drops trailing slashes and spaces, so no URL gets a double slash', () => {
    expect(normalizeDataBase(' https://data.example/data/ ')).toBe('https://data.example/data');
    expect(normalizeDataBase('https://x/data//')).toBe('https://x/data');
    expect(normalizeDataBase('/data')).toBe('/data');
  });

  it('dataBase reads the environment through the same rule', () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_BASE', 'https://x/d/');
    expect(dataBase()).toBe('https://x/d');
    vi.stubEnv('NEXT_PUBLIC_DATA_BASE', '');
    expect(dataBase()).toBe('/data');
  });
});
