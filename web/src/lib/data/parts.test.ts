import { describe, expect, it } from 'vitest';
import { DataError } from './loaders';
import { hasNo, missingPart, partFiles } from './parts';

describe('the optional parts of the data a page can miss', () => {
  it('knows a part from the file that was not there, wherever the data is served from', () => {
    expect(missingPart(new DataError('/data/tiles/manifest.json', 404))).toBe('tiles');
    expect(missingPart('could not load /data/terrain/manifest.json (HTTP 404)')).toBe('terrain');
    expect(missingPart('could not load https://data.example.org/data-2026-11-14/globe/manifest.json (HTTP 404)')).toBe('globe');
    expect(missingPart(new DataError('/data/sky/stars.json', 404))).toBe('sky');
  });

  it('leaves alone a file that failed for another reason, a file of no part, and anything else', () => {
    expect(missingPart(new DataError('/data/terrain/manifest.json', 503))).toBeNull();
    expect(missingPart(new DataError('/data/sites.json', 404))).toBeNull();
    expect(missingPart(new Error('WebGL 2 is not available'))).toBeNull();
    expect(missingPart(null)).toBeNull();
  });

  it('says what is missing in words that are true of a laptop and of the website alike', () => {
    expect(hasNo('tiles')).toBe('this copy of Earthrise has no height tiles');
    expect(hasNo('terrain')).toBe('this copy of Earthrise has no terrain files');
    expect(hasNo('globe')).toBe('this copy of Earthrise has no globe files');
    expect(partFiles('tiles')).toBe('height tiles');
  });
});
