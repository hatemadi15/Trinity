// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MARKER_GROUPS } from '@/components/sites/SiteMap';
import { SitesView } from '@/components/sites/SitesView';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { nameableSites, rankSites } from './site-rank';

afterEach(cleanup);

describe('the assistant’s ranking of the catalogue', () => {
  it('is the order the site list shows, group by group, for the same dates and lander', async () => {
    const store = createExploreStore(fileLoaders());
    render(<SitesView store={store} />);
    await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
    await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(34), { timeout: 20_000 });
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    const s = store.getState();
    const ranked = rankSites(s.sites, s.overview).map((x) => x.id);
    expect(ranked).toHaveLength(34);
    let rows = 0;
    for (const g of MARKER_GROUPS) {
      const shown = [...screen.getByRole('region', { name: g.name }).querySelectorAll<HTMLElement>('a[data-row]')].map((a) => a.dataset.row!);
      rows += shown.length;
      // The list sorts within its groups; the assistant's ranking, kept to one group, is that group's order.
      expect(ranked.filter((id) => shown.includes(id)), g.name).toEqual(shown);
    }
    expect(rows).toBe(34);
    // The sites the assistant may name best are among the list's, in its order, with complete terrain and power.
    const named = nameableSites(s.sites, s.overview, s.params.mastM).map((x) => x.id);
    expect(named.length).toBeGreaterThan(3);
    expect(ranked.filter((id) => named.includes(id))).toEqual(named);
    for (const id of named) {
      expect(s.overview[id]!.terrain?.quality, id).not.toBe('incomplete');
      expect(s.overview[id]!.best, id).not.toBeNull();
    }
    expect(within(screen.getByRole('region', { name: MARKER_GROUPS[0].name })).getAllByRole('link').length).toBeGreaterThan(0);
  }, 45_000);
});
