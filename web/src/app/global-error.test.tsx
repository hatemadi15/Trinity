// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlobalError from './global-error';

const DETAIL = 'Cannot read properties of undefined (reading "variable")';
const crash = Object.assign(new Error(DETAIL), { digest: 'd1g3st-7788' });

afterEach(() => {
  vi.restoreAllMocks();
});

/** A crash in the root layout replaces the whole document, so the page is rendered into the document itself. */
function show(retry = vi.fn()) {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<GlobalError error={crash} retry={retry} />, { container: document });
  return { retry, log };
}

describe('global error page', () => {
  it('carries its own document, in the dark theme, and says in plain words that something went wrong', () => {
    show();
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Something went wrong.']);
    expect(screen.getByRole('main').querySelector('p')!.textContent).toBe('Reload the page, or try again.');
    expect(document.title).toBe('Something went wrong · Earthrise');
  });

  it('asks Next to try again with retry, and logs the error without printing it', () => {
    const { retry, log } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(crash);
    for (const secret of [DETAIL, 'd1g3st-7788']) expect(document.body.textContent).not.toContain(secret);
  });
});
