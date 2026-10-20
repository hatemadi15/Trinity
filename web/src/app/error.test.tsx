// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorPage from './error';

// What a crash in a server component carries to the browser: a message that can name a host or a file, and a digest.
const DETAIL = 'connect ECONNREFUSED 10.0.0.7:5432 while reading /srv/earthrise/data/sites.json';
const crash = Object.assign(new Error(DETAIL), { digest: 'd1g3st-7788' });

afterEach(() => {
  vi.restoreAllMocks();
});

/** Shows the page with the console quiet; the page logs the crash on purpose. */
function show(retry = vi.fn()) {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorPage error={crash} retry={retry} />);
  return { retry, log };
}

describe('error page', () => {
  it('says in plain words that something went wrong, with one button to try again', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Something went wrong.']);
    const main = screen.getByRole('main');
    expect(main.querySelector('p')!.textContent).toBe('Reload the page, or try again.');
    const buttons = within(main).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Try again']);
    expect(buttons[0].classList.contains('btn')).toBe(true);
  });

  it('asks Next to try again when "Try again" is pressed, with retry, which fetches the route afresh and then clears the error', () => {
    const { retry } = show();
    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('logs the error to the console and prints none of it on the page', () => {
    const { log } = show();
    expect(log).toHaveBeenCalledWith(crash);
    for (const secret of [DETAIL, 'ECONNREFUSED', '10.0.0.7', 'd1g3st-7788']) expect(document.body.textContent).not.toContain(secret);
  });

  it('keeps the usual frame: the header with its sections, the page and the footer', () => {
    show();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('sets every word at 14 px or more and uses no faint grey', () => {
    show();
    const main = screen.getByRole('main');
    expect(main.innerHTML).not.toMatch(/(?:^|[\s":])text-(?:xs|2xs)(?=[\s"])|text-\[(?:\d|1[0-3])px\]/);
    expect(main.querySelectorAll('.text-ink-3')).toHaveLength(0);
  });
});
