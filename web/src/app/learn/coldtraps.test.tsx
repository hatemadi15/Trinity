// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ColdTrapDoc } from '@/lib/coldtraps/coldtraps';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { COLD_TRAPS } from '@/lib/learn/coldtraps';
import LearnPage from './page';

const doc = readJson<ColdTrapDoc>('data', 'coldtraps', 'coldtraps.json');

describe('How it works: cold traps', () => {
  it('explains cold traps under their own heading, where Explore’s "What a cold trap is" lands', () => {
    render(<LearnPage />);
    const section = screen.getByRole('region', { name: 'Cold traps: where ice could last' });
    expect(section.id).toBe('cold-traps');
    expect(within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Why cold traps matter', 'What Earthrise shows', 'What this does not establish', 'How to find out what is there']);
    expect(section.textContent).toMatch(/colder than 110\sK \(−163\s°C\) all year/);
    expect(section.textContent).toMatch(/not a finding that any is there, how much or how deep/);
    // Before the offline section and the steps, which keep the page's one gold way in at the end.
    const offline = screen.getByRole('region', { name: 'Running it offline' });
    expect(section.compareDocumentPosition(offline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says ice only as conditions where it could last, and claims no chance or finding', () => {
    for (const x of COLD_TRAPS) {
      const text = `${x.title}. ${x.body}`;
      expect(text, text).not.toMatch(/probab|likel|detected|confirm|discover/i);
      for (const m of text.matchAll(/\bice\b/gi)) expect(text.slice(m.index, m.index + 14), text).toBe('ice could last');
    }
  });

  it('counts the sites whose permanent shadow within 5 km is nowhere cold enough from the committed layer', () => {
    const covered = doc.sites.filter((s) => s.covered);
    const warmShadow = covered.filter((s) => s.within_km!['5'].psr_km2 > 0 && s.within_km!['5'].below_110K_km2 === 0).length;
    const said = COLD_TRAPS.map((x) => x.body).join(' ');
    expect(said).toContain(`at ${warmShadow} of the ${covered.length} sites none of the permanently shadowed ground within 5 km is cold enough in the model`);
  });
});
