import { describe, expect, it } from 'vitest';
import { addressFor } from './useAddressFollows';

describe('addressFor', () => {
  it("writes the page's own address, keeps the view's switches and the place on the page, and drops a setting the page no longer has", () => {
    expect(addressFor('/explore?site=haworth&start=2027-01-01&days=30', '?site=haworth&mast=5&demo=1&theme=dark', '#ask')).toBe('/explore?site=haworth&start=2027-01-01&days=30&demo=1&theme=dark#ask');
    expect(addressFor('/explore?site=haworth&start=2027-01-01&days=30&load=400', '', '')).toBe('/explore?site=haworth&start=2027-01-01&days=30&load=400');
  });
});
