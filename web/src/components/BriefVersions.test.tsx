// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VersionsClient } from '@/lib/ensemble/client';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { NO_REQUIREMENTS } from '@/lib/plan/requirements';
import { DEFAULT_PARAMS, recompute } from '@/lib/store/explore';
import { eph, sites } from '@/test/file-loaders';
import { BriefVersions } from './BriefVersions';

const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
const r = recompute(eph, site, mask, '2027-01-01T00:00:00', 30);
const load = async () => ({ siteId: site.id, mastM: 2, adjusted: mask, masks: [mask.map((v) => v + 0.1), mask, mask.map((v) => v - 0.1)] });

describe('BriefVersions', () => {
  it('prints the landing over every version of the ground under its own heading, in full', async () => {
    render(<BriefVersions site={site} series={r.series} params={DEFAULT_PARAMS} requirements={NO_REQUIREMENTS} mastM={2} startUtc="2027-01-01T00:00:00" days={30} deps={{ load, runner: new VersionsClient() }} />);
    expect(screen.getByRole('heading', { name: 'Across terrain versions' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/^Working out/);
    await waitFor(() => expect(screen.getByText(/versions of the ground/)).toBeTruthy());
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.split(':')[0])).toEqual(['Time with power', 'First sunset', 'Longest night', 'Contact with Earth while powered']);
  });

  it('prints nothing on a flat horizon far from the pole', () => {
    const flat = { ...site, id: 'apollo_11', polar: false, category: 'apollo' };
    const { container } = render(<BriefVersions site={flat} series={r.series} params={DEFAULT_PARAMS} requirements={NO_REQUIREMENTS} mastM={2} startUtc="2027-01-01T00:00:00" days={30} deps={{ load, runner: new VersionsClient() }} />);
    expect(container.textContent).toBe('');
  });
});
