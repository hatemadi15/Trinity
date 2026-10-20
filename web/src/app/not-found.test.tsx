// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NotFound from './not-found';

describe('not-found page', () => {
  it('says in one heading that there is no page at this address', () => {
    render(<NotFound />);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['There is no page at this address.']);
  });

  it('gives the way back in on one line: the home page, Choose a landing site and the forecast', () => {
    render(<NotFound />);
    const line = screen.getByRole('main').querySelector('p')!;
    expect(line.textContent).toBe('Go to the home page, open Choose a landing site, or see the forecast.');
    expect([...line.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['the home page', '/'],
      ['Choose a landing site', '/sites'],
      ['the forecast', '/explore'],
    ]);
    for (const a of line.querySelectorAll('a')) expect(a.className).toMatch(/(^| )underline( |$)/);
  });

  it('keeps the usual frame: the header with its sections, the page and the footer', () => {
    render(<NotFound />);
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('sets every word at 14 px or more and uses no faint grey', () => {
    render(<NotFound />);
    const main = screen.getByRole('main');
    expect(main.innerHTML).not.toMatch(/(?:^|[\s":])text-(?:xs|2xs)(?=[\s"])|text-\[(?:\d|1[0-3])px\]/);
    expect(main.querySelectorAll('.text-ink-3')).toHaveLength(0);
  });
});
