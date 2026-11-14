// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { BriefView } from './BriefView';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('the brief from its own address', () => {
  it('opens in a fresh browser on the site, the period and the settings its address names, and Back to Explore keeps them', async () => {
    window.history.replaceState({}, '', '/brief?site=haworth&start=2027-02-01&days=14&load=400&earthmin=2');
    const store = createExploreStore(fileLoaders());
    render(<BriefView store={store} narrate={async () => ({ reply: '', source: 'template' })} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Haworth'), { timeout: 20_000 });
    expect(store.getState().days).toBe(14);
    expect(screen.getByRole('heading', { name: 'The lander' }).nextElementSibling!.textContent).toMatch(/uses 400 W.*clears the hills by at least 2°/);
    expect(screen.getByRole('link', { name: 'Back to Explore' }).getAttribute('href')).toBe('/explore?site=haworth&start=2027-02-01&days=14&load=400&earthmin=2');
  });
});
